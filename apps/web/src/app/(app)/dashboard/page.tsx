import { auth } from "@/lib/auth";
import { type ClickerIcon } from "@/components/clicker";
import { VoiceStatus } from "@/components/voice-status";
import { ClickerArea } from "@/components/clicker-area";
import { Leaderboard } from "@/components/leaderboard";
import { prisma } from "@antibank/db";
import { calculateClickBonus, calculatePassiveBonus, calculateVocalBonus } from "@/lib/upgrades";
import { getCurrentPrice } from "@/actions/dahkacoin";
import Link from "next/link";

export default async function Dashboard() {
  const session = await auth();
  
  // Session garantie par le layout parent
  const userId = session!.user.id;

  // Récupérer le user avec ses upgrades + dahkaCoins
  const [user, dcPrice] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { upgrades: true },
    }),
    getCurrentPrice(),
  ]);

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
  const dahkaCoins = user?.dahkaCoins ? Number(user.dahkaCoins) : 0;
  const dcValue = dahkaCoins * dcPrice.price;

  return (
    <main className="min-h-screen relative">
      {/* Leaderboard - Fixed on left for desktop, below content on mobile */}
      <aside className="hidden lg:block fixed left-6 top-[8vh] w-[280px] z-10">
        <Leaderboard />
      </aside>

      {/* Main content - centered */}
      <div className="min-h-screen flex flex-col items-center pt-[8vh] px-6 pb-20 lg:pb-6">
        <div className="max-w-[500px] w-full flex flex-col gap-12 animate-fade-in">
          
          <ClickerArea
            userId={userId}
            userName={session!.user.name || "anon"}
            clickValue={clickValue}
            initialIcon={clickerIcon}
            initialBalance={session!.user.balance}
            voiceStatus={<VoiceStatus />}
            stats={
              <div className="flex flex-col gap-3 pt-8 border-t border-[var(--line)]">
                {/* DahkaCoin Widget */}
                {dahkaCoins > 0 && (
                  <Link 
                    href="/dahkacoin"
                    className="flex items-center justify-between p-3 border border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400">📈</span>
                      <span className="text-[0.7rem] uppercase tracking-widest text-purple-400">dahkacoin</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono text-purple-400">{dahkaCoins.toFixed(2)} dc</p>
                      <p className="text-[0.65rem] text-[var(--text-muted)]">≈ {dcValue.toFixed(2)}€</p>
                    </div>
                  </Link>
                )}
                
                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3 opacity-60">
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
              </div>
            }
            navigation={
              <div className="grid grid-cols-2 gap-3">
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
                <Link
                  href="/justice"
                  className="flex items-center justify-center gap-2 p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)] hover:bg-[rgba(255,255,255,0.03)] hover:border-[var(--text-muted)] transition-all duration-200"
                >
                  <span className="text-lg">⚖️</span>
                  <span className="text-sm uppercase tracking-widest">justice</span>
                </Link>
                <Link
                  href="/dahkacoin"
                  className="col-span-2 flex items-center justify-center gap-2 p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)] hover:bg-[rgba(255,255,255,0.03)] hover:border-[var(--text-muted)] transition-all duration-200"
                >
                  <span className="text-lg">📈</span>
                  <span className="text-sm uppercase tracking-widest">dahkacoin</span>
                </Link>
              </div>
            }
          />

          {/* Leaderboard - Only visible on mobile (below lg breakpoint) */}
          <div className="lg:hidden">
            <Leaderboard />
          </div>
        </div>
      </div>
    </main>
  );
}
