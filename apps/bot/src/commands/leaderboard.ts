import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "@antibank/db";

export const leaderboard = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Afficher le classement des fortunes AntiBank"),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

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

    const totalMoney = await prisma.$queryRaw<[{ total: string }]>`
      SELECT COALESCE(SUM(balance), 0)::text as total FROM "User" WHERE "isBanned" = false
    `;

    const medals = ["🥇", "🥈", "🥉"];
    let desc = "";
    
    for (let i = 0; i < top10.length; i++) {
      const user = top10[i];
      const balance = parseFloat(user.balance.toString()).toFixed(2);
      const isMe = user.discordId === interaction.user.id;
      const prefix = i < 3 ? medals[i] : `\`#${i + 1}\``;
      
      desc += `${prefix} **${user.discordUsername}**${isMe ? " ◂" : ""} — \`${balance} €\`\n`;
    }

    const rank = Number(userRank[0]?.rank || 0);
    if (rank > 10 && userBalance) {
      const balance = parseFloat(userBalance.balance.toString()).toFixed(2);
      desc += `\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
      desc += `\`#${rank}\` **${interaction.user.username}** ◂ — \`${balance} €\``;
    }

    const embed = new EmbedBuilder()
      .setTitle("🏦 Classement AntiBank")
      .setDescription(desc || "*Aucun joueur enregistré.*")
      .setColor(0x2b2d31)
      .setFooter({ text: `💵 ${parseFloat(totalMoney[0]?.total || "0").toFixed(2)} € en circulation` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
