import type { Plugin, IAgentRuntime } from "@elizaos/core";
import { logger, EventType } from "@elizaos/core";
import { handleTelegramMessage } from "./handlers/messageHandler";
import { z } from "zod";
/**
 * Defines the configuration schema for a plugin, including the validation rules for the plugin name.
 *
 * @type {import('zod').ZodObject<{ EXAMPLE_PLUGIN_VARIABLE: import('zod').ZodString }>}
 */
const configSchema = z.object({
  EXAMPLE_PLUGIN_VARIABLE: z
    .string()
    .min(1, "Example plugin variable is not provided")
    .optional()
    .transform((val) => {
      if (!val) {
        logger.warn(
          "Example plugin variable is not provided (this is expected)"
        );
      }
      return val;
    }),
});

/**
 * Example HelloWorld action
 * This demonstrates the simplest possible action structure
 */
/**
 * Action representing a hello world message.
 * @typedef {Object} Action
 * @property {string} name - The name of the action.
 * @property {string[]} similes - An array of related actions.
 * @property {string} description - A brief description of the action.
 * @property {Function} validate - Asynchronous function to validate the action.
 * @property {Function} handler - Asynchronous function to handle the action and generate a response.
 * @property {Object[]} examples - An array of example inputs and expected outputs for the action.
 */

const pingPalTelegramPlugin: Plugin = {
  name: "pingpal-telegram",
  description: "Handles PingPal logic for Telegram mentions and notifications.",
  init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
    console.log("Initializing PingPal Telegram Plugin...");
    runtime.registerEvent(EventType.MESSAGE_RECEIVED, handleTelegramMessage);
    console.log("[PingPal] Registered MESSAGE_RECEIVED handler.");
  },
  actions: [
    /* Actions will be added here */
  ],
  providers: [],
  evaluators: [],
};

export default pingPalTelegramPlugin;
