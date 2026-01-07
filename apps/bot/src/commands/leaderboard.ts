import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "@antibank/db";

export const leaderboard = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("voir le classement des plus riches"),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    // Top 10 + position de l'user
    const top10 = await prisma.user.findMany({
      where: { isBanned: false },
      orderBy: { balance: "desc" },
      take: 10,
      select: {
        discordId: true,
        discordUsername: true,
        balance: true,
      },
    });

    // Position de l'user qui fait la commande
    const userRank = await prisma.$queryRaw<[{ rank: bigint }]>`
      SELECT COUNT(*) + 1 as rank
      FROM "User"
      WHERE balance > (
        SELECT balance FROM "User" WHERE "discordId" = ${interaction.user.id}
      )
      AND "isBanned" = false
    `;

    const userBalance = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      select: { balance: true },
    });

    // Construire le leaderboard
    let description = "";
    for (let i = 0; i < top10.length; i++) {
      const user = top10[i];
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      const balance = parseFloat(user.balance.toString()).toFixed(2);
      const isMe = user.discordId === interaction.user.id;
      
      description += `${medal} **${user.discordUsername}** - ${balance}€${isMe ? " ← toi" : ""}\n`;
    }

    // Ajouter la position de l'user s'il n'est pas dans le top 10
    const rank = Number(userRank[0]?.rank || 0);
    if (rank > 10 && userBalance) {
      const balance = parseFloat(userBalance.balance.toString()).toFixed(2);
      description += `\n---\n${rank}. **${interaction.user.username}** - ${balance}€ ← toi`;
    }

    const embed = new EmbedBuilder()
      .setTitle("classement antibank")
      .setDescription(description || "personne n'a d'argent")
      .setColor(0x0a0a0a)
      .setFooter({ text: "antibank corp" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
