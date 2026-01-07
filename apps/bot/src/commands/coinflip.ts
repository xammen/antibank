import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { prisma, Prisma } from "@antibank/db";

const MIN_BET = 0.5;
const MAX_BET = 100;
const HOUSE_FEE_PERCENT = 5; // 5% fee

export const coinflip = {
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("pile ou face contre quelqu'un")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("ton adversaire")
        .setRequired(true)
    )
    .addNumberOption((option) =>
      option
        .setName("montant")
        .setDescription("la mise")
        .setRequired(true)
        .setMinValue(MIN_BET)
        .setMaxValue(MAX_BET)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user", true);
    const amount = interaction.options.getNumber("montant", true);

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "tu peux pas jouer contre toi-meme", ephemeral: true });
      return;
    }

    if (targetUser.bot) {
      await interaction.reply({ content: "tu peux pas jouer contre un bot", ephemeral: true });
      return;
    }

    // Verifier les deux joueurs
    const [player1, player2] = await Promise.all([
      prisma.user.findUnique({
        where: { discordId: interaction.user.id },
        select: { id: true, balance: true, discordUsername: true }
      }),
      prisma.user.findUnique({
        where: { discordId: targetUser.id },
        select: { id: true, balance: true, discordUsername: true }
      }),
    ]);

    if (!player1) {
      await interaction.reply({ content: "t'as pas de compte antibank", ephemeral: true });
      return;
    }

    if (!player2) {
      await interaction.reply({ content: `${targetUser.username} n'a pas de compte antibank`, ephemeral: true });
      return;
    }

    const p1Balance = parseFloat(player1.balance.toString());
    const p2Balance = parseFloat(player2.balance.toString());

    if (p1Balance < amount) {
      await interaction.reply({ content: "pas assez de thunes", ephemeral: true });
      return;
    }

    if (p2Balance < amount) {
      await interaction.reply({ content: `${targetUser.username} n'a pas assez`, ephemeral: true });
      return;
    }

    const acceptButton = new ButtonBuilder()
      .setCustomId("coinflip_accept")
      .setLabel("accepter")
      .setStyle(ButtonStyle.Success);

    const declineButton = new ButtonBuilder()
      .setCustomId("coinflip_decline")
      .setLabel("refuser")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(acceptButton, declineButton);

    const embed = new EmbedBuilder()
      .setTitle("coinflip")
      .setDescription(`**${interaction.user.username}** defie **${targetUser.username}** a un pile ou face`)
      .addFields(
        { name: "mise", value: `${amount.toFixed(2)}€ chacun`, inline: true },
        { name: "gain possible", value: `${(amount * 2 * (1 - HOUSE_FEE_PERCENT / 100)).toFixed(2)}€`, inline: true }
      )
      .setColor(0xffcc00)
      .setFooter({ text: `${targetUser.username} doit accepter (30s)` });

    const message = await interaction.reply({ 
      content: `<@${targetUser.id}>`,
      embeds: [embed], 
      components: [row],
      fetchReply: true 
    });

    // Attendre la reponse
    try {
      const response = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === targetUser.id,
        time: 30000
      });

      if (response.customId === "coinflip_decline") {
        await response.update({
          embeds: [embed.setColor(0xff0000).setFooter({ text: "refuse" })],
          components: []
        });
        return;
      }

      // Accepte - verifier encore les soldes
      const [p1Check, p2Check] = await Promise.all([
        prisma.user.findUnique({ where: { id: player1.id }, select: { balance: true } }),
        prisma.user.findUnique({ where: { id: player2.id }, select: { balance: true } }),
      ]);

      if (!p1Check || !p2Check || 
          parseFloat(p1Check.balance.toString()) < amount || 
          parseFloat(p2Check.balance.toString()) < amount) {
        await response.update({
          embeds: [embed.setColor(0xff0000).setDescription("plus assez d'argent").setFooter({ text: "annule" })],
          components: []
        });
        return;
      }

      // Lancer la piece
      const result = Math.random() < 0.5 ? "pile" : "face";
      const winnerId = Math.random() < 0.5 ? player1.id : player2.id;
      const winnerDiscordId = winnerId === player1.id ? interaction.user.id : targetUser.id;
      const winnerName = winnerId === player1.id ? interaction.user.username : targetUser.username;
      const loserName = winnerId === player1.id ? targetUser.username : interaction.user.username;
      const loserId = winnerId === player1.id ? player2.id : player1.id;

      const pot = amount * 2;
      const fee = Math.floor(pot * HOUSE_FEE_PERCENT) / 100;
      const winnings = pot - fee;

      // Transaction
      await prisma.$transaction([
        // Debit les deux joueurs
        prisma.user.update({
          where: { id: player1.id },
          data: { balance: { decrement: amount } }
        }),
        prisma.user.update({
          where: { id: player2.id },
          data: { balance: { decrement: amount } }
        }),
        // Credit le gagnant
        prisma.user.update({
          where: { id: winnerId },
          data: { balance: { increment: winnings } }
        }),
        // Transactions
        prisma.transaction.create({
          data: {
            userId: winnerId,
            type: "coinflip_win",
            amount: new Prisma.Decimal(winnings - amount),
            description: `coinflip gagne contre ${loserName}`
          }
        }),
        prisma.transaction.create({
          data: {
            userId: loserId,
            type: "coinflip_loss",
            amount: new Prisma.Decimal(-amount),
            description: `coinflip perdu contre ${winnerName}`
          }
        }),
      ]);

      const resultEmbed = new EmbedBuilder()
        .setTitle(`coinflip - ${result.toUpperCase()}`)
        .setDescription(`**${winnerName}** gagne **${winnings.toFixed(2)}€**`)
        .addFields(
          { name: "resultat", value: result === "pile" ? "🪙 pile" : "🎯 face", inline: true },
          { name: "gagnant", value: `<@${winnerDiscordId}>`, inline: true }
        )
        .setColor(0x00ff00)
        .setFooter({ text: `fee: ${fee.toFixed(2)}€` });

      await response.update({ embeds: [resultEmbed], components: [] });

    } catch {
      // Timeout
      await interaction.editReply({
        embeds: [embed.setColor(0x666666).setFooter({ text: "expire" })],
        components: []
      });
    }
  },
};
