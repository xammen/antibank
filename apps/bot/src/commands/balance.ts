import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { prisma } from "@antibank/db";

export const balance = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("voir ton solde antibank")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("voir le solde d'un autre joueur")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;

    const user = await prisma.user.findUnique({
      where: { discordId: targetUser.id },
    });

    if (!user) {
      await interaction.reply({
        content: `${targetUser.username} n'a pas de compte antibank. connecte-toi sur le site d'abord.`,
        ephemeral: true,
      });
      return;
    }

    const isOwnBalance = targetUser.id === interaction.user.id;
    const balanceStr = parseFloat(user.balance.toString()).toFixed(2);

    await interaction.reply({
      content: isOwnBalance
        ? `ton solde: **${balanceStr}e**`
        : `solde de ${targetUser.username}: **${balanceStr}e**`,
      ephemeral: isOwnBalance,
    });
  },
};
