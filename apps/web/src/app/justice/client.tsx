"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getActiveWarns,
  createWarn,
  voteOnWarn,
  getWarnTargets,
  getActiveRevolution,
  startRevolution,
  voteOnRevolution,
} from "@/actions/justice";

interface ActiveWarn {
  id: string;
  accuserId: string;
  accuserName: string;
  accusedId: string;
  accusedName: string;
  reason: string;
  amount: number;
  guiltyVotes: number;
  innocentVotes: number;
  endsAt: Date;
  myVote?: string;
}

interface RevolutionInfo {
  id: string;
  initiatorName: string;
  targetName: string;
  targetBalance: number;
  medianBalance: number;
  forVotes: number;
  againstVotes: number;
  endsAt: Date;
  myVote?: string;
}

interface JusticeClientProps {
  userId: string;
}

export function JusticeClient({ userId }: JusticeClientProps) {
  const [warns, setWarns] = useState<ActiveWarn[]>([]);
  const [revolution, setRevolution] = useState<RevolutionInfo | null>(null);
  const [canStartRevolution, setCanStartRevolution] = useState(false);
  const [richestInfo, setRichestInfo] = useState<{ name: string; balance: number; median: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [votingOn, setVotingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Warn form
  const [showWarnForm, setShowWarnForm] = useState(false);
  const [warnTargets, setWarnTargets] = useState<{ id: string; discordUsername: string; balance: number }[]>([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [warnReason, setWarnReason] = useState("");
  const [warnAmount, setWarnAmount] = useState("1");
  const [isCreatingWarn, setIsCreatingWarn] = useState(false);

  const loadData = useCallback(async () => {
    const [warnsRes, revRes] = await Promise.all([
      getActiveWarns(),
      getActiveRevolution(),
    ]);

    if (warnsRes.success && warnsRes.warns) {
      setWarns(warnsRes.warns);
    }

    if (revRes.success) {
      setRevolution(revRes.revolution || null);
      setCanStartRevolution(revRes.canStart || false);
      if (revRes.richestName) {
        setRichestInfo({
          name: revRes.richestName,
          balance: revRes.richestBalance || 0,
          median: revRes.medianBalance || 0
        });
      }
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [loadData]);

  const handleOpenWarnForm = async () => {
    setShowWarnForm(true);
    const res = await getWarnTargets();
    if (res.success && res.targets) {
      setWarnTargets(res.targets);
    }
  };

  const handleCreateWarn = async () => {
    if (!selectedTarget || isCreatingWarn) return;
    setIsCreatingWarn(true);
    setError(null);

    const amount = parseFloat(warnAmount);
    if (isNaN(amount) || amount < 0.5) {
      setError("montant minimum: 0.5€");
      setIsCreatingWarn(false);
      return;
    }

    const result = await createWarn(selectedTarget, warnReason, amount);
    
    if (result.success) {
      setShowWarnForm(false);
      setSelectedTarget("");
      setWarnReason("");
      setWarnAmount("1");
      loadData();
    } else {
      setError(result.error || "erreur inconnue");
      setTimeout(() => setError(null), 4000);
    }

    setIsCreatingWarn(false);
  };

  const handleVoteWarn = async (warnId: string, vote: "guilty" | "innocent") => {
    if (votingOn) return;
    setVotingOn(warnId);
    await voteOnWarn(warnId, vote);
    await loadData();
    setVotingOn(null);
  };

  const handleStartRevolution = async () => {
    if (votingOn) return;
    setVotingOn("revolution");
    setError(null);
    const result = await startRevolution();
    if (!result.success) {
      setError(result.error || "erreur inconnue");
      setTimeout(() => setError(null), 4000);
    }
    await loadData();
    setVotingOn(null);
  };

  const handleVoteRevolution = async (vote: "for" | "against") => {
    if (votingOn || !revolution) return;
    setVotingOn("revolution");
    await voteOnRevolution(vote);
    await loadData();
    setVotingOn(null);
  };

  const formatTimeRemaining = (endsAt: Date) => {
    const remaining = new Date(endsAt).getTime() - Date.now();
    if (remaining <= 0) return "terminé";
    const minutes = Math.floor(remaining / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    return `${minutes}m ${seconds}s`;
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
        <h1 className="text-[0.85rem] uppercase tracking-widest">justice</h1>
      </header>

      {/* Error toast */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="px-4 py-2 border border-red-500/30 bg-[#1a1a1a] text-red-400 text-sm shadow-lg">
            {error}
          </div>
        </div>
      )}

      {/* Revolution Section */}
      <section className="border border-red-500/30 bg-red-500/5 p-4">
        <h2 className="text-[0.75rem] uppercase tracking-widest text-red-400 mb-3">
          revolution
        </h2>

        {revolution ? (
          <div>
            <p className="text-sm mb-2">
              <span className="text-[var(--text-muted)]">cible:</span>{" "}
              {revolution.targetName} ({revolution.targetBalance.toFixed(2)})
            </p>
            <p className="text-sm mb-2">
              <span className="text-[var(--text-muted)]">mediane:</span>{" "}
              {revolution.medianBalance.toFixed(2)}
            </p>
            <p className="text-sm mb-3">
              <span className="text-green-400">pour: {revolution.forVotes}</span>
              {" | "}
              <span className="text-red-400">contre: {revolution.againstVotes}</span>
              {" | "}
              <span className="text-[var(--text-muted)]">
                {formatTimeRemaining(revolution.endsAt)}
              </span>
            </p>

            {revolution.myVote ? (
              <p className="text-sm text-[var(--text-muted)]">
                tu as vote: {revolution.myVote === "for" ? "pour" : "contre"}
              </p>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => handleVoteRevolution("for")}
                  disabled={votingOn !== null}
                  className="flex-1 py-2 text-[0.75rem] uppercase tracking-wider border border-green-500/50 text-green-400 hover:bg-green-500/10 transition-all"
                >
                  pour
                </button>
                <button
                  onClick={() => handleVoteRevolution("against")}
                  disabled={votingOn !== null}
                  className="flex-1 py-2 text-[0.75rem] uppercase tracking-wider border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-all"
                >
                  contre
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            {richestInfo && (
              <p className="text-sm text-[var(--text-muted)] mb-3">
                plus riche: {richestInfo.name} ({richestInfo.balance.toFixed(2)})
                <br />
                mediane: {richestInfo.median.toFixed(2)}
                <br />
                seuil: {(richestInfo.median * 3).toFixed(2)} (3x mediane)
              </p>
            )}
            {canStartRevolution ? (
              <button
                onClick={handleStartRevolution}
                disabled={votingOn !== null}
                className="w-full py-2 text-[0.75rem] uppercase tracking-wider border border-red-500 text-red-400 hover:bg-red-500/10 transition-all"
              >
                lancer la revolution (3)
              </button>
            ) : (
              <p className="text-sm text-[var(--text-muted)] text-center">
                conditions non remplies ou cooldown actif
              </p>
            )}
          </div>
        )}
      </section>

      {/* Warns Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[0.75rem] uppercase tracking-widest text-[var(--text-muted)]">
            votes en cours
          </h2>
          <button
            onClick={handleOpenWarnForm}
            className="text-[0.7rem] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            + nouveau warn
          </button>
        </div>

        {showWarnForm && (
          <div className="mb-4 p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.02)]">
            <div className="flex flex-col gap-3">
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="bg-[#1a1a1a] border border-[var(--line)] p-2 text-sm text-[var(--text)] rounded"
              >
                <option value="" className="bg-[#1a1a1a] text-[var(--text)]">choisir l&apos;accuse</option>
                {warnTargets.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[#1a1a1a] text-[var(--text)]">
                    {t.discordUsername} ({t.balance.toFixed(2)}€)
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={warnReason}
                onChange={(e) => setWarnReason(e.target.value)}
                placeholder="raison (min 3 caracteres)"
                className="bg-transparent border border-[var(--line)] p-2 text-sm"
              />
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={warnAmount}
                onChange={(e) => setWarnAmount(e.target.value)}
                placeholder="amende demandee"
                className="bg-transparent border border-[var(--line)] p-2 text-sm"
              />
              <p className="text-[0.7rem] text-[var(--text-muted)]">
                cout: 0.20 | max: 30% du solde de l&apos;accuse (plafond 50)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateWarn}
                  disabled={!selectedTarget || !warnReason || isCreatingWarn}
                  className="flex-1 py-2 text-[0.75rem] uppercase tracking-wider border border-[var(--text-muted)] hover:border-[var(--text)] transition-all"
                >
                  {isCreatingWarn ? "..." : "lancer le vote"}
                </button>
                <button
                  onClick={() => setShowWarnForm(false)}
                  className="px-3 py-2 text-[0.75rem] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {warns.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm text-center py-4">
            aucun vote en cours
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {warns.map((warn) => {
              const canVote = warn.accuserId !== userId && warn.accusedId !== userId && !warn.myVote;
              
              return (
                <div
                  key={warn.id}
                  className="p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm">
                        <span className="text-[var(--text-muted)]">{warn.accuserName}</span>
                        {" accuse "}
                        <span className="text-yellow-400">{warn.accusedName}</span>
                      </p>
                      <p className="text-[0.75rem] text-[var(--text-muted)] mt-1">
                        &quot;{warn.reason}&quot;
                      </p>
                    </div>
                    <span className="text-sm text-yellow-400">
                      {warn.amount.toFixed(2)}
                    </span>
                  </div>
                  
                  <p className="text-[0.75rem] mb-2">
                    <span className="text-red-400">coupable: {warn.guiltyVotes}</span>
                    {" | "}
                    <span className="text-green-400">innocent: {warn.innocentVotes}</span>
                    {" | "}
                    <span className="text-[var(--text-muted)]">
                      {formatTimeRemaining(warn.endsAt)}
                    </span>
                  </p>

                  {warn.myVote ? (
                    <p className="text-[0.75rem] text-[var(--text-muted)]">
                      tu as vote: {warn.myVote === "guilty" ? "coupable" : "innocent"}
                    </p>
                  ) : canVote ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleVoteWarn(warn.id, "guilty")}
                        disabled={votingOn !== null}
                        className="flex-1 py-1.5 text-[0.7rem] uppercase tracking-wider border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        coupable
                      </button>
                      <button
                        onClick={() => handleVoteWarn(warn.id, "innocent")}
                        disabled={votingOn !== null}
                        className="flex-1 py-1.5 text-[0.7rem] uppercase tracking-wider border border-green-500/50 text-green-400 hover:bg-green-500/10 transition-all"
                      >
                        innocent
                      </button>
                    </div>
                  ) : (
                    <p className="text-[0.7rem] text-[var(--text-muted)]">
                      tu ne peux pas voter sur ce warn
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Info */}
      <div className="text-center p-4 border border-[var(--line)] bg-[rgba(255,255,255,0.01)]">
        <p className="text-[0.7rem] text-[var(--text-muted)]">
          <strong>warn:</strong> vote 10min, quorum 3 votants
          <br />
          coupable: amende appliquee, 50% aux votants
          <br />
          innocent: accusateur paie 50% a l&apos;accuse
          <br />
          <br />
          <strong>revolution:</strong> si le plus riche a 3x la mediane
          <br />
          vote 30min, 60% pour passer
          <br />
          succes: -40% au riche, redistribue aux votants
        </p>
      </div>
    </div>
  );
}
