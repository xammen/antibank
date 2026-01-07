import "dotenv/config";
import { Client, GatewayIntentBits, Events, Collection, VoiceState } from "discord.js";
import { prisma, calculateVocalBonus, calculatePassiveBonus } from "@antibank/db";
import { commands } from "./commands/index.js";

// Config mining
const VOCAL_BASE_RATE = 0.05;    // €/min avec 1+ autre personne
const VOCAL_BONUS_RATE = 0.02;   // €/min par personne supplémentaire
const MINING_INTERVAL = 60000;   // Check toutes les 60 secondes

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
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
      } catch (e) {
        // User pas en DB, ignore
      }
    }
  }
  
  // Update les sessions pour le site
  await updateVoiceSessions();
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
