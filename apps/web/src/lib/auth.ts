import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { prisma } from "@antibank/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "identify",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || !profile) return false;

      const discordProfile = profile as {
        id: string;
        username: string;
        avatar?: string;
      };

      // Upsert user in database
      await prisma.user.upsert({
        where: { discordId: discordProfile.id },
        update: {
          discordUsername: discordProfile.username,
          discordAvatar: discordProfile.avatar,
        },
        create: {
          discordId: discordProfile.id,
          discordUsername: discordProfile.username,
          discordAvatar: discordProfile.avatar,
          balance: 0,
        },
      });

      return true;
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const discordProfile = profile as { id: string };
        token.discordId = discordProfile.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.discordId) {
        const user = await prisma.user.findUnique({
          where: { discordId: token.discordId as string },
        });
        if (user) {
          session.user.id = user.id;
          session.user.discordId = user.discordId;
          session.user.balance = user.balance.toString();
          session.user.isAdmin = user.isAdmin;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
