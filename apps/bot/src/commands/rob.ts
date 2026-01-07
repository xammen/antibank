import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma, Prisma } from "@antibank/db";
import { sendNotification } from "../lib/notifications.js";

const ROBBERY_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const MIN_VICTIM_BALANCE = 20;
const BASE_SUCCESS_CHANCE = 40;
const STEAL_PERCENT_MIN = 10;
const STEAL_PERCENT_MAX = 20;
const FAILURE_PENALTY_PERCENT = 5;
const SYSTEM_TAX_PERCENT = 5;

export const rob = {
  data: new SlashCommandBuilder()
    .setName("rob")
    .setDescription("Braquer un autre joueur")
    .addUserOption((option) =>
      option
        .setName("victime")
        .setDescription("Le joueur à braquer")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("victime", true);

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "Vous ne pouvez pas vous braquer vous-même.", ephemeral: true });
      return;
    }

    if (targetUser.bot) {
      await interaction.reply({ content: "Vous ne pouvez pas braquer un bot.", ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const [robber, victim] = await Promise.all([
      prisma.user.findUnique({
        where: { discordId: interaction.user.id },
        select: { id: true, balance: true, lastRobberyAt: true, discordUsername: true }
      }),
      prisma.user.findUnique({
        where: { discordId: targetUser.id },
        select: { id: true, balance: true, discordUsername: true, isBanned: true }
      }),
    ]);

    if (!robber) {
      await interaction.editReply({ content: "Vous n'avez pas de compte AntiBank." });
      return;
    }

    if (!victim) {
      await interaction.editReply({ content: `**${targetUser.username}** n'a pas de compte AntiBank.` });
      return;
    }

    if (victim.isBanned) {
      await interaction.editReply({ content: "Cette cible est bannie." });
      return;
    }

    const robberBalance = parseFloat(robber.balance.toString());
    const victimBalance = parseFloat(victim.balance.toString());

    if (robber.lastRobberyAt) {
      const cooldownEnds = robber.lastRobberyAt.getTime() + ROBBERY_COOLDOWN_MS;
      if (Date.now() < cooldownEnds) {
        await interaction.editReply({ 
          content: `Cooldown actif. Prochain braquage disponible <t:${Math.floor(cooldownEnds / 1000)}:R>.` 
        });
        return;
      }
    }

    if (victimBalance < MIN_VICTIM_BALANCE) {
      await interaction.editReply({ content: `La cible doit avoir au moins \`${MIN_VICTIM_BALANCE} €\`.` });
      return;
    }

    if (victimBalance < robberBalance) {
      await interaction.editReply({ content: "Vous ne pouvez pas braquer quelqu'un de plus pauvre que vous." });
      return;
    }

    let successChance = BASE_SUCCESS_CHANCE;
    if (victimBalance >= robberBalance * 5) {
      successChance += 10;
    }

    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= successChance;

    let amount: number;
    const now = new Date();

    if (success) {
      const stealPercent = STEAL_PERCENT_MIN + Math.random() * (STEAL_PERCENT_MAX - STEAL_PERCENT_MIN);
      const grossAmount = Math.floor(victimBalance * stealPercent) / 100;
      const tax = Math.floor(grossAmount * SYSTEM_TAX_PERCENT) / 100;
      amount = Math.floor((grossAmount - tax) * 100) / 100;

      await prisma.$executeRaw`
        UPDATE "User" SET balance = balance - ${grossAmount} WHERE id = ${victim.id}
      `;
      
      await prisma.$executeRaw`
        UPDATE "User" SET balance = balance + ${amount}, "lastRobberyAt" = ${now} WHERE id = ${robber.id}
      `;

      await prisma.$executeRaw`
        INSERT INTO "Robbery" (id, "robberId", "victimId", success, amount, "robberBalance", "victimBalance", "rollChance", "rollResult", "createdAt")
        VALUES (${`rob_${Date.now()}_${Math.random().toString(36).slice(2)}`}, ${robber.id}, ${victim.id}, true, ${amount}, ${robberBalance}, ${victimBalance}, ${successChance}, ${roll}, ${now})
      `;

      await prisma.transaction.create({
        data: {
          userId: robber.id,
          type: "robbery_gain",
          amount: new Prisma.Decimal(amount),
          description: `Braquage sur ${victim.discordUsername}`
        }
      });

      await prisma.transaction.create({
        data: {
          userId: victim.id,
          type: "robbery_loss",
          amount: new Prisma.Decimal(-grossAmount),
          description: `Braqué par ${robber.discordUsername}`
        }
      });

      // Récupérer les primes
      const bounties = await prisma.$queryRaw<Array<{ id: string; amount: string; posterId: string }>>`
        SELECT id, amount::text, "posterId" FROM "Bounty"
        WHERE "targetId" = ${victim.id} AND status = 'active' AND "expiresAt" > NOW()
      `;

      let bountyTotal = 0;
      for (const bountyItem of bounties) {
        const bountyAmount = parseFloat(bountyItem.amount);
        bountyTotal += bountyAmount;
        
        await prisma.$executeRaw`
          UPDATE "Bounty" SET status = 'claimed', "claimerId" = ${robber.id}, "claimedAt" = ${now}
          WHERE id = ${bountyItem.id}
        `;

        await prisma.$executeRaw`
          UPDATE "User" SET balance = balance + ${bountyAmount} WHERE id = ${robber.id}
        `;

        await prisma.transaction.create({
          data: {
            userId: robber.id,
            type: "bounty_claimed",
            amount: new Prisma.Decimal(bountyAmount),
            description: `Prime sur ${victim.discordUsername}`
          }
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🔫 Braquage réussi")
        .setDescription(`**${interaction.user.username}** a braqué **${targetUser.username}** avec succès.`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setColor(0x2ecc71)
        .addFields(
          { name: "💰 Butin", value: `\`${amount.toFixed(2)} €\``, inline: true },
          { name: "🎲 Jet", value: `\`${roll}\` / ${successChance}`, inline: true },
          { name: "📊 Chance", value: `\`${successChance}%\``, inline: true }
        )
        .setTimestamp();

      if (bountyTotal > 0) {
        embed.addFields({ name: "🎯 Prime récupérée", value: `\`+${bountyTotal.toFixed(2)} €\``, inline: false });
      }

      await interaction.editReply({ embeds: [embed] });
      await sendNotification(interaction.client, "braquages", embed);

    } else {
      const penalty = Math.max(1, Math.floor(robberBalance * FAILURE_PENALTY_PERCENT) / 100);
      amount = penalty;

      await prisma.$executeRaw`
        UPDATE "User" SET balance = balance - ${penalty}, "lastRobberyAt" = ${now} WHERE id = ${robber.id}
      `;

      await prisma.$executeRaw`
        INSERT INTO "Robbery" (id, "robberId", "victimId", success, amount, "robberBalance", "victimBalance", "rollChance", "rollResult", "createdAt")
        VALUES (${`rob_${Date.now()}_${Math.random().toString(36).slice(2)}`}, ${robber.id}, ${victim.id}, false, ${penalty}, ${robberBalance}, ${victimBalance}, ${successChance}, ${roll}, ${now})
      `;

      await prisma.transaction.create({
        data: {
          userId: robber.id,
          type: "robbery_fail",
          amount: new Prisma.Decimal(-penalty),
          description: `Braquage raté sur ${victim.discordUsername}`
        }
      });

      const embed = new EmbedBuilder()
        .setTitle("❌ Braquage échoué")
        .setDescription(`**${interaction.user.username}** s'est fait attraper en tentant de braquer **${targetUser.username}**.`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setColor(0xe74c3c)
        .addFields(
          { name: "💸 Pénalité", value: `\`-${penalty.toFixed(2)} €\``, inline: true },
          { name: "🎲 Jet", value: `\`${roll}\` / ${successChance}`, inline: true },
          { name: "📊 Chance", value: `\`${successChance}%\``, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      await sendNotification(interaction.client, "braquages", embed);
    }
  },
};
