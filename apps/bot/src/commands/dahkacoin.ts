import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "@antibank/db";

const VOTE_DURATION_MS = 5 * 60 * 1000;

export const dahkacoin = {
  data: new SlashCommandBuilder()
    .setName("dahkacoin")
    .setDescription("Offrir des DahkaCoin à un joueur (les réactions comptent)")
    .addUserOption((option) =>
      option
        .setName("bénéficiaire")
        .setDescription("Le joueur qui recevra les DahkaCoin")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("bénéficiaire", true);

    if (targetUser.bot) {
      await interaction.reply({ content: "Vous ne pouvez pas offrir à un bot.", ephemeral: true });
      return;
    }

    const target = await prisma.user.findUnique({
      where: { discordId: targetUser.id },
      select: { id: true, discordUsername: true }
    });

    if (!target) {
      await interaction.reply({ content: `**${targetUser.username}** n'a pas de compte AntiBank.`, ephemeral: true });
      return;
    }

    const creator = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      select: { id: true }
    });

    if (!creator) {
      await interaction.reply({ content: "Vous n'avez pas de compte AntiBank.", ephemeral: true });
      return;
    }

    const latestPrice = await prisma.$queryRaw<[{ price: string }] | []>`
      SELECT price::text FROM "DahkaCoinPrice"
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;

    const currentPrice = latestPrice.length > 0 && latestPrice[0] ? parseFloat(latestPrice[0].price) : 1.0;
    const endsAt = new Date(Date.now() + VOTE_DURATION_MS);

    const embed = new EmbedBuilder()
      .setTitle("💎 Don de DahkaCoin")
      .setDescription(`Réagissez avec ⬆️ pour offrir des DahkaCoin à **${targetUser.username}**.\n\nChaque réaction = **1 DC** offert gratuitement.`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(0x9b59b6)
      .addFields(
        { name: "👤 Bénéficiaire", value: `<@${targetUser.id}>`, inline: true },
        { name: "📈 Prix actuel", value: `\`${currentPrice.toFixed(4)} €/DC\``, inline: true },
        { name: "⏳ Fin", value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: "Les DahkaCoin seront crédités à la fin du vote." })
      .setTimestamp(endsAt);

    const message = await interaction.reply({ embeds: [embed], fetchReply: true });
    await message.react("⬆️");

    const now = new Date();
    const guildId = interaction.guildId || "";
    await prisma.$executeRaw`
      INSERT INTO "DiscordVote" (id, "messageId", "channelId", "guildId", type, "targetUserId", "creatorId", "endsAt", resolved, "createdAt")
      VALUES (${`dv_dc_${Date.now()}`}, ${message.id}, ${message.channelId}, ${guildId}, 'dahkacoin', ${target.id}, ${creator.id}, ${endsAt}, false, ${now})
    `;
  },
};
