import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      discordId: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      balance: string;
      isAdmin: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    discordId?: string;
  }
}
