import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, ChannelType } from "discord.js";
import { prisma, Prisma } from "@antibank/db";
import { invalidateChannelCache } from "../lib/notifications.js";

export const admin = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("commandes admin")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("setmoney")
        .setDescription("modifier le solde d'un joueur")
        .addUserOption((opt) => opt.setName("user").setDescription("le joueur").setRequired(true))
        .addNumberOption((opt) => opt.setName("montant").setDescription("nouveau solde").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("addmoney")
        .setDescription("ajouter de l'argent a un joueur")
        .addUserOption((opt) => opt.setName("user").setDescription("le joueur").setRequired(true))
        .addNumberOption((opt) => opt.setName("montant").setDescription("montant a ajouter").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("ban")
        .setDescription("bannir un joueur d'antibank")
        .addUserOption((opt) => opt.setName("user").setDescription("le joueur").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("unban")
        .setDescription("debannir un joueur")
        .addUserOption((opt) => opt.setName("user").setDescription("le joueur").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("config")
        .setDescription("configurer un channel de notification")
        .addStringOption((opt) =>
          opt
            .setName("type")
            .setDescription("type de notification")
            .setRequired(true)
            .addChoices(
              { name: "braquages", value: "braquages" },
              { name: "justice", value: "justice" },
              { name: "casino", value: "casino" },
              { name: "leaderboard", value: "leaderboard" }
            )
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("le channel")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("showconfig")
        .setDescription("voir la config actuelle")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "setmoney") {
      const targetUser = interaction.options.getUser("user", true);
      const amount = interaction.options.getNumber("montant", true);

      const user = await prisma.user.findUnique({
        where: { discordId: targetUser.id },
        select: { id: true, balance: true }
      });

      if (!user) {
        await interaction.reply({ content: `${targetUser.username} n'a pas de compte`, ephemeral: true });
        return;
      }

      const oldBalance = parseFloat(user.balance.toString());
      
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { balance: amount }
        }),
        prisma.transaction.create({
          data: {
            userId: user.id,
            type: "admin_set",
            amount: new Prisma.Decimal(amount - oldBalance),
            description: `set par ${interaction.user.username}`
          }
        })
      ]);

      await interaction.reply({ 
        content: `solde de ${targetUser.username}: ${oldBalance.toFixed(2)}€ → ${amount.toFixed(2)}€`,
        ephemeral: true 
      });
    }

    else if (subcommand === "addmoney") {
      const targetUser = interaction.options.getUser("user", true);
      const amount = interaction.options.getNumber("montant", true);

      const user = await prisma.user.findUnique({
        where: { discordId: targetUser.id },
        select: { id: true }
      });

      if (!user) {
        await interaction.reply({ content: `${targetUser.username} n'a pas de compte`, ephemeral: true });
        return;
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { balance: { increment: amount } }
        }),
        prisma.transaction.create({
          data: {
            userId: user.id,
            type: "admin_add",
            amount: new Prisma.Decimal(amount),
            description: `ajoute par ${interaction.user.username}`
          }
        })
      ]);

      await interaction.reply({ 
        content: `${amount >= 0 ? "+" : ""}${amount.toFixed(2)}€ pour ${targetUser.username}`,
        ephemeral: true 
      });
    }

    else if (subcommand === "ban") {
      const targetUser = interaction.options.getUser("user", true);

      const result = await prisma.user.updateMany({
        where: { discordId: targetUser.id },
        data: { isBanned: true }
      });

      if (result.count === 0) {
        await interaction.reply({ content: `${targetUser.username} n'a pas de compte`, ephemeral: true });
        return;
      }

      await interaction.reply({ content: `${targetUser.username} est banni d'antibank`, ephemeral: true });
    }

    else if (subcommand === "unban") {
      const targetUser = interaction.options.getUser("user", true);

      const result = await prisma.user.updateMany({
        where: { discordId: targetUser.id },
        data: { isBanned: false }
      });

      if (result.count === 0) {
        await interaction.reply({ content: `${targetUser.username} n'a pas de compte`, ephemeral: true });
        return;
      }

      await interaction.reply({ content: `${targetUser.username} est debanni`, ephemeral: true });
    }

    else if (subcommand === "config") {
      const type = interaction.options.getString("type", true);
      const channel = interaction.options.getChannel("channel", true);

      const key = `channel_${type}`;
      const now = new Date();

      await prisma.$executeRaw`
        INSERT INTO "BotConfig" (key, value, "guildId", "updatedAt")
        VALUES (${key}, ${channel.id}, ${interaction.guildId}, ${now})
        ON CONFLICT (key) DO UPDATE SET value = ${channel.id}, "updatedAt" = ${now}
      `;

      // Invalider le cache
      invalidateChannelCache();

      await interaction.reply({ 
        content: `channel ${type} configure: <#${channel.id}>`,
        ephemeral: true 
      });
    }

    else if (subcommand === "showconfig") {
      const configs = await prisma.$queryRaw<Array<{ key: string; value: string }>>`
        SELECT key, value FROM "BotConfig"
        WHERE "guildId" = ${interaction.guildId}
        ORDER BY key
      `;

      if (configs.length === 0) {
        await interaction.reply({ content: "aucune config", ephemeral: true });
        return;
      }

      const lines = configs.map(c => `${c.key.replace("channel_", "")}: <#${c.value}>`);
      await interaction.reply({ content: lines.join("\n"), ephemeral: true });
    }
  },
};
