import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "@antibank/db";

export const stats = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Consulter les statistiques d'un joueur")
    .addUserOption((option) =>
      option
        .setName("joueur")
        .setDescription("Le joueur à consulter")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("joueur") || interaction.user;
    
    await interaction.deferReply();

    const user = await prisma.user.findUnique({
      where: { discordId: targetUser.id },
      select: {
        id: true,
        balance: true,
        dahkaCoins: true,
        totalVoiceMinutes: true,
        voiceStreak: true,
        createdAt: true,
      }
    });

    if (!user) {
      await interaction.editReply({ content: `**${targetUser.username}** n'a pas de compte AntiBank.` });
      return;
    }

    const robberyStats = await prisma.$queryRaw<[{
      totalRobberies: bigint;
      successfulRobberies: bigint;
      totalStolen: string | null;
      totalLost: string | null;
      timesRobbed: bigint;
    }]>`
      SELECT 
        COUNT(*) FILTER (WHERE "robberId" = ${user.id}) as "totalRobberies",
        COUNT(*) FILTER (WHERE "robberId" = ${user.id} AND success = true) as "successfulRobberies",
        COALESCE(SUM(amount) FILTER (WHERE "robberId" = ${user.id} AND success = true), 0)::text as "totalStolen",
        COALESCE(SUM(amount) FILTER (WHERE "robberId" = ${user.id} AND success = false), 0)::text as "totalLost",
        COUNT(*) FILTER (WHERE "victimId" = ${user.id}) as "timesRobbed"
      FROM "Robbery"
      WHERE "robberId" = ${user.id} OR "victimId" = ${user.id}
    `;

    const crashStats = await prisma.$queryRaw<[{ games: bigint; totalProfit: string | null }]>`
      SELECT 
        COUNT(*) as games,
        COALESCE(SUM(profit), 0)::text as "totalProfit"
      FROM "CrashBet"
      WHERE "userId" = ${user.id}
    `;

    const bountyStats = await prisma.$queryRaw<[{
      bountiesPosted: bigint;
      bountiesClaimed: bigint;
    }]>`
      SELECT
        COUNT(*) FILTER (WHERE "posterId" = ${user.id}) as "bountiesPosted",
        COUNT(*) FILTER (WHERE "claimerId" = ${user.id}) as "bountiesClaimed"
      FROM "Bounty"
      WHERE "posterId" = ${user.id} OR "claimerId" = ${user.id}
    `;

    const warnStats = await prisma.$queryRaw<[{
      warnsReceived: bigint;
      foundGuilty: bigint;
    }]>`
      SELECT
        COUNT(*) FILTER (WHERE "accusedId" = ${user.id}) as "warnsReceived",
        COUNT(*) FILTER (WHERE "accusedId" = ${user.id} AND status = 'guilty') as "foundGuilty"
      FROM "WarnVote"
      WHERE "accusedId" = ${user.id}
    `;

    const balance = parseFloat(user.balance.toString());
    const dahkaCoins = parseFloat(user.dahkaCoins.toString());
    
    const rStats = robberyStats[0];
    const totalRobberies = Number(rStats.totalRobberies);
    const successfulRobberies = Number(rStats.successfulRobberies);
    const successRate = totalRobberies > 0 ? Math.round((successfulRobberies / totalRobberies) * 100) : 0;
    const crashProfit = parseFloat(crashStats[0].totalProfit || "0");

    const embed = new EmbedBuilder()
      .setAuthor({ 
        name: targetUser.username, 
        iconURL: targetUser.displayAvatarURL() 
      })
      .setColor(0x2b2d31)
      .addFields(
        {
          name: "💰 Fortune",
          value: `\`${balance.toFixed(2)} €\`${dahkaCoins > 0 ? ` • \`${dahkaCoins.toFixed(4)} DC\`` : ""}`,
          inline: true
        },
        {
          name: "📅 Membre depuis",
          value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`,
          inline: true
        },
        {
          name: "🎙️ Vocal",
          value: `\`${user.totalVoiceMinutes}\` min • Streak \`${user.voiceStreak}j\``,
          inline: true
        },
        {
          name: "🔫 Braquages",
          value: [
            `Réussis : \`${successfulRobberies}/${totalRobberies}\` (${successRate}%)`,
            `Butin : \`${parseFloat(rStats.totalStolen || "0").toFixed(2)} €\``,
            `Pertes : \`${parseFloat(rStats.totalLost || "0").toFixed(2)} €\``,
            `Fois braqué : \`${Number(rStats.timesRobbed)}\``
          ].join("\n"),
          inline: true
        },
        {
          name: "🎰 Casino",
          value: [
            `Crash : \`${Number(crashStats[0].games)}\` parties`,
            `Profit : \`${crashProfit >= 0 ? "+" : ""}${crashProfit.toFixed(2)} €\``
          ].join("\n"),
          inline: true
        },
        {
          name: "⚖️ Social",
          value: [
            `Primes posées : \`${Number(bountyStats[0].bountiesPosted)}\``,
            `Primes claim : \`${Number(bountyStats[0].bountiesClaimed)}\``,
            `Warns reçus : \`${Number(warnStats[0].warnsReceived)}\` (${Number(warnStats[0].foundGuilty)} coupable)`
          ].join("\n"),
          inline: true
        }
      )
      .setFooter({ text: "AntiBank" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
