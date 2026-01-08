/**
 * Unified PvP System
 * 
 * Centralise la logique partagée entre tous les jeux PvP:
 * - Validation des joueurs et soldes
 * - Gestion des mises et transactions
 * - Calcul des gains avec taxe maison
 * - Système de rematch unifié
 */

import { prisma, Prisma } from "@antibank/db";
import { addToAntibank } from "./antibank-corp";

// ============================================
// CONFIGURATION
// ============================================

export const PVP_CONFIG = {
  MIN_BET: 0.5,
  MAX_BET: 1000,
  HOUSE_FEE: 0.05, // 5%
  ROOM_EXPIRE_MINUTES: 5,
  COUNTDOWN_SECONDS: 15, // Réduit de 30s
  POLLING_INTERVAL_MS: 1000, // Unifié à 1s (au lieu de 500ms, 1.5s, 2s, 3s selon les jeux)
  REMATCH_EXPIRE_MS: 5 * 60 * 1000, // 5 minutes
};

export type GameType = "dice" | "pfc" | "click_battle";
export type RoomStatus = "waiting" | "countdown" | "playing" | "revealing" | "finished" | "cancelled";

// ============================================
// TYPES PARTAGÉS
// ============================================

export interface PvPPlayer {
  id: string;
  odrzerId: string;
  username: string;
  isReady: boolean;
  // Résultats selon le type de jeu
  roll?: number | null;
  dice1?: number | null;
  dice2?: number | null;
  choice?: string | null;
  clicks?: number | null;
  profit?: number | null;
  rank?: number | null;
}

export interface PvPRoom {
  id: string;
  gameType: GameType;
  amount: number;
  minPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  code?: string | null;
  hostId: string;
  status: RoomStatus;
  countdownEnd?: Date | null;
  startedAt?: Date | null;
  players: PvPPlayer[];
  createdAt: Date;
  // Pour click_battle
  duration?: number;
}

export interface PvPResult {
  success: boolean;
  error?: string;
  room?: PvPRoom;
}

// ============================================
// UTILITAIRES PARTAGÉS
// ============================================

/**
 * Génère un code de room privée (6 caractères)
 */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Sans I, O, 0, 1 pour éviter confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Valide une mise
 */
export function validateBet(amount: number, balance: number): { valid: boolean; error?: string } {
  if (amount < PVP_CONFIG.MIN_BET) {
    return { valid: false, error: `mise minimum: ${PVP_CONFIG.MIN_BET}€` };
  }
  if (amount > PVP_CONFIG.MAX_BET) {
    return { valid: false, error: `mise maximum: ${PVP_CONFIG.MAX_BET}€` };
  }
  if (amount > balance) {
    return { valid: false, error: "solde insuffisant" };
  }
  return { valid: true };
}

/**
 * Calcule les gains après taxe maison
 */
export function calculateWinnings(
  pot: number, 
  winnersCount: number, 
  isWinner: boolean,
  isTie: boolean = false
): { prize: number; houseFee: number; profit: number; betAmount: number } {
  const playersCount = Math.ceil(pot / (pot / winnersCount)); // Approximation
  const betAmount = pot / playersCount;
  const houseFee = Math.floor(pot * PVP_CONFIG.HOUSE_FEE * 100) / 100;
  const prizePool = pot - houseFee;
  
  if (isTie) {
    // Égalité: remboursement moins les frais répartis
    const refund = (prizePool / winnersCount);
    return { prize: refund, houseFee, profit: refund - betAmount, betAmount };
  }
  
  if (isWinner) {
    const prize = prizePool / winnersCount;
    return { prize, houseFee, profit: prize - betAmount, betAmount };
  }
  
  return { prize: 0, houseFee, profit: -betAmount, betAmount };
}

/**
 * Distribue les gains et enregistre les transactions
 */
export async function distributeWinnings(
  tx: Prisma.TransactionClient,
  winners: { odrzerId: string; prize: number; description: string }[],
  houseFee: number,
  gameType: GameType,
  roomId: string
): Promise<void> {
  // Distribuer aux gagnants
  for (const winner of winners) {
    await tx.user.update({
      where: { id: winner.odrzerId },
      data: { balance: { increment: winner.prize } },
    });
    
    await tx.transaction.create({
      data: {
        userId: winner.odrzerId,
        type: `game_room_${gameType}`,
        amount: new Prisma.Decimal(winner.prize),
        description: winner.description,
      },
    });
  }
  
  // Envoyer la taxe à ANTIBANK CORP
  if (houseFee > 0) {
    addToAntibank(houseFee, `taxe ${gameType} room #${roomId.slice(-6)}`).catch(() => {});
  }
}

/**
 * Vérifie qu'un utilisateur peut rejoindre une partie PvP
 */
export async function canJoinPvP(userId: string): Promise<{ canJoin: boolean; error?: string; existingRoomId?: string }> {
  // Vérifier si déjà dans une room active
  const existingPlayer = await prisma.gameRoomPlayer.findFirst({
    where: {
      userId,
      room: {
        status: { in: ["waiting", "countdown", "playing", "revealing"] },
      },
    },
    include: { room: { select: { id: true } } },
  });

  if (existingPlayer) {
    return { 
      canJoin: false, 
      error: "déjà dans une room",
      existingRoomId: existingPlayer.room.id,
    };
  }

  return { canJoin: true };
}

/**
 * Vérifie le solde d'un utilisateur
 */
export async function checkBalance(
  userId: string, 
  amount: number
): Promise<{ hasBalance: boolean; balance: number; username: string; error?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true, discordUsername: true },
  });

  if (!user) {
    return { hasBalance: false, balance: 0, username: "", error: "utilisateur introuvable" };
  }

  const balance = Number(user.balance);
  if (balance < amount) {
    return { hasBalance: false, balance, username: user.discordUsername, error: "solde insuffisant" };
  }

  return { hasBalance: true, balance, username: user.discordUsername };
}

// ============================================
// LOGIQUE DE JEU
// ============================================

/**
 * Lance les dés pour un joueur
 */
export function rollDice(): { dice1: number; dice2: number; total: number } {
  const dice1 = Math.floor(Math.random() * 6) + 1;
  const dice2 = Math.floor(Math.random() * 6) + 1;
  return { dice1, dice2, total: dice1 + dice2 };
}

/**
 * Détermine le gagnant d'un duel de dés
 */
export function determineDiceWinner(roll1: number, roll2: number): "player1" | "player2" | "tie" {
  if (roll1 > roll2) return "player1";
  if (roll2 > roll1) return "player2";
  return "tie";
}

/**
 * Détermine le gagnant de Pierre-Feuille-Ciseaux
 */
export type PFCChoice = "pierre" | "feuille" | "ciseaux";

export function determinePFCWinner(choice1: PFCChoice, choice2: PFCChoice): "player1" | "player2" | "tie" {
  if (choice1 === choice2) return "tie";
  
  const wins: Record<PFCChoice, PFCChoice> = {
    pierre: "ciseaux",
    feuille: "pierre",
    ciseaux: "feuille",
  };
  
  return wins[choice1] === choice2 ? "player1" : "player2";
}

/**
 * Résout un PFC multi-joueurs
 * Retourne le choix gagnant ou null si égalité
 */
export function resolvePFCMultiplayer(
  choices: { odrzerId: string; choice: PFCChoice }[]
): { winningChoice: PFCChoice | null; winners: string[]; isTie: boolean } {
  const counts = { pierre: 0, feuille: 0, ciseaux: 0 };
  
  for (const { choice } of choices) {
    counts[choice]++;
  }
  
  const hasP = counts.pierre > 0;
  const hasF = counts.feuille > 0;
  const hasC = counts.ciseaux > 0;
  
  // Les 3 présents ou tous identiques = égalité
  if ((hasP && hasF && hasC) || (!hasP && !hasF) || (!hasF && !hasC) || (!hasP && !hasC)) {
    return { winningChoice: null, winners: choices.map(c => c.odrzerId), isTie: true };
  }
  
  let winningChoice: PFCChoice;
  if (hasP && hasC) winningChoice = "pierre";
  else if (hasC && hasF) winningChoice = "ciseaux";
  else winningChoice = "feuille";
  
  const winners = choices.filter(c => c.choice === winningChoice).map(c => c.odrzerId);
  
  return { winningChoice, winners, isTie: false };
}

// ============================================
// CONVERSION VERS FORMAT PUBLIC
// ============================================

export function toPublicRoom(room: any): PvPRoom {
  return {
    id: room.id,
    gameType: room.gameType as GameType,
    amount: Number(room.amount),
    minPlayers: room.minPlayers,
    maxPlayers: room.maxPlayers,
    isPrivate: !!room.code,
    code: room.code,
    hostId: room.hostId,
    status: room.status as RoomStatus,
    countdownEnd: room.countdownEnd,
    startedAt: room.startedAt,
    players: (room.players || []).map((p: any) => ({
      id: p.id,
      odrzerId: p.userId,
      username: p.username,
      isReady: p.isReady,
      roll: p.roll,
      dice1: p.dice1,
      dice2: p.dice2,
      choice: p.choice,
      clicks: p.clicks,
      profit: p.profit ? Number(p.profit) : null,
      rank: p.rank,
    })),
    createdAt: room.createdAt,
    duration: room.duration,
  };
}

// ============================================
// NETTOYAGE
// ============================================

/**
 * Nettoie les rooms expirées et rembourse les joueurs
 */
export async function cleanupExpiredRooms(): Promise<number> {
  const expiredRooms = await prisma.gameRoom.findMany({
    where: {
      status: { in: ["waiting", "countdown"] },
      expiresAt: { lt: new Date() },
    },
    include: { players: true },
  });

  let cleaned = 0;

  for (const room of expiredRooms) {
    const amount = Number(room.amount);
    
    await prisma.$transaction(async (tx) => {
      // Rembourser tous les joueurs
      for (const player of room.players) {
        await tx.user.update({
          where: { id: player.userId },
          data: { balance: { increment: amount } },
        });
        
        await tx.transaction.create({
          data: {
            userId: player.userId,
            type: "game_room_expired",
            amount: new Prisma.Decimal(amount),
            description: `Room expirée #${room.id.slice(-6)}`,
          },
        });
      }
      
      // Marquer comme cancelled
      await tx.gameRoom.update({
        where: { id: room.id },
        data: { status: "cancelled" },
      });
    });
    
    cleaned++;
  }

  return cleaned;
}
