import { Collection, SlashCommandBuilder, ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";

declare module "discord.js" {
  interface Client {
    commands: Collection<string, {
      data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
      execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    }>;
  }
}
