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

  // Mention detection & processing logic will go here later
}
