import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma, Prisma } from "@antibank/db";
import { sendNotification } from "../lib/notifications.js";

// Config - memes valeurs que le site
const ROBBERY_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3h
const MIN_VICTIM_BALANCE = 20;
const BASE_SUCCESS_CHANCE = 40;
const STEAL_PERCENT_MIN = 10;
const STEAL_PERCENT_MAX = 20;
const FAILURE_PENALTY_PERCENT = 5;
const SYSTEM_TAX_PERCENT = 5;

export const rob = {
  data: new SlashCommandBuilder()
    .setName("rob")
    .setDescription("braquer quelqu'un")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("la victime")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user", true);

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "tu peux pas te braquer toi-meme", ephemeral: true });
      return;
    }

    if (targetUser.bot) {
      await interaction.reply({ content: "tu peux pas braquer un bot", ephemeral: true });
      return;
    }

    await interaction.deferReply();

    // Recuperer les users
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
      await interaction.editReply({ content: "t'as pas de compte antibank" });
      return;
    }

    if (!victim) {
      await interaction.editReply({ content: `${targetUser.username} n'a pas de compte antibank` });
      return;
    }

    if (victim.isBanned) {
      await interaction.editReply({ content: "cette cible est bannie" });
      return;
    }

    const robberBalance = parseFloat(robber.balance.toString());
    const victimBalance = parseFloat(victim.balance.toString());

    // Verifier cooldown
    if (robber.lastRobberyAt) {
      const cooldownEnds = robber.lastRobberyAt.getTime() + ROBBERY_COOLDOWN_MS;
      if (Date.now() < cooldownEnds) {
        await interaction.editReply({ 
          content: `cooldown actif. prochain braquage <t:${Math.floor(cooldownEnds / 1000)}:R>` 
        });
        return;
      }
    }

    if (victimBalance < MIN_VICTIM_BALANCE) {
      await interaction.editReply({ content: `la cible doit avoir au moins ${MIN_VICTIM_BALANCE}€` });
      return;
    }

    if (victimBalance < robberBalance) {
      await interaction.editReply({ content: "tu peux pas braquer quelqu'un de plus pauvre que toi" });
      return;
    }

    // Calculer les chances
    let successChance = BASE_SUCCESS_CHANCE;
    if (victimBalance >= robberBalance * 5) {
      successChance += 10;
    }

    // Lancer le de
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= successChance;

    let amount: number;
    const now = new Date();

    if (success) {
      // Succes
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
          description: `braquage reussi sur ${victim.discordUsername}`
        }
      });

      await prisma.transaction.create({
        data: {
          userId: victim.id,
          type: "robbery_loss",
          amount: new Prisma.Decimal(-grossAmount),
          description: `braque par ${robber.discordUsername}`
        }
      });

      // Verifier les bounties
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
            description: `prime sur ${victim.discordUsername}`
          }
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("braquage reussi")
        .setDescription(`**${interaction.user.username}** a braque **${targetUser.username}**`)
        .addFields(
          { name: "vole", value: `${amount.toFixed(2)}€`, inline: true },
          { name: "chance", value: `${successChance}%`, inline: true },
          { name: "roll", value: `${roll}`, inline: true }
        )
        .setColor(0x00ff00)
        .setTimestamp();

      if (bountyTotal > 0) {
        embed.addFields({ name: "prime recuperee", value: `${bountyTotal.toFixed(2)}€`, inline: false });
      }

      await interaction.editReply({ embeds: [embed] });

      // Notification dans le channel braquages
      await sendNotification(interaction.client, "braquages", embed);

    } else {
      // Echec
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
          description: `braquage rate sur ${victim.discordUsername}`
        }
      });

      const embed = new EmbedBuilder()
        .setTitle("braquage rate")
        .setDescription(`**${interaction.user.username}** a rate son braquage sur **${targetUser.username}**`)
        .addFields(
          { name: "perdu", value: `${penalty.toFixed(2)}€`, inline: true },
          { name: "chance", value: `${successChance}%`, inline: true },
          { name: "roll", value: `${roll}`, inline: true }
        )
        .setColor(0xff0000)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Notification dans le channel braquages
      await sendNotification(interaction.client, "braquages", embed);
    }
  },
};
