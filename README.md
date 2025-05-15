# PingPal Telegram Plugin for ElizaOS

The `pingpal-telegram` plugin is a component for [ElizaOS](https://elizaos.github.io/eliza/) designed to help users manage Telegram notification overload. It monitors specified Telegram groups for mentions of a designated target user, analyzes the importance of these mentions using a Language Model (LLM), and delivers private notifications only for critical messages.

## Features

- **Telegram Group Monitoring**: Actively listens to messages in Telegram groups where the bot (agent) is a member.
- **Targeted Mention Detection**: Identifies mentions of a pre-configured `targetUsername`.
- **LLM-Powered Importance Analysis**: Leverages an LLM (e.g., OpenAI, Anthropic) via ElizaOS's `runtime.useModel` to determine if a mention is important or actionable for the target user.
- **Private Notifications**: Sends direct messages via Telegram to the configured `targetUserId` for messages classified as important.
- **Deduplication**: Prevents sending multiple notifications for the exact same message instance.
- **Configurable**: Key parameters like API tokens, target user details, and LLM settings are configurable through environment variables and ElizaOS character settings.

## How it Works

1.  The plugin, integrated into an ElizaOS agent, uses `@elizaos/plugin-telegram` to receive messages from Telegram groups.
2.  When a message is received (`EventType.MESSAGE_RECEIVED`), the `handleTelegramMessage` handler checks if the configured `targetUsername` (e.g., `alireza7612`) is mentioned.
3.  If a new, unprocessed mention is detected, the `performMentionAnalysis` function is invoked.
    - Deduplication is handled by logging processed message IDs to the ElizaOS database (PGLite via `@elizaos/plugin-sql`) using `runtime.createMemory` and checking with `runtime.getMemories` against a custom table type (`pingpal_telegram_processed`).
4.  An LLM is called via `runtime.useModel` with a prompt asking it to classify the message's importance for the target user and provide a reason, expecting a JSON response like `{"important": boolean, "reason": string}`.
5.  If the LLM deems the message important, the `sendPrivateNotification` function formats a notification.
6.  The notification (including the original message, sender, group, and LLM's reason) is sent as a private Telegram message to the `targetUserId` using the Telegram service provided by `@elizaos/plugin-telegram`.

## Prerequisites

Before using this plugin, ensure you have:

- An existing [ElizaOS](https://elizaos.github.io/eliza/) project setup.
- [Node.js](https://nodejs.org/) (v23.3.0+ recommended, as per ElizaOS docs).
- [Bun](https://bun.sh/) installed.
- The [ElizaOS CLI](https://elizaos.github.io/eliza/docs/category/cli) installed globally (e.g., `npm install -g @elizaos/cli@beta`).
- A Telegram Bot Token for the bot you intend to run.
- An API key for your chosen LLM provider (e.g., OpenAI, Anthropic).
- The numerical Telegram User ID of the person who should receive the private notifications.

## Setup and Configuration

Follow these steps to integrate and configure the `pingpal-telegram` plugin in your ElizaOS project:

**1. Obtain the Plugin Code**

Clone this repository or install it if it's published as an npm package.

```bash
git clone https://github.com/your-repo-path/plugin-pingpal-telegram.git # Or your fork
```

**2. Install Plugin Dependencies (if cloned locally)**

Navigate to the plugin's directory and install its dependencies:

```bash
cd path/to/plugin-pingpal-telegram
bun install
```

**3. Link the Plugin to Your ElizaOS Project (if cloned locally)**

- In the `plugin-pingpal-telegram` directory:
  ```bash
  bun link
  ```
- In your main ElizaOS project's root directory:
  `bash
bun link pingpal-telegram
`
  If you've installed it as a package, ensure it's listed in your main project's `package.json` and installed.

**4. Install Required Peer Plugins in Your Main ElizaOS Project**

Before configuring your agent, ensure that the necessary peer plugins, `@elizaos/plugin-telegram` and `@elizaos/plugin-sql`, are installed in your main ElizaOS project. These are essential for the `pingpal-telegram` plugin to function.

Navigate to your main ElizaOS project's root directory and run:

```bash
# In your main ElizaOS project directory
bun add @elizaos/plugin-telegram @elizaos/plugin-sql
```

This command will add them to your project's `package.json` and install them.

**5. Configure Your Agent's Character (`src/index.ts` in your main ElizaOS project)**

Modify your agent's character definition to include this plugin and its dependencies, along with necessary settings:

```typescript
import type {
  Character,
  Project,
  ProjectAgent,
  IAgentRuntime,
} from "@elizaos/core";
// Assuming plugin-pingpal-telegram is linked or installed as a dependency
import pingPalTelegramPlugin from "pingpal-telegram";
// Required peer plugins
// import telegramPlugin from '@elizaos/plugin-telegram'; // ElizaOS often auto-loads registered plugins
// import sqlPlugin from '@elizaos/plugin-sql';

export const character: Character = {
  name: "MyPingPalEnabledAgent",
  plugins: [
    "@elizaos/plugin-telegram", // For Telegram connectivity
    "@elizaos/plugin-sql", // For database operations (deduplication)
    pingPalTelegramPlugin, // This PingPal plugin
  ],
  settings: {
    // Secrets for API keys - will be sourced from .env
    secrets: {
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY, // Or ANTHROPIC_API_KEY, etc.
    },
    // Configuration for the @elizaos/plugin-sql
    sql: {
      adapter: "pglite", // Using PGLite for simple setup
      // connectionString: "pglite://data/mydb.pglite" // Optional: specify path
    },
    // Configuration specific to the pingpal-telegram plugin
    pingpal: {
      // The Telegram username (without '@') of the user to monitor for mentions.
      targetUsername: "your_telegram_username_to_monitor",
      // The numerical Telegram User ID of the user who will receive private notifications.
      targetUserId: "YOUR_NUMERICAL_TELEGRAM_USER_ID",
    },
    // Optional: LLM model selection (defaults are used if not specified)
    // models: {
    //   default: ModelType.OBJECT_SMALL // As used in messageHandler.ts
    // }
  },
  bio: [
    "I monitor Telegram groups for important mentions and notify my target user.",
  ],
  // ... other character properties (style, etc.)
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => {
    console.log(
      "Initializing agent with PingPal capabilities:",
      character.name
    );
    // You can access plugin settings here for validation if needed:
    // const targetUser = runtime.getSetting('pingpal.targetTelegramUserName');
    // console.log('PingPal will monitor for:', targetUser);
  },
};

const project: Project = {
  agents: [projectAgent],
};

export default project;
```

**6. Create/Update Environment Variables (`.env` file)**

In the root directory of your main ElizaOS project, create or update the `.env` file:

```env
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN_HERE
OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE
PINGPAL_TARGET_TELEGRAM_USERID=TELEGRAM_TARGET_USER_ID_HERE
PINGPAL_TARGET_TELEGRAM_USERNAME=TELEGRAM_USERNAME_HERE
# Or ANTHROPIC_API_KEY=YOUR_ANTHROPIC_KEY_HERE, etc., based on your LLM choice
```

ElizaOS will automatically load these.

**7. Crucial: Target User Interaction with Bot**

The Telegram user specified by `pingpal.targetTelegramUserId` **MUST** initiate a conversation with your Telegram bot (e.g., send `/start` or any message) _at least once_ after the bot is running. This is a Telegram API requirement that allows the bot to send private messages to that user.

**8. Install Dependencies in Your Main ElizaOS Project**

Navigate to your main ElizaOS project's root directory and run:

```

```
