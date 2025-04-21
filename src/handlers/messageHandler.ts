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

  // Task 6: Implement Mention Detection
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

    // Task 7: Duplicate check logic will be implemented here in a future task
    // Task 8-10: Analysis and notification logic will be added in future tasks
  }
}
