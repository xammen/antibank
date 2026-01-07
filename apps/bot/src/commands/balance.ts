import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "@antibank/db";

export const balance = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Consulter un solde AntiBank")
    .addUserOption((option) =>
      option
        .setName("joueur")
        .setDescription("Le joueur à consulter")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("joueur") || interaction.user;

    const user = await prisma.user.findUnique({
      where: { discordId: targetUser.id },
      select: {
        balance: true,
        dahkaCoins: true,
      }
    });

    if (!user) {
      await interaction.reply({
        content: `**${targetUser.username}** n'a pas de compte AntiBank.`,
        ephemeral: true,
      });
      return;
    }

    const isOwnBalance = targetUser.id === interaction.user.id;
    const balance = parseFloat(user.balance.toString());
    const dahkaCoins = parseFloat(user.dahkaCoins.toString());

    const embed = new EmbedBuilder()
      .setAuthor({ 
        name: targetUser.username, 
        iconURL: targetUser.displayAvatarURL() 
      })
      .setColor(0x2b2d31)
      .addFields(
        { name: "💵 Solde", value: `\`${balance.toFixed(2)} €\``, inline: true }
      );

    if (dahkaCoins > 0) {
      embed.addFields(
        { name: "💎 DahkaCoin", value: `\`${dahkaCoins.toFixed(4)} DC\``, inline: true }
      );
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: isOwnBalance,
    });
  },
};
