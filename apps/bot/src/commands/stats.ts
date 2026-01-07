import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "@antibank/db";

export const stats = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("voir les stats d'un joueur")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("le joueur (toi par defaut)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    
    await interaction.deferReply();

    const user = await prisma.user.findUnique({
      where: { discordId: targetUser.id },
      select: {
        id: true,
        balance: true,
        dahkaCoins: true,
        dcAvgBuyPrice: true,
        clicksToday: true,
        totalVoiceMinutes: true,
        voiceStreak: true,
        dailyVoiceMinutes: true,
        createdAt: true,
      }
    });

    if (!user) {
      await interaction.editReply({ content: `${targetUser.username} n'a pas de compte antibank` });
      return;
    }

    // Stats braquages
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

    // Stats casino (crash, dice, pfc)
    const crashStats = await prisma.$queryRaw<[{ games: bigint; totalProfit: string | null }]>`
      SELECT 
        COUNT(*) as games,
        COALESCE(SUM(profit), 0)::text as "totalProfit"
      FROM "CrashBet"
      WHERE "userId" = ${user.id}
    `;

    // Bounties
    const bountyStats = await prisma.$queryRaw<[{
      bountiesPosted: bigint;
      bountiesClaimed: bigint;
      totalBountySpent: string | null;
      totalBountyEarned: string | null;
    }]>`
      SELECT
        COUNT(*) FILTER (WHERE "posterId" = ${user.id}) as "bountiesPosted",
        COUNT(*) FILTER (WHERE "claimerId" = ${user.id}) as "bountiesClaimed",
        COALESCE(SUM(amount) FILTER (WHERE "posterId" = ${user.id}), 0)::text as "totalBountySpent",
        COALESCE(SUM(amount) FILTER (WHERE "claimerId" = ${user.id}), 0)::text as "totalBountyEarned"
      FROM "Bounty"
      WHERE "posterId" = ${user.id} OR "claimerId" = ${user.id}
    `;

    // Warns
    const warnStats = await prisma.$queryRaw<[{
      warnsReceived: bigint;
      warnsGiven: bigint;
      foundGuilty: bigint;
    }]>`
      SELECT
        COUNT(*) FILTER (WHERE "accusedId" = ${user.id}) as "warnsReceived",
        COUNT(*) FILTER (WHERE "accuserId" = ${user.id}) as "warnsGiven",
        COUNT(*) FILTER (WHERE "accusedId" = ${user.id} AND status = 'guilty') as "foundGuilty"
      FROM "WarnVote"
      WHERE "accusedId" = ${user.id} OR "accuserId" = ${user.id}
    `;

    const balance = parseFloat(user.balance.toString());
    const dahkaCoins = parseFloat(user.dahkaCoins.toString());
    const dcAvgPrice = user.dcAvgBuyPrice ? parseFloat(user.dcAvgBuyPrice.toString()) : null;
    
    const rStats = robberyStats[0];
    const totalRobberies = Number(rStats.totalRobberies);
    const successfulRobberies = Number(rStats.successfulRobberies);
    const successRate = totalRobberies > 0 ? Math.round((successfulRobberies / totalRobberies) * 100) : 0;

    const embed = new EmbedBuilder()
      .setTitle(`stats de ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: "fortune", value: `${balance.toFixed(2)}€`, inline: true },
        { name: "dahkacoin", value: dahkaCoins > 0 ? `${dahkaCoins.toFixed(4)} DC` : "0", inline: true },
        { name: "membre depuis", value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`, inline: true },
        
        { name: "\u200b", value: "**braquages**", inline: false },
        { name: "braquages", value: `${successfulRobberies}/${totalRobberies} (${successRate}%)`, inline: true },
        { name: "vole", value: `${parseFloat(rStats.totalStolen || "0").toFixed(2)}€`, inline: true },
        { name: "perdu", value: `${parseFloat(rStats.totalLost || "0").toFixed(2)}€`, inline: true },
        { name: "fois braque", value: `${Number(rStats.timesRobbed)}`, inline: true },
        
        { name: "\u200b", value: "**casino**", inline: false },
        { name: "crash games", value: `${Number(crashStats[0].games)}`, inline: true },
        { name: "profit crash", value: `${parseFloat(crashStats[0].totalProfit || "0").toFixed(2)}€`, inline: true },
        
        { name: "\u200b", value: "**social**", inline: false },
        { name: "temps vocal", value: `${user.totalVoiceMinutes} min (streak: ${user.voiceStreak}j)`, inline: true },
        { name: "primes posees", value: `${Number(bountyStats[0].bountiesPosted)}`, inline: true },
        { name: "primes claim", value: `${Number(bountyStats[0].bountiesClaimed)}`, inline: true },
        { name: "warns recus", value: `${Number(warnStats[0].warnsReceived)} (${Number(warnStats[0].foundGuilty)} coupable)`, inline: true },
      )
      .setColor(0x0a0a0a)
      .setFooter({ text: "antibank corp" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
