import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";

const token = process.env.DISCORD_TOKEN!;
const clientId = process.env.DISCORD_CLIENT_ID!;
const guildId = process.env.GUILD_ID;

const rest = new REST().setToken(token);

const commandsData = commands.map((cmd) => cmd.data.toJSON());

async function deploy() {
  try {
    console.log(`[antibank] deploiement de ${commandsData.length} commandes...`);

    if (guildId) {
      // Guild-specific (instant, for dev)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commandsData,
      });
      console.log(`[antibank] commandes deployees sur le serveur ${guildId}`);
    } else {
      // Global (takes up to 1 hour)
      await rest.put(Routes.applicationCommands(clientId), {
        body: commandsData,
      });
      console.log("[antibank] commandes deployees globalement");
    }
  } catch (error) {
    console.error("[antibank] erreur deploiement:", error);
  }
}

deploy();
