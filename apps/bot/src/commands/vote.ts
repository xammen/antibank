import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma, Prisma } from "@antibank/db";

const WARN_COST = 0.20;
const WARN_DURATION_MS = 10 * 60 * 1000;
const WARN_MIN_AMOUNT = 0.50;
const WARN_MAX_AMOUNT = 50;
const WARN_MAX_PERCENT = 30;
const WARN_MIN_ACCUSED_BALANCE = 2;

export const vote = {
  data: new SlashCommandBuilder()
    .setName("vote")
    .setDescription("Lancer un vote d'accusation contre un joueur")
    .addUserOption((option) =>
      option
        .setName("accusé")
        .setDescription("Le joueur accusé")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("raison")
        .setDescription("Motif de l'accusation")
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(200)
    )
    .addNumberOption((option) =>
      option
        .setName("amende")
        .setDescription("Montant de l'amende demandée (0.50 à 50 €)")
        .setRequired(true)
        .setMinValue(WARN_MIN_AMOUNT)
        .setMaxValue(WARN_MAX_AMOUNT)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("accusé", true);
    const reason = interaction.options.getString("raison", true);
    const amount = interaction.options.getNumber("amende", true);

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "Vous ne pouvez pas vous accuser vous-même.", ephemeral: true });
      return;
    }

    if (targetUser.bot) {
      await interaction.reply({ content: "Vous ne pouvez pas accuser un bot.", ephemeral: true });
      return;
    }

    const [accuser, accused] = await Promise.all([
      prisma.user.findUnique({ 
        where: { discordId: interaction.user.id }, 
        select: { id: true, balance: true, discordUsername: true } 
      }),
      prisma.user.findUnique({ 
        where: { discordId: targetUser.id }, 
        select: { id: true, balance: true, discordUsername: true } 
      }),
    ]);

    if (!accuser) {
      await interaction.reply({ content: "Vous n'avez pas de compte AntiBank.", ephemeral: true });
      return;
    }

    if (!accused) {
      await interaction.reply({ content: `**${targetUser.username}** n'a pas de compte AntiBank.`, ephemeral: true });
      return;
    }

    const accuserBalance = parseFloat(accuser.balance.toString());
    const accusedBalance = parseFloat(accused.balance.toString());

    if (accuserBalance < WARN_COST) {
      await interaction.reply({ content: `Il vous faut \`${WARN_COST} €\` pour lancer un vote.`, ephemeral: true });
      return;
    }

    if (accusedBalance < WARN_MIN_ACCUSED_BALANCE) {
      await interaction.reply({ content: `L'accusé doit avoir au moins \`${WARN_MIN_ACCUSED_BALANCE} €\`.`, ephemeral: true });
      return;
    }

    const maxAmount = Math.min(WARN_MAX_AMOUNT, accusedBalance * WARN_MAX_PERCENT / 100);
    if (amount > maxAmount) {
      await interaction.reply({ content: `Amende maximale : \`${maxAmount.toFixed(2)} €\` (30% du solde de l'accusé).`, ephemeral: true });
      return;
    }

    const recentWarn = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "WarnVote"
      WHERE "accuserId" = ${accuser.id}
      AND "createdAt" > NOW() - INTERVAL '24 hours'
    `;

    if (Number(recentWarn[0]?.count || 0) > 0) {
      await interaction.reply({ content: "Vous ne pouvez lancer qu'un vote par 24 heures.", ephemeral: true });
      return;
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + WARN_DURATION_MS);
    const warnId = `warn_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance - ${WARN_COST} WHERE id = ${accuser.id}
    `;

    await prisma.$executeRaw`
      INSERT INTO "WarnVote" (id, "accuserId", "accusedId", reason, amount, status, "guiltyVotes", "innocentVotes", "endsAt", "createdAt")
      VALUES (${warnId}, ${accuser.id}, ${accused.id}, ${reason.trim()}, ${amount}, 'voting', 0, 0, ${endsAt}, ${now})
    `;

    await prisma.transaction.create({
      data: {
        userId: accuser.id,
        type: "warn_cost",
        amount: new Prisma.Decimal(-WARN_COST),
        description: `Vote contre ${accused.discordUsername}`
      }
    });

    const embed = new EmbedBuilder()
      .setTitle("⚖️ Vote en cours")
      .setDescription(`**${interaction.user.username}** accuse **${targetUser.username}**`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(0xf39c12)
      .addFields(
        { name: "📋 Motif", value: reason, inline: false },
        { name: "💰 Amende demandée", value: `\`${amount.toFixed(2)} €\``, inline: true },
        { name: "⏳ Fin du vote", value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`, inline: true },
        { name: "📊 Votes", value: "⬆️ Coupable : `0`\n⬇️ Innocent : `0`", inline: true }
      )
      .setFooter({ text: "Quorum : 3 votants minimum" })
      .setTimestamp();

    const message = await interaction.reply({ embeds: [embed], fetchReply: true });

    await message.react("⬆️");
    await message.react("⬇️");

    const guildId = interaction.guildId || "";
    await prisma.$executeRaw`
      INSERT INTO "DiscordVote" (id, "messageId", "channelId", "guildId", type, "warnVoteId", "creatorId", "endsAt", resolved, "createdAt")
      VALUES (${`dv_${Date.now()}`}, ${message.id}, ${message.channelId}, ${guildId}, 'warn', ${warnId}, ${accuser.id}, ${endsAt}, false, ${now})
    `;
  },
};
