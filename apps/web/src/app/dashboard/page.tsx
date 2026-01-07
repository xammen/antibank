import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Clicker, type ClickerIcon } from "@/components/clicker";
import { Balance } from "@/components/balance";
import { SignOutButton } from "@/components/sign-out-button";
import { VoiceStatus } from "@/components/voice-status";
import { IconPicker } from "@/components/icon-picker";
import { Leaderboard } from "@/components/leaderboard";
import { prisma } from "@antibank/db";
import { calculateClickBonus, calculatePassiveBonus, calculateVocalBonus } from "@/lib/upgrades";
import Link from "next/link";

export default async function Dashboard() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  // Récupérer le user avec ses upgrades
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { upgrades: true },
  });

  const upgradeData = user?.upgrades.map((u) => ({
    upgradeId: u.upgradeId,
    level: u.level,
  })) || [];

  const clickBonus = calculateClickBonus(upgradeData);
  const passiveBonus = calculatePassiveBonus(upgradeData);
  const vocalBonus = calculateVocalBonus(upgradeData);

  const clickValue = 0.01 + clickBonus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clickerIcon = ((user as any)?.clickerIcon || "cookie") as ClickerIcon;

  return (
    <main className="min-h-screen flex flex-col items-center pt-[8vh] px-6">
      <div className="max-w-[500px] w-full flex flex-col gap-12 animate-fade-in">
        
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-green-500/50"></span>
            <h1 className="text-[0.85rem] text-[var(--text-muted)]">
              {session.user.name?.toLowerCase() || "anon"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <IconPicker currentIcon={clickerIcon} />
            <SignOutButton />
          </div>
        </header>

        {/* Voice Status */}
        <VoiceStatus />

        {/* Main Action Area */}
        <div className="flex flex-col gap-8">
          <Balance initialBalance={session.user.balance} />
          <Clicker userId={session.user.id} clickValue={clickValue} icon={clickerIcon} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 pt-8 border-t border-[var(--line)] opacity-60">
          <div className="text-center p-3 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
            <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-1">clic</p>
            <p className="text-[0.8rem] font-mono">+{clickValue.toFixed(3)}€</p>
          </div>
          <div className="text-center p-3 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
            <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-1">passif</p>
            <p className="text-[0.8rem] font-mono">+{passiveBonus.toFixed(3)}€/m</p>
          </div>
          <div className="text-center p-3 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
            <p className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] mb-1">vocal</p>
            <p className="text-[0.8rem] font-mono">+{vocalBonus.toFixed(3)}€/m</p>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="grid grid-cols-3 gap-3">
          <Link
            href="/shop"
            className="flex items-center justify-center gap-2 p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)] hover:bg-[rgba(255,255,255,0.03)] hover:border-[var(--text-muted)] transition-all duration-200"
          >
            <span className="text-lg">🛒</span>
            <span className="text-sm uppercase tracking-widest">shop</span>
          </Link>
          <Link
            href="/casino"
            className="flex items-center justify-center gap-2 p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)] hover:bg-[rgba(255,255,255,0.03)] hover:border-[var(--text-muted)] transition-all duration-200"
          >
            <span className="text-lg">🎰</span>
            <span className="text-sm uppercase tracking-widest">casino</span>
          </Link>
          <Link
            href="/braquages"
            className="flex items-center justify-center gap-2 p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)] hover:bg-[rgba(255,255,255,0.03)] hover:border-[var(--text-muted)] transition-all duration-200"
          >
            <span className="text-lg">🔫</span>
            <span className="text-sm uppercase tracking-widest">braquages</span>
          </Link>
        </div>

        {/* Leaderboard */}
        <Leaderboard />
      </div>
    </main>
  );
}
