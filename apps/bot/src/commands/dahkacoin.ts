import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma } from "@antibank/db";

const VOTE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export const dahkacoin = {
  data: new SlashCommandBuilder()
    .setName("dahkacoin")
    .setDescription("donner des dahkacoin a quelqu'un (nombre de reactions = DC donnes)")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("qui va recevoir les DC")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user", true);

    if (targetUser.bot) {
      await interaction.reply({ content: "tu peux pas donner a un bot", ephemeral: true });
      return;
    }

    // Verifier que la cible a un compte
    const target = await prisma.user.findUnique({
      where: { discordId: targetUser.id },
      select: { id: true, discordUsername: true }
    });

    if (!target) {
      await interaction.reply({ content: `${targetUser.username} n'a pas de compte antibank`, ephemeral: true });
      return;
    }

    // Verifier que le createur a un compte
    const creator = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      select: { id: true }
    });

    if (!creator) {
      await interaction.reply({ content: "t'as pas de compte antibank", ephemeral: true });
      return;
    }

    // Recuperer le prix actuel du DC
    const latestPrice = await prisma.$queryRaw<[{ price: string }] | []>`
      SELECT price::text FROM "DahkaCoinPrice"
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;

    const currentPrice = latestPrice.length > 0 && latestPrice[0] ? parseFloat(latestPrice[0].price) : 1.0;

    const endsAt = new Date(Date.now() + VOTE_DURATION_MS);

    const embed = new EmbedBuilder()
      .setTitle("don de dahkacoin")
      .setDescription(`reagis avec ⬆️ pour donner des DC a **${targetUser.username}**`)
      .addFields(
        { name: "beneficiaire", value: `<@${targetUser.id}>`, inline: true },
        { name: "prix actuel", value: `${currentPrice.toFixed(4)}€/DC`, inline: true },
        { name: "termine", value: `<t:${Math.floor(endsAt.getTime() / 1000)}:R>`, inline: true },
        { name: "comment ca marche", value: "chaque ⬆️ = 1 DC offert gratuitement", inline: false }
      )
      .setColor(0x9b59b6)
      .setFooter({ text: "les DC seront credites a la fin du vote" })
      .setTimestamp(endsAt);

    const message = await interaction.reply({ embeds: [embed], fetchReply: true });
    
    // Ajouter la reaction
    await message.react("⬆️");

    // Sauvegarder pour le suivi
    const now = new Date();
    const guildId = interaction.guildId || "";
    await prisma.$executeRaw`
      INSERT INTO "DiscordVote" (id, "messageId", "channelId", "guildId", type, "targetUserId", "creatorId", "endsAt", resolved, "createdAt")
      VALUES (${`dv_dc_${Date.now()}`}, ${message.id}, ${message.channelId}, ${guildId}, 'dahkacoin', ${target.id}, ${creator.id}, ${endsAt}, false, ${now})
    `;
  },
};
