import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, TextChannel } from "discord.js";
import { prisma, Prisma } from "@antibank/db";

// Config - memes constantes que le site
const WARN_COST = 0.20;
const WARN_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const WARN_MIN_AMOUNT = 0.50;
const WARN_MAX_AMOUNT = 50;
const WARN_MAX_PERCENT = 30;
const WARN_MIN_ACCUSED_BALANCE = 2;

export const vote = {
  data: new SlashCommandBuilder()
    .setName("vote")
    .setDescription("lancer un vote contre quelqu'un")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("l'accuse")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("raison")
        .setDescription("pourquoi tu veux le warn")
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(200)
    )
    .addNumberOption((option) =>
      option
        .setName("amende")
        .setDescription("montant de l'amende")
        .setRequired(true)
        .setMinValue(WARN_MIN_AMOUNT)
        .setMaxValue(WARN_MAX_AMOUNT)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("raison", true);
    const amount = interaction.options.getNumber("amende", true);

    // Verifications de base
    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "tu peux pas te warn toi-meme", ephemeral: true });
      return;
    }

    if (targetUser.bot) {
      await interaction.reply({ content: "tu peux pas warn un bot", ephemeral: true });
      return;
    }

    // Verifier que les deux users existent en DB
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
      await interaction.reply({ content: "t'as pas de compte antibank", ephemeral: true });
      return;
    }

    if (!accused) {
      await interaction.reply({ content: `${targetUser.username} n'a pas de compte antibank`, ephemeral: true });
      return;
    }

    const accuserBalance = parseFloat(accuser.balance.toString());
    const accusedBalance = parseFloat(accused.balance.toString());

    if (accuserBalance < WARN_COST) {
      await interaction.reply({ content: `il te faut ${WARN_COST}€ pour lancer un warn`, ephemeral: true });
      return;
    }

    if (accusedBalance < WARN_MIN_ACCUSED_BALANCE) {
      await interaction.reply({ content: `l'accuse doit avoir au moins ${WARN_MIN_ACCUSED_BALANCE}€`, ephemeral: true });
      return;
    }

    // Calculer le montant max
    const maxAmount = Math.min(WARN_MAX_AMOUNT, accusedBalance * WARN_MAX_PERCENT / 100);
    if (amount > maxAmount) {
      await interaction.reply({ content: `montant max: ${maxAmount.toFixed(2)}€`, ephemeral: true });
      return;
    }

    // Verifier cooldown
    const recentWarn = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "WarnVote"
      WHERE "accuserId" = ${accuser.id}
      AND "createdAt" > NOW() - INTERVAL '24 hours'
    `;

    if (Number(recentWarn[0]?.count || 0) > 0) {
      await interaction.reply({ content: "tu peux lancer qu'un warn par 24h", ephemeral: true });
      return;
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + WARN_DURATION_MS);
    const warnId = `warn_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Deduire le cout
    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance - ${WARN_COST} WHERE id = ${accuser.id}
    `;

    // Creer le warn en DB
    await prisma.$executeRaw`
      INSERT INTO "WarnVote" (id, "accuserId", "accusedId", reason, amount, status, "guiltyVotes", "innocentVotes", "endsAt", "createdAt")
      VALUES (${warnId}, ${accuser.id}, ${accused.id}, ${reason.trim()}, ${amount}, 'voting', 0, 0, ${endsAt}, ${now})
    `;

    await prisma.transaction.create({
      data: {
        userId: accuser.id,
        type: "warn_cost",
        amount: new Prisma.Decimal(-WARN_COST),
        description: `warn contre ${accused.discordUsername}`
      }
    });

    // Creer l'embed du vote
    const embed = new EmbedBuilder()
      .setTitle("vote en cours")
      .setDescription(`**${interaction.user.username}** accuse **${targetUser.username}**`)
      .addFields(
        { name: "raison", value: reason, inline: false },
        { name: "amende", value: `${amount.toFixed(2)}€`, inline: true },
        { name: "termine dans", value: "10 minutes", inline: true },
        { name: "votes", value: "⬆️ coupable: 0 | ⬇️ innocent: 0", inline: false }
      )
      .setColor(0xffcc00)
      .setFooter({ text: `quorum: 3 votants | ${warnId}` })
      .setTimestamp(endsAt);

    const message = await interaction.reply({ embeds: [embed], fetchReply: true });

    // Ajouter les reactions
    await message.react("⬆️");
    await message.react("⬇️");

    // Sauvegarder le message pour le suivi
    await prisma.$executeRaw`
      INSERT INTO "DiscordVote" (id, "messageId", "channelId", "guildId", type, "warnVoteId", "creatorId", "endsAt", resolved, "createdAt")
      VALUES (${`dv_${Date.now()}`}, ${message.id}, ${message.channelId}, ${interaction.guildId}, 'warn', ${warnId}, ${accuser.id}, ${endsAt}, false, ${now})
    `;
  },
};
