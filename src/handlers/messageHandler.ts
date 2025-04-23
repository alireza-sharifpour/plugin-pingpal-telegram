import type { IAgentRuntime, Memory, MessagePayload } from "@elizaos/core";
import { logger, ModelType, parseJSONObjectFromText } from "@elizaos/core"; // Use Eliza's logger, ADDED ModelType, parseJSONObjectFromText

// Define performMentionAnalysis stub here
// We'll pass the full message object to it.
async function performMentionAnalysis(
  runtime: IAgentRuntime,
  message: Memory // The full message object received
): Promise<void> {
  // Get the Eliza ID for logging/persistence within this function
  const elizaMessageId = message.id;

  logger.info(
    {
      agentId: runtime.agentId,
      roomId: message.roomId,
      elizaMessageId: elizaMessageId, // Log the ID being used for analysis/persistence
    },
    "[PingPal] Performing mention analysis (using Eliza internal message ID)..."
  );

  // --- Start: LLM Analysis Call ---

  const messageText = message.content?.text || "";
  const targetUsername =
    runtime.getSetting("pingpal.targetUsername") || "alireza7612"; // Reuse logic from handler

  // Optional: Enhance prompt with sender/group context
  let senderName = "Unknown User";
  try {
    const senderEntity = await runtime.getEntityById(message.entityId);
    console.log("senderEntity", senderEntity);
    senderName =
      senderEntity?.names[0] ||
      senderEntity?.metadata?.telegram?.username ||
      senderName;
    console.log("senderName", senderName);
  } catch (e) {
    logger.warn(
      { error: e },
      "[PingPal] Could not fetch sender entity for prompt."
    );
  }

  let groupName = "Unknown Group";
  try {
    const room = await runtime.getRoom(message.roomId);
    groupName = room?.name || groupName;
    console.log("groupName", groupName, room);
  } catch (e) {
    logger.warn(
      { error: e },
      "[PingPal] Could not fetch room entity for prompt."
    );
  }

  // Construct the LLM prompt
  const llmPrompt = `You are an assistant helping '${targetUsername}' filter Telegram group messages. Analyze the following message sent by '${senderName}' in the group '${groupName}'. Determine if this message requires '${targetUsername}'s urgent attention or action. Consider keywords like 'urgent', 'action needed', 'deadline', 'blocker', 'ping', 'help', direct questions to '${targetUsername}', or tasks assigned.

Respond ONLY with a JSON object matching this schema:
{
  "type": "object",
  "properties": {
    "important": { "type": "boolean", "description": "True if the message requires urgent attention or action by ${targetUsername}, false otherwise." },
    "reason": { "type": "string", "description": "A brief justification for the importance classification (1-2 sentences)." }
  },
  "required": ["important", "reason"]
}

Message Text:
"${messageText}"`;

  // Define the expected JSON output schema
  const outputSchema = {
    type: "object",
    properties: {
      important: {
        type: "boolean",
        description:
          "Is this message important/actionable for the mentioned user?",
      },
      reason: {
        type: "string",
        description: "Brief explanation for importance classification.",
      },
    },
    required: ["important", "reason"],
  };

  let analysisResult: { important: boolean; reason: string } | null = null;
  try {
    logger.debug(
      { agentId: runtime.agentId, prompt: llmPrompt },
      "[PingPal] Calling LLM for analysis..."
    );
    const rawResponse = await runtime.useModel(ModelType.OBJECT_LARGE, {
      prompt: llmPrompt,
      schema: outputSchema,
    });

    // OBJECT_LARGE should return the parsed object directly if successful
    // Add checks for robustness
    if (
      typeof rawResponse === "object" &&
      rawResponse !== null &&
      typeof (rawResponse as any).important === "boolean" &&
      typeof (rawResponse as any).reason === "string"
    ) {
      analysisResult = rawResponse as { important: boolean; reason: string };
    } else if (typeof rawResponse === "string") {
      // Fallback if it returned a string that might be JSON
      logger.warn("[PingPal] LLM returned a string, attempting to parse JSON.");
      const parsed = parseJSONObjectFromText(rawResponse);
      // Explicitly check if the parsed object matches the expected structure
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.important === "boolean" &&
        typeof parsed.reason === "string"
      ) {
        analysisResult = parsed as { important: boolean; reason: string };
      } else {
        // If parsing fails or doesn't match, treat as an error case
        throw new Error(
          `Parsed JSON from string did not match expected format. Parsed: ${JSON.stringify(parsed)}`
        );
      }
    }

    // Final validation after parsing or direct assignment
    if (
      !analysisResult ||
      typeof analysisResult.important === "undefined" ||
      typeof analysisResult.reason === "undefined"
    ) {
      throw new Error(
        `LLM response was not in the expected format. Raw response: ${JSON.stringify(rawResponse)}`
      );
    }

    logger.info(
      { analysisResult, agentId: runtime.agentId },
      "[PingPal] LLM Analysis successful."
    );
  } catch (llmError) {
    logger.error(
      { error: llmError, agentId: runtime.agentId },
      "[PingPal] LLM analysis failed."
    );
    // Default to not important on error to avoid spamming notifications
    analysisResult = { important: false, reason: "LLM analysis failed." };
  }

  // Here we will use 'analysisResult' and 'elizaMessageId' to log the processed mention.
  logger.debug(
    { analysisResult, elizaMessageId },
    "[PingPal] Analysis complete. Ready for (Logging)."
  );

  // Here we will check analysisResult.important and call notification logic if true
  logger.debug({ analysisResult }, "[PingPal] Ready for (Notification Check).");
  // --- End ---
}

export async function handleTelegramMessage(
  payload: MessagePayload
): Promise<void> {
  const { runtime, message } = payload;
  logger.debug(
    {
      agentId: runtime.agentId,
      roomId: message.roomId,
      messageId: message.id, // This is Eliza's internal message ID
    },
    `[PingPal] Received message: ${message.content?.text}`
  );

  // Retrieve the configured target username from settings
  const targetUsernameSetting = runtime.getSetting("pingpal.targetUsername");
  // Using hardcoded value for now based on previous context
  const targetUsername = targetUsernameSetting || "alireza7612";

  logger.debug(
    {
      agentId: runtime.agentId,
      targetUsername: targetUsername,
    },
    `[PingPal] Target username configured as: ${targetUsername}`
  );

  // Retrieve the message text safely
  const messageText = message.content?.text || "";

  // Check for the mention of the target username (case-insensitive)
  const mentionDetected = targetUsername
    ? messageText.toLowerCase().includes("@" + targetUsername.toLowerCase())
    : false;

  // Log if a mention is detected
  if (mentionDetected) {
    // --- WORKAROUND ---
    // Ideally, we'd use message.metadata.sourceId to get the original Telegram message ID
    // for robust deduplication. However, it appears the current version of @elizaos/plugin-telegram
    // is not populating this field (or the metadata field itself) in the Memory object it creates.
    // As a fallback, we'll use Eliza's internal Memory ID (message.id) for deduplication.
    // Limitation: This only prevents processing the *exact same Memory object* multiple times.
    // It might not prevent reprocessing the same *original Telegram message* if the event fires
    // multiple times (e.g., after a restart).
    const elizaMessageId = message.id; // Use Eliza's internal unique ID for this memory object

    logger.info(
      {
        agentId: runtime.agentId,
        roomId: message.roomId,
        elizaMessageId: elizaMessageId, // Log the ID being used
        mentionDetected: mentionDetected,
        messageText: messageText,
      },
      "[PingPal] Mention detected for target user."
    );

    // Check if the elizaMessageId exists (it always should for a valid Memory object)
    if (!elizaMessageId) {
      // This would be very unusual if 'message' is a valid Memory object
      logger.error(
        {
          agentId: runtime.agentId,
          roomId: message.roomId,
          messageObject: message, // Log the whole object for debugging
        },
        "[PingPal] Could not find internal Eliza message ID (message.id). This is unexpected."
      );
      return;
    }

    // Query the database to check if this Eliza message ID has already been processed
    try {
      // Fetch recent processed mention logs for this room/agent
      const existing = await runtime.getMemories({
        tableName: "pingpal_processed_mentions", // The table where *we* store processing logs
        agentId: runtime.agentId, // Ensure we only check logs for this agent
        roomId: message.roomId, // Scope check to the room
        count: 50, // Fetch a reasonable number of recent logs to filter manually
      });

      // Filter the results manually. We need to check the custom metadata field
      // where *we will store* the Eliza ID in persistence logic.
      const isDuplicate = existing.some((mem) => {
        // Check if it's our specific log type AND if our custom ID field matches
        return (
          mem.metadata?.type === "pingpal_processed_mention" &&
          (mem.metadata as any)?.processedElizaMessageId === elizaMessageId
        );
      });

      if (isDuplicate) {
        logger.info(
          { elizaMessageId, agentId: runtime.agentId, roomId: message.roomId },
          "[PingPal] Duplicate mention detected based on processed logs (using Eliza ID). Skipping processing."
        );
        return; // Stop processing if already handled
      }

      // If check passes (no duplicate found), log that this is a new mention
      logger.info(
        { elizaMessageId, agentId: runtime.agentId, roomId: message.roomId },
        "[PingPal] New mention detected (using Eliza ID). Proceeding to analysis."
      );

      // Call the analysis function for new mentions, passing the original message object
      await performMentionAnalysis(runtime, message);
    } catch (dbError) {
      logger.error(
        {
          error: dbError,
          elizaMessageId,
          agentId: runtime.agentId,
          roomId: message.roomId,
        },
        "[PingPal] Error checking for duplicate mentions (using Eliza ID)."
      );
      // Stop on DB error for MVP
      return;
    }
  } else {
    logger.debug(
      {
        agentId: runtime.agentId,
        roomId: message.roomId,
        messageId: message.id,
        messageText: messageText.substring(0, 50) + "...", // Log snippet for context
      },
      "[PingPal] Message received, but no mention of target user found."
    );
  }
}
