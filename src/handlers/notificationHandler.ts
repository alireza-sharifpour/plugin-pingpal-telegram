import type { IAgentRuntime, Memory } from "@elizaos/core";
import { logger } from "@elizaos/core";

/**
 * Escapes characters for Telegram MarkdownV2 format.
 * See: [Telegram Bot API - MarkdownV2 Style](https://core.telegram.org/bots/api#markdownv2-style)
 */
function escapeMarkdownV2(text: string): string {
  // Escape characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
  // Note: Characters must be escaped with a preceding '\'.
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

/**
 * Sends a private notification message via Telegram.
 *
 * @param runtime - The agent runtime instance.
 * @param originalMessage - The original message Memory object that triggered the notification.
 * @param reason - The reason why the message was deemed important by the LLM.
 */
export async function sendPrivateNotification(
  runtime: IAgentRuntime,
  originalMessage: Memory,
  reason: string
): Promise<void> {
  const elizaMessageId = originalMessage.id;
  logger.info(
    {
      agentId: runtime.agentId,
      roomId: originalMessage.roomId,
      originalElizaMessageId: elizaMessageId,
      reason: reason,
    },
    "[PingPal] Preparing to send private notification..."
  );

  try {
    // 1. Get Telegram Service
    const telegramService = runtime.getService("telegram");

    if (!telegramService) {
      logger.error(
        {
          agentId: runtime.agentId,
          originalElizaMessageId: elizaMessageId,
        },
        "[PingPal] Telegram service not found. Cannot send notification."
      );
      return;
    }

    // 2. Get Target User ID
    const targetUserId =
      runtime.getSetting("pingpal.targetTelegramUserId") ||
      process.env.PINGPAL_TARGET_TELEGRAM_USERID;
    if (!targetUserId) {
      logger.error(
        {
          agentId: runtime.agentId,
          originalElizaMessageId: elizaMessageId,
        },
        "[PingPal] Target User ID not configured. Cannot send notification."
      );
      return;
    }

    // 3. Fetch Context (Sender Username, Group Name, Channel ID)
    let senderUsername = "Unknown User";
    try {
      const senderEntity = await runtime.getEntityById(
        originalMessage.entityId
      );
      senderUsername = escapeMarkdownV2(
        senderEntity?.names[0] ||
          senderEntity?.metadata?.telegram?.username ||
          "Unknown User"
      );
    } catch (e) {
      logger.warn(
        {
          error: e,
          agentId: runtime.agentId,
          originalElizaMessageId: elizaMessageId,
        },
        "[PingPal] Could not fetch sender entity for notification."
      );
      senderUsername = "_Unknown User_";
    }

    let groupName = "Unknown Group";
    let telegramChannelUsername: string | null = null;
    let telegramChannelId: string | null = null;
    let roomNameFetchedFromDB = false;

    try {
      const room = await runtime.getRoom(originalMessage.roomId);
      console.log("RoomData1", room);
      if (room) {
        telegramChannelId = room.channelId || null; // Get channelId FROM the Room object

        if (room.name) {
          groupName = escapeMarkdownV2(room.name);
          roomNameFetchedFromDB = true;
        }
      }
    } catch (e) {
      logger.warn(
        { error: e, agentId: runtime.agentId, roomId: originalMessage.roomId },
        "[PingPal] Could not fetch room entity for notification context."
      );
      groupName = "_Fetch Error_";
    }

    // 4. Dynamic Fetch Fallback (Name from Telegram API if not in DB)
    if (
      !roomNameFetchedFromDB &&
      telegramChannelId &&
      telegramService &&
      (telegramService as any).bot?.telegram?.getChat
    ) {
      logger.info(
        { channelId: telegramChannelId },
        "[PingPal] Room name missing from DB, attempting direct fetch..."
      );
      try {
        const chatIdNum = parseInt(telegramChannelId, 10);
        if (!isNaN(chatIdNum)) {
          const chatInfo = await (telegramService as any).bot.telegram.getChat(
            chatIdNum
          );
          console.log("chatInfo", chatInfo);
          if (chatInfo && "title" in chatInfo && chatInfo.title) {
            groupName = escapeMarkdownV2(chatInfo.title);
            telegramChannelUsername = chatInfo.username || null;
            console.log("telegramChannelUsername", telegramChannelUsername);
            // Optional: Update the room in the database.
            // try {
            //   await runtime.updateRoom({ id: originalMessage.roomId, name: chatInfo.title });
            // } catch (updateError) {
            //   logger.warn({error: updateError}, "[PingPal] Failed to update room name in DB after fetching.")
            // }
          } else {
            logger.warn("[PingPal] Fetched chat info did not contain a title.");
            groupName = "_Unknown Group_";
          }
        } else {
          logger.warn(
            { channelId: telegramChannelId },
            "[PingPal] Room channelId is not a valid number."
          );
          groupName = "_Invalid ChannelID_";
        }
      } catch (fetchError) {
        logger.warn(
          { error: fetchError, channelId: telegramChannelId },
          "[PingPal] Failed to fetch chat info directly from Telegram."
        );
        groupName = "_Fetch Failed_";
      }
    } else if (!roomNameFetchedFromDB) {
      groupName = "_Unknown Group_"; // Fallback if no channelId or fetch fails
    }

    // 5. Format Notification Message (MarkdownV2) - Using colon for simplicity and reliability.
    const originalText = escapeMarkdownV2(originalMessage.content?.text || "");
    const escapedReason = escapeMarkdownV2(reason);

    const telegramGroupLink = `https://t.me/${telegramChannelUsername}`;
    const notificationText = `*🔔 PingPal Alert: Important Mention*\n\n*From:* ${senderUsername}\n*Group:* ${groupName}\n\n*Reason:* ${escapedReason}\n\n*Original Message:*\n\`\`\`\n${originalText}\n\`\`\`\n ${telegramChannelUsername ? `Here is the link to the group: ${telegramGroupLink}` : ""}`;

    // 6. Send Message
    logger.debug(
      {
        agentId: runtime.agentId,
        targetUserId: targetUserId,
        originalElizaMessageId: elizaMessageId,
        messageLength: notificationText.length,
      },
      "[PingPal] Attempting to send notification via Telegram service."
    );

    if (
      telegramService &&
      (telegramService as any).bot?.telegram?.sendMessage
    ) {
      // Send as PLAIN TEXT - Simplest and most reliable.  Remove the `parse_mode`.
      await (telegramService as any).bot.telegram.sendMessage(
        targetUserId,
        notificationText
        // Remove: { parse_mode: "MarkdownV2" }
      );
      //  Alternative (if you REALLY want MarkdownV2, use escaped parens and add parse_mode):
      //  await (telegramService as any).bot.telegram.sendMessage(
      //     targetUserId,
      //     notificationText.replace(/\(Important Mention\)/g, "\\(Important Mention\\)"),
      //     { parse_mode: "MarkdownV2" }
      //   );
    } else {
      logger.error(
        {
          agentId: runtime.agentId,
          serviceObjectKeys: telegramService
            ? Object.keys(telegramService)
            : "null",
        },
        "[PingPal] Could not find nested bot.telegram.sendMessage function on Telegram service instance."
      );
      throw new Error("Telegram service structure unexpected.");
    }

    logger.info(
      {
        agentId: runtime.agentId,
        targetUserId: targetUserId,
        originalElizaMessageId: elizaMessageId,
      },
      "[PingPal] Private notification sent successfully."
    );
  } catch (sendError) {
    console.error("Send Error", sendError); // Use console.error for actual errors
    logger.error({
      error: sendError,
      agentId: runtime.agentId,
      targetUserId:
        runtime.getSetting("pingpal.targetTelegramUserId") ||
        process.env.PINGPAL_TARGET_TELEGRAM_USERID,
      originalElizaMessageId: elizaMessageId,
    });
  }
}
