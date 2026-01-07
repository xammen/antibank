import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { prisma, Prisma } from "@antibank/db";

const TRANSFER_FEE_PERCENT = 2; // 2% de frais

export const give = {
  data: new SlashCommandBuilder()
    .setName("give")
    .setDescription("donner de l'argent a quelqu'un")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("a qui donner")
        .setRequired(true)
    )
    .addNumberOption((option) =>
      option
        .setName("montant")
        .setDescription("combien donner")
        .setRequired(true)
        .setMinValue(0.01)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user", true);
    const amount = interaction.options.getNumber("montant", true);

    // Verifications de base
    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "tu peux pas te donner de l'argent a toi-meme", ephemeral: true });
      return;
    }

    if (targetUser.bot) {
      await interaction.reply({ content: "tu peux pas donner a un bot", ephemeral: true });
      return;
    }

    // Verifier que les deux users existent
    const [sender, receiver] = await Promise.all([
      prisma.user.findUnique({ where: { discordId: interaction.user.id }, select: { id: true, balance: true } }),
      prisma.user.findUnique({ where: { discordId: targetUser.id }, select: { id: true } }),
    ]);

    if (!sender) {
      await interaction.reply({ content: "t'as pas de compte antibank. connecte-toi sur le site d'abord.", ephemeral: true });
      return;
    }

    if (!receiver) {
      await interaction.reply({ content: `${targetUser.username} n'a pas de compte antibank`, ephemeral: true });
      return;
    }

    const senderBalance = parseFloat(sender.balance.toString());
    
    // Calculer les frais
    const fee = Math.floor(amount * TRANSFER_FEE_PERCENT) / 100;
    const totalCost = amount + fee;

    if (senderBalance < totalCost) {
      await interaction.reply({ 
        content: `pas assez de thunes. tu veux envoyer ${amount.toFixed(2)}€ + ${fee.toFixed(2)}€ de frais = ${totalCost.toFixed(2)}€ total`, 
        ephemeral: true 
      });
      return;
    }

    // Transaction atomique
    await prisma.$transaction([
      // Debiter le sender
      prisma.user.update({
        where: { id: sender.id },
        data: { balance: { decrement: totalCost } },
      }),
      // Crediter le receiver
      prisma.user.update({
        where: { id: receiver.id },
        data: { balance: { increment: amount } },
      }),
      // Transaction sender
      prisma.transaction.create({
        data: {
          userId: sender.id,
          type: "transfer_out",
          amount: new Prisma.Decimal(-totalCost),
          description: `envoi a ${targetUser.username} (${fee.toFixed(2)}€ frais)`,
        },
      }),
      // Transaction receiver
      prisma.transaction.create({
        data: {
          userId: receiver.id,
          type: "transfer_in",
          amount: new Prisma.Decimal(amount),
          description: `recu de ${interaction.user.username}`,
        },
      }),
    ]);

    await interaction.reply({
      content: `tu as envoye **${amount.toFixed(2)}€** a ${targetUser.username} (frais: ${fee.toFixed(2)}€)`,
    });
  },
};
