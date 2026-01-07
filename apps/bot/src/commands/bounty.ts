import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma, Prisma } from "@antibank/db";

const MIN_BOUNTY = 1;
const MAX_BOUNTY = 100;
const BOUNTY_DURATION_MS = 48 * 60 * 60 * 1000;

export const bounty = {
  data: new SlashCommandBuilder()
    .setName("bounty")
    .setDescription("Placer une prime sur la tête de quelqu'un")
    .addUserOption((option) =>
      option
        .setName("cible")
        .setDescription("La personne à cibler")
        .setRequired(true)
    )
    .addNumberOption((option) =>
      option
        .setName("montant")
        .setDescription("Montant de la prime (1 à 100 €)")
        .setRequired(true)
        .setMinValue(MIN_BOUNTY)
        .setMaxValue(MAX_BOUNTY)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("cible", true);
    const amount = interaction.options.getNumber("montant", true);

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "Vous ne pouvez pas placer une prime sur vous-même.", ephemeral: true });
      return;
    }

    if (targetUser.bot) {
      await interaction.reply({ content: "Vous ne pouvez pas cibler un bot.", ephemeral: true });
      return;
    }

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
      await interaction.reply({ content: "Vous n'avez pas de compte AntiBank.", ephemeral: true });
      return;
    }

    if (!target) {
      await interaction.reply({ content: `**${targetUser.username}** n'a pas de compte AntiBank.`, ephemeral: true });
      return;
    }

    const posterBalance = parseFloat(poster.balance.toString());
    if (posterBalance < amount) {
      await interaction.reply({ content: `Solde insuffisant. Vous avez \`${posterBalance.toFixed(2)} €\`.`, ephemeral: true });
      return;
    }

    const existingBounty = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Bounty"
      WHERE "posterId" = ${poster.id} 
      AND "targetId" = ${target.id}
      AND status = 'active'
      AND "expiresAt" > NOW()
    `;

    if (Number(existingBounty[0]?.count || 0) > 0) {
      await interaction.reply({ content: "Vous avez déjà une prime active sur cette personne.", ephemeral: true });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + BOUNTY_DURATION_MS);
    const bountyId = `bounty_${Date.now()}_${Math.random().toString(36).slice(2)}`;

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
          description: `Prime sur ${target.discordUsername}`
        }
      }),
    ]);

    const totalBounty = await prisma.$queryRaw<[{ total: string | null }]>`
      SELECT SUM(amount)::text as total FROM "Bounty"
      WHERE "targetId" = ${target.id} AND status = 'active' AND "expiresAt" > NOW()
    `;

    const total = parseFloat(totalBounty[0]?.total || "0");

    const embed = new EmbedBuilder()
      .setTitle("🎯 Nouvelle prime")
      .setDescription(`**${interaction.user.username}** a placé une prime sur **${targetUser.username}**.`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(0xe74c3c)
      .addFields(
        { name: "💵 Montant", value: `\`${amount.toFixed(2)} €\``, inline: true },
        { name: "💰 Total sur la cible", value: `\`${total.toFixed(2)} €\``, inline: true },
        { name: "⏳ Expiration", value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: "Braque cette personne pour récupérer la prime." })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
