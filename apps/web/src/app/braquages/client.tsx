"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getRobberyTargets,
  getRobberyCooldown,
  attemptRobbery,
  getRobberyHistory,
} from "@/actions/robbery";
import {
  getActiveBounties,
  createBounty,
  getBountyTargets,
} from "@/actions/bounty";

interface RobberyTarget {
  id: string;
  discordUsername: string;
  balance: number;
  hasBounty: boolean;
  bountyAmount: number;
}

interface RobberyHistoryItem {
  id: string;
  success: boolean;
  amount: number;
  victimName?: string;
  robberName?: string;
  isRobber: boolean;
  createdAt: Date;
}

interface ActiveBounty {
  id: string;
  targetId: string;
  targetName: string;
  posterId: string;
  posterName: string;
  amount: number;
  expiresAt: Date;
}

interface RobberyClientProps {
  userId: string;
}

export function RobberyClient({ userId }: RobberyClientProps) {
  const [targets, setTargets] = useState<RobberyTarget[]>([]);
  const [history, setHistory] = useState<RobberyHistoryItem[]>([]);
  const [bounties, setBounties] = useState<ActiveBounty[]>([]);
  const [canRob, setCanRob] = useState(true);
  const [cooldownEnds, setCooldownEnds] = useState<number | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isRobbing, setIsRobbing] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    amount: number;
    victimName: string;
    chance: number;
    roll: number;
  } | null>(null);

  // Bounty form state
  const [showBountyForm, setShowBountyForm] = useState(false);
  const [bountyTargets, setBountyTargets] = useState<{ id: string; discordUsername: string; balance: number }[]>([]);
  const [selectedBountyTarget, setSelectedBountyTarget] = useState("");
  const [bountyAmount, setBountyAmount] = useState("1");
  const [isCreatingBounty, setIsCreatingBounty] = useState(false);

  const loadData = useCallback(async () => {
    const [targetsRes, cooldownRes, historyRes, bountiesRes] = await Promise.all([
      getRobberyTargets(),
      getRobberyCooldown(),
      getRobberyHistory(10),
      getActiveBounties(),
    ]);

    if (targetsRes.success && targetsRes.targets) {
      setTargets(targetsRes.targets);
    }
    setCanRob(cooldownRes.canRob);
    setCooldownEnds(cooldownRes.cooldownEnds);
    if (historyRes.success && historyRes.history) {
      setHistory(historyRes.history);
    }
    if (bountiesRes.success && bountiesRes.bounties) {
      setBounties(bountiesRes.bounties);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cooldown countdown
  useEffect(() => {
    if (!cooldownEnds) return;

    const interval = setInterval(() => {
      const remaining = cooldownEnds - Date.now();
      if (remaining <= 0) {
        setCanRob(true);
        setCooldownEnds(undefined);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownEnds]);

  const handleRob = async (targetId: string) => {
    if (isRobbing) return;
    setIsRobbing(targetId);
    setLastResult(null);

    const result = await attemptRobbery(targetId);

    if (result.success && result.robbery) {
      setLastResult(result.robbery);
      setCanRob(false);
      setCooldownEnds(Date.now() + 3 * 60 * 60 * 1000);
      // Reload data
      loadData();
    }

    setIsRobbing(null);
  };

  const handleOpenBountyForm = async () => {
    setShowBountyForm(true);
    const res = await getBountyTargets();
    if (res.success && res.targets) {
      setBountyTargets(res.targets);
    }
  };

  const handleCreateBounty = async () => {
    if (!selectedBountyTarget || isCreatingBounty) return;
    setIsCreatingBounty(true);

    const amount = parseFloat(bountyAmount);
    if (isNaN(amount) || amount < 1) {
      setIsCreatingBounty(false);
      return;
    }

    const result = await createBounty(selectedBountyTarget, amount);
    
    if (result.success) {
      setShowBountyForm(false);
      setSelectedBountyTarget("");
      setBountyAmount("1");
      loadData();
    }

    setIsCreatingBounty(false);
  };

  const formatCooldown = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const formatTimeAgo = (date: Date) => {
    const now = Date.now();
    const diff = now - new Date(date).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours > 0) return `il y a ${hours}h`;
    if (minutes > 0) return `il y a ${minutes}m`;
    return "a l'instant";
  };

  if (isLoading) {
    return (
      <div className="max-w-[600px] w-full flex flex-col gap-8 animate-fade-in">
        <div className="text-center text-[var(--text-muted)]">chargement...</div>
      </div>
    );
  }

  return (
    <div className="max-w-[600px] w-full flex flex-col gap-8 animate-fade-in">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
        <Link
          href="/dashboard"
          className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm"
        >
          &larr; retour
        </Link>
        <h1 className="text-[0.85rem] uppercase tracking-widest">braquages</h1>
      </header>

      {/* Cooldown Status */}
      {!canRob && cooldownEnds && (
        <div className="text-center p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
          <p className="text-[var(--text-muted)] text-sm">
            prochain braquage dans{" "}
            <span className="text-[var(--text)]">
              {formatCooldown(cooldownEnds - Date.now())}
            </span>
          </p>
        </div>
      )}

      {/* Last Result */}
      {lastResult && (
        <div
          className={`p-4 border ${
            lastResult.success
              ? "border-green-500/50 bg-green-500/5"
              : "border-red-500/50 bg-red-500/5"
          }`}
        >
          <p className="text-center">
            {lastResult.success ? (
              <>
                <span className="text-green-400">braquage reussi!</span>
                <br />
                <span className="text-[var(--text-muted)] text-sm">
                  +{lastResult.amount.toFixed(2)} voles a {lastResult.victimName}
                </span>
              </>
            ) : (
              <>
                <span className="text-red-400">braquage rate!</span>
                <br />
                <span className="text-[var(--text-muted)] text-sm">
                  -{lastResult.amount.toFixed(2)} de penalite
                </span>
              </>
            )}
            <br />
            <span className="text-[0.7rem] text-[var(--text-muted)]">
              chance: {lastResult.chance}% | de: {lastResult.roll}
            </span>
          </p>
        </div>
      )}

      {/* Targets */}
      <section>
        <h2 className="text-[0.75rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">
          cibles disponibles
        </h2>
        {targets.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm text-center py-4">
            aucune cible disponible (tu es le plus riche?)
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {targets.map((target) => (
              <div
                key={target.id}
                className="flex items-center justify-between p-3 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]"
              >
                <div>
                  <p className="text-sm">{target.discordUsername}</p>
                  <p className="text-[0.7rem] text-[var(--text-muted)]">
                    {target.balance.toFixed(2)}
                    {target.hasBounty && (
                      <span className="text-yellow-400 ml-2">
                        +{target.bountyAmount.toFixed(2)} prime
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleRob(target.id)}
                  disabled={!canRob || isRobbing !== null}
                  className={`
                    px-3 py-1.5 text-[0.75rem] uppercase tracking-wider border
                    ${
                      canRob && !isRobbing
                        ? "border-[var(--text-muted)] hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.05)]"
                        : "border-[var(--line)] text-[var(--text-muted)] cursor-not-allowed"
                    }
                    transition-all
                  `}
                >
                  {isRobbing === target.id ? "..." : "braquer"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active Bounties */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[0.75rem] uppercase tracking-widest text-[var(--text-muted)]">
            primes actives
          </h2>
          <button
            onClick={handleOpenBountyForm}
            className="text-[0.7rem] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            + nouvelle prime
          </button>
        </div>

        {showBountyForm && (
          <div className="mb-4 p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.02)]">
            <div className="flex flex-col gap-3">
              <select
                value={selectedBountyTarget}
                onChange={(e) => setSelectedBountyTarget(e.target.value)}
                className="bg-transparent border border-[var(--line)] p-2 text-sm"
              >
                <option value="">choisir une cible</option>
                {bountyTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.discordUsername} ({t.balance.toFixed(2)})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                step="0.5"
                value={bountyAmount}
                onChange={(e) => setBountyAmount(e.target.value)}
                placeholder="montant"
                className="bg-transparent border border-[var(--line)] p-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateBounty}
                  disabled={!selectedBountyTarget || isCreatingBounty}
                  className="flex-1 py-2 text-[0.75rem] uppercase tracking-wider border border-[var(--text-muted)] hover:border-[var(--text)] transition-all"
                >
                  {isCreatingBounty ? "..." : "poster la prime"}
                </button>
                <button
                  onClick={() => setShowBountyForm(false)}
                  className="px-3 py-2 text-[0.75rem] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {bounties.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm text-center py-4">
            aucune prime active
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {bounties.map((bounty) => (
              <div
                key={bounty.id}
                className="flex items-center justify-between p-3 border border-yellow-500/30 bg-yellow-500/5"
              >
                <div>
                  <p className="text-sm text-yellow-400">
                    {bounty.amount.toFixed(2)} sur {bounty.targetName}
                  </p>
                  <p className="text-[0.7rem] text-[var(--text-muted)]">
                    par {bounty.posterName}
                  </p>
                </div>
                <span className="text-[0.7rem] text-[var(--text-muted)]">
                  expire dans{" "}
                  {Math.ceil(
                    (new Date(bounty.expiresAt).getTime() - Date.now()) /
                      (1000 * 60 * 60)
                  )}
                  h
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="text-[0.75rem] uppercase tracking-widest text-[var(--text-muted)] mb-3">
          historique
        </h2>
        {history.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm text-center py-4">
            aucun braquage
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 text-[0.75rem]"
              >
                <span>
                  {item.isRobber ? (
                    item.success ? (
                      <span className="text-green-400">
                        +{item.amount.toFixed(2)} (braque {item.victimName})
                      </span>
                    ) : (
                      <span className="text-red-400">
                        -{item.amount.toFixed(2)} (echec sur {item.victimName})
                      </span>
                    )
                  ) : (
                    <span className="text-red-400">
                      -{item.amount.toFixed(2)} (braque par {item.robberName})
                    </span>
                  )}
                </span>
                <span className="text-[var(--text-muted)]">
                  {formatTimeAgo(item.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Info */}
      <div className="text-center p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
        <p className="text-[0.7rem] text-[var(--text-muted)]">
          40% de chances de base | +10% si la cible est 5x+ plus riche
          <br />
          succes: vole 10-20% | echec: perd 5% de ta balance
          <br />
          cooldown: 3h entre chaque tentative
        </p>
      </div>
    </div>
  );
}
