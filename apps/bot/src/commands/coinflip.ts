import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { prisma, Prisma } from "@antibank/db";

const MIN_BET = 0.5;
const MAX_BET = 100;
const HOUSE_FEE_PERCENT = 5;

export const coinflip = {
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Jouer à pile ou face contre un autre joueur")
    .addUserOption((option) =>
      option
        .setName("adversaire")
        .setDescription("Votre adversaire")
        .setRequired(true)
    )
    .addNumberOption((option) =>
      option
        .setName("mise")
        .setDescription("Montant de la mise (0.50 à 100 €)")
        .setRequired(true)
        .setMinValue(MIN_BET)
        .setMaxValue(MAX_BET)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("adversaire", true);
    const amount = interaction.options.getNumber("mise", true);

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "Vous ne pouvez pas jouer contre vous-même.", ephemeral: true });
      return;
    }

    if (targetUser.bot) {
      await interaction.reply({ content: "Vous ne pouvez pas jouer contre un bot.", ephemeral: true });
      return;
    }

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
      await interaction.reply({ content: "Vous n'avez pas de compte AntiBank.", ephemeral: true });
      return;
    }

    if (!player2) {
      await interaction.reply({ content: `**${targetUser.username}** n'a pas de compte AntiBank.`, ephemeral: true });
      return;
    }

    const p1Balance = parseFloat(player1.balance.toString());
    const p2Balance = parseFloat(player2.balance.toString());

    if (p1Balance < amount) {
      await interaction.reply({ content: `Solde insuffisant. Vous avez \`${p1Balance.toFixed(2)} €\`.`, ephemeral: true });
      return;
    }

    if (p2Balance < amount) {
      await interaction.reply({ content: `**${targetUser.username}** n'a pas assez (\`${p2Balance.toFixed(2)} €\`).`, ephemeral: true });
      return;
    }

    const pot = amount * 2;
    const fee = Math.floor(pot * HOUSE_FEE_PERCENT) / 100;
    const winnings = pot - fee;

    const acceptButton = new ButtonBuilder()
      .setCustomId("coinflip_accept")
      .setLabel("Accepter")
      .setStyle(ButtonStyle.Success);

    const declineButton = new ButtonBuilder()
      .setCustomId("coinflip_decline")
      .setLabel("Refuser")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptButton, declineButton);

    const embed = new EmbedBuilder()
      .setTitle("🪙 Pile ou Face")
      .setDescription(`**${interaction.user.username}** défie **${targetUser.username}**`)
      .setColor(0xf1c40f)
      .addFields(
        { name: "💵 Mise", value: `\`${amount.toFixed(2)} €\` chacun`, inline: true },
        { name: "🏆 Gain possible", value: `\`${winnings.toFixed(2)} €\``, inline: true },
        { name: "💳 Frais (5%)", value: `\`${fee.toFixed(2)} €\``, inline: true }
      )
      .setFooter({ text: `${targetUser.username} a 30 secondes pour répondre.` });

    const message = await interaction.reply({ 
      content: `<@${targetUser.id}>`,
      embeds: [embed], 
      components: [row],
      fetchReply: true 
    });

    try {
      const response = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === targetUser.id,
        time: 30000
      });

      if (response.customId === "coinflip_decline") {
        const declinedEmbed = EmbedBuilder.from(embed)
          .setColor(0x95a5a6)
          .setFooter({ text: "Défi refusé." });
        
        await response.update({ embeds: [declinedEmbed], components: [] });
        return;
      }

      // Vérifier à nouveau les soldes
      const [p1Check, p2Check] = await Promise.all([
        prisma.user.findUnique({ where: { id: player1.id }, select: { balance: true } }),
        prisma.user.findUnique({ where: { id: player2.id }, select: { balance: true } }),
      ]);

      if (!p1Check || !p2Check || 
          parseFloat(p1Check.balance.toString()) < amount || 
          parseFloat(p2Check.balance.toString()) < amount) {
        
        const errorEmbed = EmbedBuilder.from(embed)
          .setColor(0xe74c3c)
          .setDescription("Solde insuffisant.")
          .setFooter({ text: "Partie annulée." });
        
        await response.update({ embeds: [errorEmbed], components: [] });
        return;
      }

      // Animation
      const suspenseEmbed = new EmbedBuilder()
        .setTitle("🪙 La pièce est lancée...")
        .setColor(0xf1c40f);
      
      await response.update({ embeds: [suspenseEmbed], components: [] });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Résultat
      const result = Math.random() < 0.5 ? "Pile" : "Face";
      const winnerId = Math.random() < 0.5 ? player1.id : player2.id;
      const winnerDiscordId = winnerId === player1.id ? interaction.user.id : targetUser.id;
      const winnerName = winnerId === player1.id ? interaction.user.username : targetUser.username;
      const loserName = winnerId === player1.id ? targetUser.username : interaction.user.username;
      const loserId = winnerId === player1.id ? player2.id : player1.id;

      await prisma.$transaction([
        prisma.user.update({
          where: { id: player1.id },
          data: { balance: { decrement: amount } }
        }),
        prisma.user.update({
          where: { id: player2.id },
          data: { balance: { decrement: amount } }
        }),
        prisma.user.update({
          where: { id: winnerId },
          data: { balance: { increment: winnings } }
        }),
        prisma.transaction.create({
          data: {
            userId: winnerId,
            type: "coinflip_win",
            amount: new Prisma.Decimal(winnings - amount),
            description: `Coinflip gagné contre ${loserName}`
          }
        }),
        prisma.transaction.create({
          data: {
            userId: loserId,
            type: "coinflip_loss",
            amount: new Prisma.Decimal(-amount),
            description: `Coinflip perdu contre ${winnerName}`
          }
        }),
      ]);

      const resultEmbed = new EmbedBuilder()
        .setTitle(`🪙 ${result} !`)
        .setDescription(`**${winnerName}** remporte \`${winnings.toFixed(2)} €\``)
        .setColor(0x2ecc71)
        .addFields(
          { name: "🏆 Gagnant", value: `<@${winnerDiscordId}>`, inline: true },
          { name: "💵 Pot total", value: `\`${pot.toFixed(2)} €\``, inline: true },
          { name: "💳 Frais AntiBank", value: `\`${fee.toFixed(2)} €\``, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed] });

    } catch {
      const expiredEmbed = EmbedBuilder.from(embed)
        .setColor(0x95a5a6)
        .setFooter({ text: "Temps écoulé." });
      
      await interaction.editReply({ embeds: [expiredEmbed], components: [] });
    }
  },
};
