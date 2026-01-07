import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { prisma } from "@antibank/db";

// Types de channels configurables
export type NotificationChannel = "braquages" | "justice" | "casino" | "leaderboard";

// Cache des channel IDs (refresh toutes les 5 min)
let channelCache: Record<string, string> = {};
let lastCacheUpdate = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getChannelId(type: NotificationChannel): Promise<string | null> {
  const now = Date.now();
  
  // Refresh cache si necessaire
  if (now - lastCacheUpdate > CACHE_TTL) {
    const configs = await prisma.$queryRaw<Array<{ key: string; value: string }>>`
      SELECT key, value FROM "BotConfig"
      WHERE key LIKE 'channel_%'
    `;
    
    channelCache = {};
    for (const config of configs) {
      channelCache[config.key] = config.value;
    }
    lastCacheUpdate = now;
  }

  return channelCache[`channel_${type}`] || null;
}

export async function sendNotification(
  client: Client,
  type: NotificationChannel,
  embed: EmbedBuilder
): Promise<void> {
  try {
    const channelId = await getChannelId(type);
    if (!channelId) return;

    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel || !channel.isTextBased()) return;

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`[antibank] erreur notification ${type}:`, error);
  }
}

export async function sendTextNotification(
  client: Client,
  type: NotificationChannel,
  content: string
): Promise<void> {
  try {
    const channelId = await getChannelId(type);
    if (!channelId) return;

    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel || !channel.isTextBased()) return;

    await channel.send(content);
  } catch (error) {
    console.error(`[antibank] erreur notification ${type}:`, error);
  }
}

// Invalider le cache (appele apres /config)
export function invalidateChannelCache(): void {
  lastCacheUpdate = 0;
}
