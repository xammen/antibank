import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function LotteryPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-[400px] w-full flex flex-col items-center gap-8 text-center animate-fade-in">
        <span className="text-6xl">🎰</span>
        <div>
          <h1 className="text-xl font-medium mb-2">loterie hebdomadaire</h1>
          <p className="text-sm text-[var(--text-muted)]">
            ticket à 1€, tirage chaque dimanche 20h
            <br />jackpot = toutes les mises + 20€ bonus
          </p>
        </div>
        
        <div className="p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.02)] w-full">
          <p className="text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)] mb-2">
            bientôt disponible
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            cette fonctionnalité arrive très bientôt
          </p>
        </div>

        <Link
          href="/casino"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          &larr; retour au casino
        </Link>
      </div>
    </main>
  );
}
