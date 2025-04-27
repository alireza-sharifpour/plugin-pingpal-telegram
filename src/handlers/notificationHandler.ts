import type { IAgentRuntime, Memory, Service } from "@elizaos/core";

import { logger } from "@elizaos/core";
import {} from "@elizaos/plugin-telegram";
/**
 * Escapes characters for Telegram MarkdownV2 format.
 * See: https://core.telegram.org/bots/api#markdownv2-style
 */
function escapeMarkdownV2(text: string): string {
  // Escape characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
  // Note: Characters must be escaped with a preceding '\'.
  return text.replace(/([_*[\\]()~`>#+\\-=|{}.!])/g, "\\$1");
}

/**
 * Sends a private notification message via Telegram.
 *
 * @param runtime - The agent runtime instance.
 * @param originalMessage - The original message memory object that triggered the notification.
 * @param reason - The reason why the message was deemed important by the LLM.
 */
export async function sendPrivateNotification(
  runtime: IAgentRuntime,
  originalMessage: Memory,
  reason: string
): Promise<void> {
  const elizaMessageId = originalMessage.id; // Use Eliza ID for consistent logging context
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
    const targetUserId = runtime.getSetting("pingpal.targetUserId") || 72849029;
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

    // 3. Fetch Context (Sender Username, Group Name)
    let senderUsername = "Unknown User";
    try {
      const senderEntity = await runtime.getEntityById(
        originalMessage.entityId
      );
      // Prioritize known name, then Telegram username
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
      senderUsername = "_Unknown User_"; // Use markdown for placeholder
    }

    let groupName = "Unknown Group";
    try {
      const room = await runtime.getRoom(originalMessage.roomId);
      groupName = escapeMarkdownV2(room?.name || "Unknown Group");
    } catch (e) {
      logger.warn(
        {
          error: e,
          agentId: runtime.agentId,
          originalElizaMessageId: elizaMessageId,
        },
        "[PingPal] Could not fetch room entity for notification."
      );
      groupName = "_Unknown Group_"; // Use markdown for placeholder
    }

    // 4. Format Notification Message (MarkdownV2)
    const originalText = escapeMarkdownV2(originalMessage.content?.text || "");
    const escapedReason = escapeMarkdownV2(reason);

    const notificationText = `*🔔 PingPal Alert \\(Important Mention\\)*\n\n*From:* ${senderUsername}\n*Group:* ${groupName}\n\n*Reason:* ${escapedReason}\n\n*Original Message:*\n\`\`\`\n${originalText}\n\`\`\`\n`; // --- Potential TODO: Add deeplink back to original message if possible/reliable ---

    // 5. Send Message
    logger.debug(
      {
        agentId: runtime.agentId,
        targetUserId: targetUserId,
        originalElizaMessageId: elizaMessageId,
        messageLength: notificationText.length,
      },
      "[PingPal] Attempting to send notification via Telegram service."
    );

    // await (telegramService as any).sendMessage(targetUserId, notificationText);

    // Access the nested method. Still using 'as any' temporarily because types are missing.
    if (
      telegramService &&
      (telegramService as any).bot?.telegram?.sendMessage
    ) {
      await (telegramService as any).bot.telegram.sendMessage(
        targetUserId,
        notificationText // Send the raw text
      );
    } else {
      // Log an error if the expected structure isn't found
      logger.error(
        {
          agentId: runtime.agentId,
          serviceObjectKeys: telegramService
            ? Object.keys(telegramService)
            : "null",
        },
        "[PingPal] Could not find nested bot.telegram.sendMessage function on Telegram service instance."
      );
      // Rethrow or handle the error appropriately
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
    console.log("Send Error", sendError);
    logger.error({
      error: sendError,
      agentId: runtime.agentId,
      targetUserId: runtime.getSetting("pingpal.targetUserId"), // Log target ID even on error
      originalElizaMessageId: elizaMessageId,
    });
  }
}
