import "dotenv/config";
import { Client, GatewayIntentBits, Events, Collection, EmbedBuilder, TextChannel } from "discord.js";
import { prisma, Prisma, calculateVocalBonus, calculatePassiveBonus } from "@antibank/db";
import { commands } from "./commands/index.js";
import { sendNotification } from "./lib/notifications.js";

// Config mining
const VOCAL_BASE_RATE = 0.05;    // €/min avec 1+ autre personne
const VOCAL_BONUS_RATE = 0.02;   // €/min par personne supplémentaire
const MINING_INTERVAL = 60000;   // Check toutes les 60 secondes
const VOTE_CHECK_INTERVAL = 30000; // Check votes toutes les 30 secondes

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessages,
  ],
});

// Store commands
client.commands = new Collection();
for (const command of commands) {
  client.commands.set(command.data.name, command);
}

// === MINING VOCAL ===
async function updateVoiceSessions() {
  const guild = client.guilds.cache.get(process.env.GUILD_ID!);
  if (!guild) return;

  // Collecte tous les membres actuellement en vocal
  const activeMemberIds = new Set<string>();
  const sessionsData: { discordId: string; channelId: string; channelName: string; guildId: string; othersCount: number }[] = [];

  // Parcourt tous les channels vocaux
  for (const [, channel] of guild.channels.cache) {
    if (!channel.isVoiceBased()) continue;
    
    const members = channel.members.filter(m => !m.user.bot);
    if (members.size < 2) continue; // Besoin de 2+ personnes
    
    // Prépare les données de session pour chaque membre
    for (const [, member] of members) {
      activeMemberIds.add(member.id);
      sessionsData.push({
        discordId: member.id,
        channelId: channel.id,
        channelName: channel.name,
        guildId: guild.id,
        othersCount: members.size - 1,
      });
    }
  }

  // OPTIMISATION: Upsert batch + delete inactifs en une seule transaction
  await prisma.$transaction([
    // Supprime seulement les sessions des users qui ne sont plus en vocal
    prisma.voiceSession.deleteMany({
      where: {
        discordId: {
          notIn: Array.from(activeMemberIds),
        },
      },
    }),
    // Upsert tous les actifs
    ...sessionsData.map(data =>
      prisma.voiceSession.upsert({
        where: { discordId: data.discordId },
        update: {
          channelId: data.channelId,
          channelName: data.channelName,
          othersCount: data.othersCount,
          lastUpdate: new Date(),
        },
        create: data,
      })
    ),
  ]);
}

async function mineVocal() {
  const guild = client.guilds.cache.get(process.env.GUILD_ID!);
  if (!guild) return;

  for (const [, channel] of guild.channels.cache) {
    if (!channel.isVoiceBased()) continue;
    
    const members = channel.members.filter(m => !m.user.bot);
    if (members.size < 2) continue;
    
    const othersCount = members.size - 1;
    const baseEarnings = VOCAL_BASE_RATE + (VOCAL_BONUS_RATE * (othersCount - 1));
    
    for (const [, member] of members) {
      try {
        // Vérifie si l'user existe en DB avec ses upgrades
        const user = await prisma.user.findUnique({
          where: { discordId: member.id },
          include: { upgrades: true },
        });
        
        if (!user || user.isBanned) continue;
        
        // Calcule le bonus vocal des upgrades
        const vocalBonus = calculateVocalBonus(
          user.upgrades.map(u => ({ upgradeId: u.upgradeId, level: u.level }))
        );
        const earnings = baseEarnings + vocalBonus;
        
        // Ajoute les gains
        await prisma.$transaction([
          prisma.user.update({
            where: { discordId: member.id },
            data: { balance: { increment: earnings } },
          }),
          prisma.transaction.create({
            data: {
              userId: user.id,
              type: "vocal",
              amount: earnings,
              description: `mining vocal (${members.size} personnes)${vocalBonus > 0 ? ` +${vocalBonus.toFixed(3)}€ bonus` : ''}`,
            },
          }),
        ]);
        
        // Track heist voice minutes (1 min per interval)
        await trackHeistVoiceMinute(user.id);
      } catch (e) {
        // User pas en DB, ignore
      }
    }
  }
  
  // Update les sessions pour le site
  await updateVoiceSessions();
}

// Track 1 minute of voice time for heist progress
async function trackHeistVoiceMinute(userId: string) {
  try {
    const progress = await prisma.heistProgress.findUnique({
      where: { userId },
      select: { stage1Complete: true },
    });
    
    // Don't track if stage 1 already complete
    if (progress?.stage1Complete) return;
    
    await prisma.heistProgress.upsert({
      where: { userId },
      create: { userId, voiceMinutes: 1 },
      update: { voiceMinutes: { increment: 1 } },
    });
  } catch (e) {
    // Ignore errors - heist tracking is optional
  }
}

// === MINING PASSIF ===
async function minePassive() {
  try {
    // Récupère tous les users avec des upgrades passifs
    const usersWithUpgrades = await prisma.user.findMany({
      where: {
        isBanned: false,
        upgrades: {
          some: {
            upgradeId: {
              in: ["chaise_gaming", "rig_minage", "datacenter"]
            }
          }
        }
      },
      include: { upgrades: true },
    });

    for (const user of usersWithUpgrades) {
      const passiveBonus = calculatePassiveBonus(
        user.upgrades.map(u => ({ upgradeId: u.upgradeId, level: u.level }))
      );

      if (passiveBonus <= 0) continue;

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { balance: { increment: passiveBonus } },
        }),
        prisma.transaction.create({
          data: {
            userId: user.id,
            type: "passive",
            amount: passiveBonus,
            description: `revenus passifs`,
          },
        }),
      ]);
    }
  } catch (e) {
    console.error("[antibank] erreur mining passif:", e);
  }
}

// === RESOLUTION DES VOTES DISCORD ===
async function resolveExpiredVotes() {
  const now = new Date();

  // Trouver les votes expires non resolus
  const expiredVotes = await prisma.$queryRaw<Array<{
    id: string;
    messageId: string;
    channelId: string;
    type: string;
    warnVoteId: string | null;
    targetUserId: string | null;
  }>>`
    SELECT id, "messageId", "channelId", type, "warnVoteId", "targetUserId"
    FROM "DiscordVote"
    WHERE resolved = false AND "endsAt" <= ${now}
  `;

  for (const vote of expiredVotes) {
    try {
      const channel = client.channels.cache.get(vote.channelId) as TextChannel | undefined;
      if (!channel) continue;

      const message = await channel.messages.fetch(vote.messageId).catch(() => null);
      if (!message) {
        // Message supprime, marquer comme resolu
        await prisma.$executeRaw`UPDATE "DiscordVote" SET resolved = true WHERE id = ${vote.id}`;
        continue;
      }

      if (vote.type === "warn" && vote.warnVoteId) {
        // Compter les reactions
        const upReaction = message.reactions.cache.get("⬆️");
        const downReaction = message.reactions.cache.get("⬇️");
        
        // -1 pour enlever le bot
        const guiltyVotes = (upReaction?.count || 1) - 1;
        const innocentVotes = (downReaction?.count || 1) - 1;

        // Mettre a jour le WarnVote avec les vrais comptes
        await prisma.$executeRaw`
          UPDATE "WarnVote" 
          SET "guiltyVotes" = ${guiltyVotes}, "innocentVotes" = ${innocentVotes}
          WHERE id = ${vote.warnVoteId}
        `;

        // Resoudre via la logique existante
        await resolveWarn(vote.warnVoteId, guiltyVotes, innocentVotes, message);
      }

      else if (vote.type === "dahkacoin" && vote.targetUserId) {
        // Compter les reactions
        const upReaction = message.reactions.cache.get("⬆️");
        const dcCount = (upReaction?.count || 1) - 1; // -1 pour le bot

        if (dcCount > 0) {
          // Donner les DC au beneficiaire
          await prisma.$executeRaw`
            UPDATE "User" SET "dahkaCoins" = "dahkaCoins" + ${dcCount}
            WHERE id = ${vote.targetUserId}
          `;

          await prisma.transaction.create({
            data: {
              userId: vote.targetUserId,
              type: "dahkacoin_gift",
              amount: new Prisma.Decimal(0),
              description: `${dcCount} DC offerts par la communaute`
            }
          });

          // Mettre a jour le message
          const successEmbed = EmbedBuilder.from(message.embeds[0])
            .setColor(0x2ecc71)
            .setFooter({ text: `${dcCount} DahkaCoin crédités avec succès.` });
          
          await message.edit({ embeds: [successEmbed] });
        } else {
          const noVoteEmbed = EmbedBuilder.from(message.embeds[0])
            .setColor(0x95a5a6)
            .setFooter({ text: "Aucun DahkaCoin offert." });
          
          await message.edit({ embeds: [noVoteEmbed] });
        }
      }

      // Marquer comme resolu
      await prisma.$executeRaw`UPDATE "DiscordVote" SET resolved = true WHERE id = ${vote.id}`;

    } catch (e) {
      console.error(`[antibank] erreur resolution vote ${vote.id}:`, e);
    }
  }
}

// Resoudre un warn specifique
async function resolveWarn(warnId: string, guiltyVotes: number, innocentVotes: number, message: any) {
  const WARN_QUORUM = 3;
  const totalVotes = guiltyVotes + innocentVotes;
  const now = new Date();

  // Recuperer les infos du warn
  const warns = await prisma.$queryRaw<Array<{
    accuserId: string;
    accusedId: string;
    amount: string;
    accuserName: string;
    accusedName: string;
  }>>`
    SELECT w."accuserId", w."accusedId", w.amount::text,
           accuser."discordUsername" as "accuserName",
           accused."discordUsername" as "accusedName"
    FROM "WarnVote" w
    JOIN "User" accuser ON w."accuserId" = accuser.id
    JOIN "User" accused ON w."accusedId" = accused.id
    WHERE w.id = ${warnId}
  `;

  if (warns.length === 0) return;
  const warn = warns[0];
  const amount = parseFloat(warn.amount);

  let resultText = "";
  let color = 0x666666;

  if (totalVotes < WARN_QUORUM) {
    // Pas assez de votes - expire
    await prisma.$executeRaw`
      UPDATE "WarnVote" SET status = 'expired', "resolvedAt" = ${now} WHERE id = ${warnId}
    `;
    resultText = "Vote expiré — Quorum non atteint.";
    color = 0x95a5a6;
  } 
  else if (guiltyVotes > innocentVotes) {
    // Coupable
    const voterShare = guiltyVotes > 0 ? (amount * 0.5) / guiltyVotes : 0;

    // Retirer l'amende
    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance - ${amount} WHERE id = ${warn.accusedId}
    `;

    // Les votants coupables reçoivent leur part (on ne peut pas savoir qui a vote via reactions)
    // Donc on skip la distribution aux votants pour simplifier

    await prisma.transaction.create({
      data: {
        userId: warn.accusedId,
        type: "warn_fine",
        amount: new Prisma.Decimal(-amount),
        description: "amende pour warn"
      }
    });

    await prisma.$executeRaw`
      UPDATE "WarnVote" SET status = 'guilty', "resolvedAt" = ${now} WHERE id = ${warnId}
    `;

    resultText = `**Coupable** — ${warn.accusedName} perd \`${amount.toFixed(2)} €\``;
    color = 0xe74c3c;

    // Notification justice
    const guiltyEmbed = new EmbedBuilder()
      .setTitle("⚖️ Verdict : Coupable")
      .setDescription(`**${warn.accusedName}** a été reconnu coupable.`)
      .addFields(
        { name: "💰 Amende", value: `\`${amount.toFixed(2)} €\``, inline: true },
        { name: "📊 Votes", value: `Coupable : \`${guiltyVotes}\` — Innocent : \`${innocentVotes}\``, inline: true }
      )
      .setColor(0xe74c3c)
      .setTimestamp();

    await sendNotification(client, "justice", guiltyEmbed);
  } 
  else {
    // Innocent
    const penalty = amount * 0.5;

    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance - ${penalty} WHERE id = ${warn.accuserId}
    `;
    await prisma.$executeRaw`
      UPDATE "User" SET balance = balance + ${penalty} WHERE id = ${warn.accusedId}
    `;

    await prisma.transaction.create({
      data: {
        userId: warn.accuserId,
        type: "warn_penalty",
        amount: new Prisma.Decimal(-penalty),
        description: "warn rejete"
      }
    });
    await prisma.transaction.create({
      data: {
        userId: warn.accusedId,
        type: "warn_compensation",
        amount: new Prisma.Decimal(penalty),
        description: "compensation warn"
      }
    });

    await prisma.$executeRaw`
      UPDATE "WarnVote" SET status = 'innocent', "resolvedAt" = ${now} WHERE id = ${warnId}
    `;

    resultText = `✅ INNOCENT — **${warn.accuserName}** perd \`${penalty.toFixed(2)} €\``;
    color = 0x2ecc71;

    // Notification justice
    const innocentEmbed = new EmbedBuilder()
      .setTitle("⚖️ Verdict : Innocent")
      .setDescription(`**${warn.accusedName}** a été reconnu innocent`)
      .addFields(
        { name: "💸 Pénalité accusateur", value: `\`${penalty.toFixed(2)} €\``, inline: true },
        { name: "📊 Votes", value: `⬆️ \`${guiltyVotes}\` • ⬇️ \`${innocentVotes}\``, inline: true }
      )
      .setColor(0x2ecc71)
      .setTimestamp();

    await sendNotification(client, "justice", innocentEmbed);
  }

  // Mettre a jour le message original
  try {
    const updatedEmbed = EmbedBuilder.from(message.embeds[0])
      .setColor(color)
      .setFields(
        { name: "📋 Résultat", value: resultText, inline: false },
        { name: "📊 Votes finaux", value: `⬆️ Coupable: \`${guiltyVotes}\` • ⬇️ Innocent: \`${innocentVotes}\``, inline: false }
      )
      .setFooter({ text: "⚖️ Vote terminé" });

    await message.edit({ embeds: [updatedEmbed] });
  } catch (e) {
    // Ignore si on peut pas editer
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`[antibank] connecte en tant que ${c.user.tag}`);
  
  // Cleanup des sessions stale au démarrage
  const deleted = await prisma.voiceSession.deleteMany({});
  console.log(`[antibank] ${deleted.count} sessions vocales stale supprimees`);
  
  // Sync immédiat des sessions actuelles
  await updateVoiceSessions();
  console.log(`[antibank] sessions vocales synchronisees`);
  
  // Lance le mining vocal toutes les 60 secondes
  setInterval(mineVocal, MINING_INTERVAL);
  console.log(`[antibank] mining vocal actif (${MINING_INTERVAL/1000}s interval)`);

  // Lance le mining passif toutes les 60 secondes aussi
  setInterval(minePassive, MINING_INTERVAL);
  console.log(`[antibank] mining passif actif (${MINING_INTERVAL/1000}s interval)`);

  // Lance la resolution des votes toutes les 30 secondes
  setInterval(resolveExpiredVotes, VOTE_CHECK_INTERVAL);
  console.log(`[antibank] resolution votes actif (${VOTE_CHECK_INTERVAL/1000}s interval)`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Erreur commande ${interaction.commandName}:`, error);
    const reply = {
      content: "erreur lors de l'execution de la commande",
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// Cleanup on shutdown
process.on("SIGINT", async () => {
  console.log("[antibank] arret...");
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
