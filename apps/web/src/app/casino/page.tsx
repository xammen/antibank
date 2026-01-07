import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

const games = [
  {
    id: "click-battle",
    name: "Click Battle",
    description: "Duel de clics 1v1 - qui clique le plus vite?",
    icon: "👆",
    href: "/casino/click-battle",
    available: true,
    isNew: true,
  },
  {
    id: "arena",
    name: "Arena",
    description: "Rooms multijoueurs (2-8 joueurs) - Dés & PFC",
    icon: "🏟️",
    href: "/casino/arena",
    available: true,
  },
  {
    id: "crash",
    name: "Crash",
    description: "Multiplie ta mise, cashout avant le crash!",
    icon: "📈",
    href: "/casino/crash",
    available: true,
  },
  {
    id: "dice",
    name: "Duel de Dés",
    description: "Défie un autre joueur aux dés (legacy 1v1)",
    icon: "🎲",
    href: "/casino/dice",
    available: true,
  },
  {
    id: "pfc",
    name: "Pierre-Feuille-Ciseaux",
    description: "Le classique, avec de l'argent (legacy 1v1)",
    icon: "✊",
    href: "/casino/pfc",
    available: true,
  },
  {
    id: "lottery",
    name: "Loterie",
    description: "Ticket à 1€, tirage hebdomadaire",
    icon: "🎰",
    href: "/casino/lottery",
    available: true,
  },
];

export default async function CasinoPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <main className="min-h-screen flex flex-col items-center pt-[10vh] px-6 pb-20">
      <div className="max-w-[600px] w-full flex flex-col gap-8 animate-fade-in">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <Link
            href="/dashboard"
            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
          >
            &larr; retour
          </Link>
          <h1 className="text-[0.85rem] uppercase tracking-widest">casino</h1>
        </header>

        {/* Intro */}
        <div className="text-center">
          <p className="text-[var(--text-muted)] text-sm">
            la maison prend 5% sur tous les gains.
          </p>
        </div>

        {/* Games Grid */}
        <div className="grid gap-4">
          {games.map((game) => (
            <Link
              key={game.id}
              href={game.available ? game.href : "#"}
              prefetch={false}
              className={`
                flex items-center gap-4 p-5 border border-[var(--line)] 
                bg-[rgba(255,255,255,0.01)]
                transition-all duration-200
                ${game.available 
                  ? "hover:border-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.03)] cursor-pointer" 
                  : "opacity-40 cursor-not-allowed"
                }
              `}
            >
              <span className="text-3xl">{game.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium">{game.name}</h2>
                  {!game.available && (
                    <span className="text-[0.6rem] uppercase tracking-widest text-[var(--text-muted)] px-1.5 py-0.5 border border-[var(--line)]">
                      bientot
                    </span>
                  )}
                  {"isNew" in game && game.isNew && (
                    <span className="text-[0.6rem] uppercase tracking-widest text-green-400 px-1.5 py-0.5 border border-green-400/50">
                      new
                    </span>
                  )}
                </div>
                <p className="text-[0.75rem] text-[var(--text-muted)] mt-1">
                  {game.description}
                </p>
              </div>
              {game.available && (
                <span className="text-[var(--text-muted)]">&rarr;</span>
              )}
            </Link>
          ))}
        </div>

        {/* Warning */}
        <div className="text-center p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
          <p className="text-[0.7rem] text-[var(--text-muted)]">
            ⚠️ le jeu est réservé aux majeurs. mise responsable.
            <br />
            ptrddrrr tout sur le rouge les frères
          </p>
        </div>
      </div>
    </main>
  );
}
