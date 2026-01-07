import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma, Prisma } from "@antibank/db";

const MIN_BOUNTY = 1;
const MAX_BOUNTY = 100;
const BOUNTY_DURATION_MS = 48 * 60 * 60 * 1000; // 48h

export const bounty = {
  data: new SlashCommandBuilder()
    .setName("bounty")
    .setDescription("mettre une prime sur quelqu'un")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("la cible")
        .setRequired(true)
    )
    .addNumberOption((option) =>
      option
        .setName("montant")
        .setDescription("montant de la prime")
        .setRequired(true)
        .setMinValue(MIN_BOUNTY)
        .setMaxValue(MAX_BOUNTY)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user", true);
    const amount = interaction.options.getNumber("montant", true);

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "tu peux pas mettre une prime sur toi-meme", ephemeral: true });
      return;
    }

    if (targetUser.bot) {
      await interaction.reply({ content: "tu peux pas mettre une prime sur un bot", ephemeral: true });
      return;
    }

    // Verifier les users
    const [poster, target] = await Promise.all([
      prisma.user.findUnique({ 
        where: { discordId: interaction.user.id }, 
        select: { id: true, balance: true } 
      }),
      prisma.user.findUnique({ 
        where: { discordId: targetUser.id }, 
        select: { id: true, discordUsername: true } 
      }),
    ]);

    if (!poster) {
      await interaction.reply({ content: "t'as pas de compte antibank", ephemeral: true });
      return;
    }

    if (!target) {
      await interaction.reply({ content: `${targetUser.username} n'a pas de compte antibank`, ephemeral: true });
      return;
    }

    const posterBalance = parseFloat(poster.balance.toString());
    if (posterBalance < amount) {
      await interaction.reply({ content: "pas assez de thunes", ephemeral: true });
      return;
    }

    // Verifier s'il y a deja une bounty active du meme poster sur la meme cible
    const existingBounty = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Bounty"
      WHERE "posterId" = ${poster.id} 
      AND "targetId" = ${target.id}
      AND status = 'active'
      AND "expiresAt" > NOW()
    `;

    if (Number(existingBounty[0]?.count || 0) > 0) {
      await interaction.reply({ content: "t'as deja une prime active sur cette personne", ephemeral: true });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + BOUNTY_DURATION_MS);
    const bountyId = `bounty_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Deduire l'argent et creer la bounty
    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "User" SET balance = balance - ${amount} WHERE id = ${poster.id}
      `,
      prisma.$executeRaw`
        INSERT INTO "Bounty" (id, "posterId", "targetId", amount, status, "expiresAt", "createdAt")
        VALUES (${bountyId}, ${poster.id}, ${target.id}, ${amount}, 'active', ${expiresAt}, ${now})
      `,
      prisma.transaction.create({
        data: {
          userId: poster.id,
          type: "bounty_post",
          amount: new Prisma.Decimal(-amount),
          description: `prime sur ${target.discordUsername}`
        }
      }),
    ]);

    // Recuperer le total des primes sur la cible
    const totalBounty = await prisma.$queryRaw<[{ total: string | null }]>`
      SELECT SUM(amount)::text as total FROM "Bounty"
      WHERE "targetId" = ${target.id} AND status = 'active' AND "expiresAt" > NOW()
    `;

    const embed = new EmbedBuilder()
      .setTitle("nouvelle prime")
      .setDescription(`**${interaction.user.username}** a mis une prime sur **${targetUser.username}**`)
      .addFields(
        { name: "montant", value: `${amount.toFixed(2)}€`, inline: true },
        { name: "total sur la cible", value: `${parseFloat(totalBounty[0]?.total || "0").toFixed(2)}€`, inline: true },
        { name: "expire", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true }
      )
      .setColor(0xff4444)
      .setFooter({ text: "braque cette personne pour recuperer la prime" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
