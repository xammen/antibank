import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { prisma, Prisma } from "@antibank/db";

const TRANSFER_FEE_PERCENT = 2;

export const give = {
  data: new SlashCommandBuilder()
    .setName("give")
    .setDescription("Envoyer de l'argent à un autre joueur")
    .addUserOption((option) =>
      option
        .setName("destinataire")
        .setDescription("Le joueur qui recevra l'argent")
        .setRequired(true)
    )
    .addNumberOption((option) =>
      option
        .setName("montant")
        .setDescription("Montant à envoyer")
        .setRequired(true)
        .setMinValue(0.01)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("destinataire", true);
    const amount = interaction.options.getNumber("montant", true);

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "Vous ne pouvez pas vous envoyer de l'argent.", ephemeral: true });
      return;
    }

    if (targetUser.bot) {
      await interaction.reply({ content: "Vous ne pouvez pas envoyer à un bot.", ephemeral: true });
      return;
    }

    const [sender, receiver] = await Promise.all([
      prisma.user.findUnique({ where: { discordId: interaction.user.id }, select: { id: true, balance: true } }),
      prisma.user.findUnique({ where: { discordId: targetUser.id }, select: { id: true } }),
    ]);

    if (!sender) {
      await interaction.reply({ content: "Vous n'avez pas de compte AntiBank.", ephemeral: true });
      return;
    }

    if (!receiver) {
      await interaction.reply({ content: `**${targetUser.username}** n'a pas de compte AntiBank.`, ephemeral: true });
      return;
    }

    const senderBalance = parseFloat(sender.balance.toString());
    const fee = Math.floor(amount * TRANSFER_FEE_PERCENT) / 100;
    const totalCost = amount + fee;

    if (senderBalance < totalCost) {
      await interaction.reply({ 
        content: `Solde insuffisant.\n\n` +
          `Montant : \`${amount.toFixed(2)} €\`\n` +
          `Frais (2%) : \`${fee.toFixed(2)} €\`\n` +
          `**Total requis : \`${totalCost.toFixed(2)} €\`**\n\n` +
          `Votre solde : \`${senderBalance.toFixed(2)} €\``, 
        ephemeral: true 
      });
      return;
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: sender.id },
        data: { balance: { decrement: totalCost } },
      }),
      prisma.user.update({
        where: { id: receiver.id },
        data: { balance: { increment: amount } },
      }),
      prisma.transaction.create({
        data: {
          userId: sender.id,
          type: "transfer_out",
          amount: new Prisma.Decimal(-totalCost),
          description: `Envoi à ${targetUser.username}`,
        },
      }),
      prisma.transaction.create({
        data: {
          userId: receiver.id,
          type: "transfer_in",
          amount: new Prisma.Decimal(amount),
          description: `Reçu de ${interaction.user.username}`,
        },
      }),
    ]);

    const embed = new EmbedBuilder()
      .setTitle("💸 Transfert effectué")
      .setDescription(`**${interaction.user.username}** → **${targetUser.username}**`)
      .setColor(0x2ecc71)
      .addFields(
        { name: "💵 Montant envoyé", value: `\`${amount.toFixed(2)} €\``, inline: true },
        { name: "💳 Frais (2%)", value: `\`${fee.toFixed(2)} €\``, inline: true },
        { name: "📊 Total débité", value: `\`${totalCost.toFixed(2)} €\``, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
