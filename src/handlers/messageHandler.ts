import type { IAgentRuntime, Memory, MessagePayload } from "@elizaos/core";
import { logger } from "@elizaos/core"; // Use Eliza's logger

export async function handleTelegramMessage(
  payload: MessagePayload
): Promise<void> {
  const { runtime, message } = payload;
  logger.debug(
    {
      agentId: runtime.agentId,
      roomId: message.roomId,
      messageId: message.id,
    },
    `[PingPal] Received message: ${message.content?.text}`
  );

  // Retrieve the configured target username from settings
  // const targetUsername = runtime.getSetting("pingpal.targetUsername");
  const targetUsername = "alireza7612";
  logger.debug(
    {
      agentId: runtime.agentId,
      roomId: message.roomId,
      messageId: message.id,
    },
    `[PingPal] Target username: ${targetUsername}`
  );
  // Retrieve the message text safely
  const messageText = message.content?.text || "";

  // Check for the mention of the target username
  const mentionDetected = targetUsername
    ? messageText.toLowerCase().includes("@" + targetUsername.toLowerCase())
    : false;

  // Log if a mention is detected
  if (mentionDetected) {
    logger.info(
      {
        agentId: runtime.agentId,
        roomId: message.roomId,
        messageId: message.id,
        mentionDetected: mentionDetected,
        messageText: messageText,
      },
      "[PingPal] Mention detected for target user."
    );

    // Get the original Telegram Message ID
    // Using any to bypass TypeScript property check since we know this property exists in Telegram messages
    const originalMessageId = (message.metadata as any)?.originalMessageId as
      | string
      | undefined;

    console.log("originalMessageId", originalMessageId);

    // Check if the originalMessageId exists
    if (!originalMessageId) {
      logger.warn("[PingPal] Could not find original Telegram message ID.");
      return;
    }

    // Query the database to check if this message has already been processed
    try {
      // Use a type field to help with querying instead of relying on metadata.originalMessageId directly
      const existing = await runtime.getMemories({
        tableName: "pingpal_processed_mentions",

        agentId: runtime.agentId, // Ensure we only check logs for this agent
        roomId: message.roomId, // Scope check to the room
        count: 1,
      });

      // Filter the results manually since we can't query directly on metadata fields
      const isDuplicate =
        existing &&
        existing.some((mem) => {
          // Use any type to bypass TypeScript property checks
          const meta = mem.metadata as any;
          return (
            meta &&
            meta.type === "pingpal_processed_mention" &&
            meta.originalMessageId === originalMessageId
          );
        });

      if (isDuplicate) {
        logger.info(
          { originalMessageId },
          "[PingPal] Duplicate mention detected. Skipping processing."
        );
        return; // Stop processing if already handled
      }

      // If check passes (no duplicate found), log that this is a new mention
      logger.info(
        { originalMessageId },
        "[PingPal] New mention detected. Proceeding to analysis."
      );
    } catch (dbError) {
      logger.error(
        { error: dbError, originalMessageId },
        "[PingPal] Error checking for duplicate mentions."
      );
      // Stop on DB error for MVP
      return;
    }
  }
}
