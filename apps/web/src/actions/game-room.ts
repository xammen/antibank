"use server";

import { prisma } from "@antibank/db";
import { auth } from "@/lib/auth";
import { Decimal } from "@prisma/client/runtime/library";

// Types
export type GameType = "dice" | "pfc";
export type RoomStatus = "waiting" | "countdown" | "playing" | "finished";

export interface RoomPlayer {
  id: string;
  odrzerId: string;
  username: string;
  isReady: boolean;
  roll?: number | null;
  dice1?: number | null;
  dice2?: number | null;
  choice?: string | null;
  profit?: number | null;
  rank?: number | null;
}

export interface GameRoomPublic {
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
  players: RoomPlayer[];
  createdAt: Date;
}

// Constantes
const ROOM_EXPIRE_MINUTES = 5;
const COUNTDOWN_SECONDS = 15;
const HOUSE_FEE = 0.05; // 5%

// Génère un code de room privée (6 caractères)
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Sans I, O, 0, 1 pour éviter confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Convertit un room DB en room publique
function toPublicRoom(room: any): GameRoomPublic {
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
    players: room.players.map((p: any) => ({
      id: p.id,
      odrzerId: p.userId,
      username: p.username,
      isReady: p.isReady,
      roll: p.roll,
      dice1: p.dice1,
      dice2: p.dice2,
      choice: p.choice,
      profit: p.profit ? Number(p.profit) : null,
      rank: p.rank,
    })),
    createdAt: room.createdAt,
  };
}

// ============================================
// CREATE ROOM
// ============================================
export async function createRoom(
  gameType: GameType,
  amount: number,
  isPrivate: boolean = false,
  maxPlayers: number = 8
): Promise<{ success: boolean; room?: GameRoomPublic; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const userId = session.user.id;

  // Validation
  if (amount < 1 || amount > 1000) {
    return { success: false, error: "mise entre 1€ et 1000€" };
  }

  if (maxPlayers < 2 || maxPlayers > 8) {
    return { success: false, error: "2 à 8 joueurs max" };
  }

  // Vérifier que le user n'est pas déjà dans une room active
  const existingPlayer = await prisma.gameRoomPlayer.findFirst({
    where: {
      userId,
      room: {
        status: { in: ["waiting", "countdown", "playing"] },
      },
    },
    include: { room: true },
  });

  if (existingPlayer) {
    return { success: false, error: "déjà dans une room" };
  }

  // Vérifier le solde
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true, discordUsername: true },
  });

  if (!user || Number(user.balance) < amount) {
    return { success: false, error: "pas assez de thunes" };
  }

  // Générer code si privée
  let code: string | null = null;
  if (isPrivate) {
    // Trouver un code unique
    for (let i = 0; i < 10; i++) {
      const tryCode = generateRoomCode();
      const existing = await prisma.gameRoom.findUnique({ where: { code: tryCode } });
      if (!existing) {
        code = tryCode;
        break;
      }
    }
    if (!code) {
      return { success: false, error: "erreur génération code" };
    }
  }

  // Créer la room + ajouter le host comme premier joueur + déduire la mise
  const room = await prisma.$transaction(async (tx) => {
    // Déduire la mise
    await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } },
    });

    // Créer la room
    const newRoom = await tx.gameRoom.create({
      data: {
        gameType,
        amount: new Decimal(amount),
        minPlayers: 2,
        maxPlayers,
        code,
        hostId: userId,
        status: "waiting",
        expiresAt: new Date(Date.now() + ROOM_EXPIRE_MINUTES * 60 * 1000),
        players: {
          create: {
            userId,
            username: user.discordUsername,
            isReady: true, // Le host est auto-ready
          },
        },
      },
      include: {
        players: true,
      },
    });

    // Transaction log
    await tx.transaction.create({
      data: {
        userId,
        type: "game_room_join",
        amount: new Decimal(-amount),
        description: `Mise room ${gameType} #${newRoom.id.slice(-6)}`,
      },
    });

    return newRoom;
  });

  return { success: true, room: toPublicRoom(room) };
}

// ============================================
// JOIN ROOM
// ============================================
export async function joinRoom(
  roomIdOrCode: string
): Promise<{ success: boolean; room?: GameRoomPublic; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const userId = session.user.id;

  // Vérifier que le user n'est pas déjà dans une room active
  const existingPlayer = await prisma.gameRoomPlayer.findFirst({
    where: {
      userId,
      room: {
        status: { in: ["waiting", "countdown", "playing"] },
      },
    },
  });

  if (existingPlayer) {
    return { success: false, error: "déjà dans une room" };
  }

  // Trouver la room (par ID ou par code)
  const room = await prisma.gameRoom.findFirst({
    where: {
      OR: [
        { id: roomIdOrCode },
        { code: roomIdOrCode.toUpperCase() },
      ],
      status: { in: ["waiting", "countdown"] },
    },
    include: { players: true },
  });

  if (!room) {
    return { success: false, error: "room introuvable ou fermée" };
  }

  if (room.players.length >= room.maxPlayers) {
    return { success: false, error: "room pleine" };
  }

  // Vérifier le solde
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true, discordUsername: true },
  });

  const amount = Number(room.amount);
  if (!user || Number(user.balance) < amount) {
    return { success: false, error: "pas assez de thunes" };
  }

  // Rejoindre + déduire la mise
  const updatedRoom = await prisma.$transaction(async (tx) => {
    // Déduire la mise
    await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } },
    });

    // Ajouter le joueur
    await tx.gameRoomPlayer.create({
      data: {
        roomId: room.id,
        userId,
        username: user.discordUsername,
        isReady: false,
      },
    });

    // Vérifier si on atteint le minimum pour démarrer le countdown
    const playerCount = room.players.length + 1;
    let updateData: any = {};

    if (room.status === "waiting" && playerCount >= room.minPlayers) {
      updateData = {
        status: "countdown",
        countdownEnd: new Date(Date.now() + COUNTDOWN_SECONDS * 1000),
      };
    }

    // Mettre à jour la room
    const updated = await tx.gameRoom.update({
      where: { id: room.id },
      data: updateData,
      include: { players: true },
    });

    // Transaction log
    await tx.transaction.create({
      data: {
        userId,
        type: "game_room_join",
        amount: new Decimal(-amount),
        description: `Mise room ${room.gameType} #${room.id.slice(-6)}`,
      },
    });

    return updated;
  });

  return { success: true, room: toPublicRoom(updatedRoom) };
}

// ============================================
// LEAVE ROOM
// ============================================
export async function leaveRoom(
  roomId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const userId = session.user.id;

  // Trouver le player dans la room
  const player = await prisma.gameRoomPlayer.findFirst({
    where: {
      roomId,
      userId,
    },
    include: {
      room: {
        include: { players: true },
      },
    },
  });

  if (!player) {
    return { success: false, error: "pas dans cette room" };
  }

  // On ne peut quitter que si waiting ou countdown
  if (!["waiting", "countdown"].includes(player.room.status)) {
    return { success: false, error: "partie en cours" };
  }

  const amount = Number(player.room.amount);
  const isHost = player.room.hostId === userId;
  const remainingPlayers = player.room.players.length - 1;

  await prisma.$transaction(async (tx) => {
    // Rembourser la mise
    await tx.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
    });

    // Supprimer le player
    await tx.gameRoomPlayer.delete({
      where: { id: player.id },
    });

    // Transaction log
    await tx.transaction.create({
      data: {
        userId,
        type: "game_room_leave",
        amount: new Decimal(amount),
        description: `Remboursement room #${roomId.slice(-6)}`,
      },
    });

    // Si c'était le host ou plus personne, supprimer la room
    if (isHost || remainingPlayers === 0) {
      // Rembourser tous les autres joueurs
      for (const p of player.room.players) {
        if (p.userId !== userId) {
          await tx.user.update({
            where: { id: p.userId },
            data: { balance: { increment: amount } },
          });
          await tx.transaction.create({
            data: {
              userId: p.userId,
              type: "game_room_leave",
              amount: new Decimal(amount),
              description: `Room annulée #${roomId.slice(-6)}`,
            },
          });
        }
      }
      await tx.gameRoom.delete({
        where: { id: roomId },
      });
    } else {
      // Vérifier si on repasse sous le minimum
      if (remainingPlayers < player.room.minPlayers && player.room.status === "countdown") {
        await tx.gameRoom.update({
          where: { id: roomId },
          data: {
            status: "waiting",
            countdownEnd: null,
          },
        });
      }
    }
  });

  return { success: true };
}

// ============================================
// SET READY
// ============================================
export async function setReady(
  roomId: string,
  ready: boolean = true
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const userId = session.user.id;

  const player = await prisma.gameRoomPlayer.findFirst({
    where: { roomId, userId },
    include: { room: true },
  });

  if (!player) {
    return { success: false, error: "pas dans cette room" };
  }

  if (!["waiting", "countdown"].includes(player.room.status)) {
    return { success: false, error: "trop tard" };
  }

  await prisma.gameRoomPlayer.update({
    where: { id: player.id },
    data: { isReady: ready },
  });

  return { success: true };
}

// ============================================
// GET OPEN ROOMS
// ============================================
export async function getOpenRooms(
  gameType?: GameType
): Promise<{ success: boolean; rooms: GameRoomPublic[] }> {
  const where: any = {
    status: { in: ["waiting", "countdown"] },
    code: null, // Seulement les rooms publiques
  };

  if (gameType) {
    where.gameType = gameType;
  }

  const rooms = await prisma.gameRoom.findMany({
    where,
    include: { players: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    success: true,
    rooms: rooms.map(toPublicRoom),
  };
}

// ============================================
// GET ROOM STATE (pour polling)
// ============================================
export async function getRoomState(
  roomId: string
): Promise<{ success: boolean; room?: GameRoomPublic; error?: string }> {
  const room = await prisma.gameRoom.findUnique({
    where: { id: roomId },
    include: { players: true },
  });

  if (!room) {
    return { success: false, error: "room introuvable" };
  }

  return { success: true, room: toPublicRoom(room) };
}

// ============================================
// QUICK MATCH - Trouve ou crée une room
// ============================================
export async function quickMatch(
  gameType: GameType,
  amount: number
): Promise<{ success: boolean; room?: GameRoomPublic; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  // Chercher une room publique avec la même mise
  const existingRoom = await prisma.gameRoom.findFirst({
    where: {
      gameType,
      amount: new Decimal(amount),
      status: { in: ["waiting", "countdown"] },
      code: null, // Publique seulement
    },
    include: { players: true },
    orderBy: { createdAt: "asc" }, // Plus ancienne d'abord
  });

  if (existingRoom && existingRoom.players.length < existingRoom.maxPlayers) {
    // Vérifier qu'on n'est pas déjà dedans
    const alreadyIn = existingRoom.players.some((p) => p.userId === session.user!.id);
    if (!alreadyIn) {
      return joinRoom(existingRoom.id);
    }
  }

  // Pas de room dispo, en créer une nouvelle
  return createRoom(gameType, amount, false, 8);
}

// ============================================
// START GAME - Déclenché quand countdown finit
// ============================================
export async function checkAndStartGame(
  roomId: string
): Promise<{ success: boolean; room?: GameRoomPublic; error?: string }> {
  const room = await prisma.gameRoom.findUnique({
    where: { id: roomId },
    include: { players: true },
  });

  if (!room) {
    return { success: false, error: "room introuvable" };
  }

  // Vérifier que c'est le moment de démarrer
  if (room.status !== "countdown") {
    return { success: true, room: toPublicRoom(room) };
  }

  if (!room.countdownEnd || new Date() < room.countdownEnd) {
    return { success: true, room: toPublicRoom(room) };
  }

  // C'est l'heure ! Lancer le jeu
  if (room.gameType === "dice") {
    return playDiceGame(room);
  } else if (room.gameType === "pfc") {
    // PFC nécessite les choix des joueurs, on passe en "playing"
    const updated = await prisma.gameRoom.update({
      where: { id: roomId },
      data: {
        status: "playing",
        startedAt: new Date(),
      },
      include: { players: true },
    });
    return { success: true, room: toPublicRoom(updated) };
  }

  return { success: false, error: "type de jeu inconnu" };
}

// ============================================
// PLAY DICE GAME - Exécute la partie de dés
// ============================================
async function playDiceGame(room: any): Promise<{ success: boolean; room?: GameRoomPublic; error?: string }> {
  const readyPlayers = room.players.filter((p: any) => p.isReady);

  if (readyPlayers.length < 2) {
    // Pas assez de joueurs ready, annuler et rembourser
    await prisma.$transaction(async (tx) => {
      for (const p of room.players) {
        await tx.user.update({
          where: { id: p.userId },
          data: { balance: { increment: Number(room.amount) } },
        });
        await tx.transaction.create({
          data: {
            userId: p.userId,
            type: "game_room_cancelled",
            amount: room.amount,
            description: `Room annulée (pas assez de joueurs)`,
          },
        });
      }
      await tx.gameRoom.delete({ where: { id: room.id } });
    });
    return { success: false, error: "pas assez de joueurs ready" };
  }

  // Lancer les dés pour chaque joueur ready
  const rolls: { playerId: string; odrzerId: string; dice1: number; dice2: number; total: number }[] = [];

  for (const p of readyPlayers) {
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    rolls.push({
      playerId: p.id,
      odrzerId: p.userId, // odrzerId pour userId du player
      dice1,
      dice2,
      total: dice1 + dice2,
    });
  }

  // Trier par score décroissant
  rolls.sort((a, b) => b.total - a.total);

  // Calculer les gains
  const pot = Number(room.amount) * readyPlayers.length;
  const houseFee = pot * HOUSE_FEE;
  const prizePool = pot - houseFee;

  // Trouver les gagnants (peut y avoir égalité)
  const maxRoll = rolls[0].total;
  const winners = rolls.filter((r) => r.total === maxRoll);
  const prizePerWinner = prizePool / winners.length;

  // Mettre à jour la room et les joueurs
  const updatedRoom = await prisma.$transaction(async (tx) => {
    // Mettre à jour chaque joueur avec ses résultats
    for (let i = 0; i < rolls.length; i++) {
      const roll = rolls[i];
      const isWinner = roll.total === maxRoll;
      const profit = isWinner ? prizePerWinner - Number(room.amount) : -Number(room.amount);

      await tx.gameRoomPlayer.update({
        where: { id: roll.playerId },
        data: {
          roll: roll.total,
          dice1: roll.dice1,
          dice2: roll.dice2,
          profit: new Decimal(profit),
          rank: i + 1,
        },
      });

      // Donner les gains aux gagnants
      if (isWinner) {
        await tx.user.update({
          where: { id: roll.odrzerId },
          data: { balance: { increment: prizePerWinner } },
        });
        await tx.transaction.create({
          data: {
            userId: roll.odrzerId,
            type: "game_room_win",
            amount: new Decimal(prizePerWinner),
            description: `Victoire dés (${roll.total}) - Room #${room.id.slice(-6)}`,
          },
        });
      }
    }

    // Mettre à jour les joueurs non-ready (ils perdent leur mise)
    const notReadyPlayers = room.players.filter((p: any) => !p.isReady);
    for (const p of notReadyPlayers) {
      await tx.gameRoomPlayer.update({
        where: { id: p.id },
        data: {
          profit: new Decimal(-Number(room.amount)),
          rank: rolls.length + 1,
        },
      });
      // Leur mise est déjà déduite, pas de transaction supplémentaire
    }

    // Marquer la room comme terminée
    return tx.gameRoom.update({
      where: { id: room.id },
      data: {
        status: "finished",
        startedAt: new Date(),
        finishedAt: new Date(),
      },
      include: { players: true },
    });
  });

  return { success: true, room: toPublicRoom(updatedRoom) };
}

// ============================================
// SUBMIT PFC CHOICE
// ============================================
export async function submitPFCChoice(
  roomId: string,
  choice: "pierre" | "feuille" | "ciseaux"
): Promise<{ success: boolean; room?: GameRoomPublic; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const userId = session.user.id;

  const player = await prisma.gameRoomPlayer.findFirst({
    where: { roomId, userId },
    include: {
      room: {
        include: { players: true },
      },
    },
  });

  if (!player) {
    return { success: false, error: "pas dans cette room" };
  }

  if (player.room.status !== "playing") {
    return { success: false, error: "partie pas en cours" };
  }

  if (player.choice) {
    return { success: false, error: "déjà joué" };
  }

  // Enregistrer le choix
  await prisma.gameRoomPlayer.update({
    where: { id: player.id },
    data: { choice },
  });

  // Vérifier si tous ont joué
  const room = await prisma.gameRoom.findUnique({
    where: { id: roomId },
    include: { players: true },
  });

  if (!room) {
    return { success: false, error: "room introuvable" };
  }

  const readyPlayers = room.players.filter((p) => p.isReady);
  const allPlayed = readyPlayers.every((p) => p.choice || p.userId === userId);

  if (allPlayed) {
    // Résoudre le PFC
    return resolvePFCGame(room);
  }

  return { success: true, room: toPublicRoom(room) };
}

// ============================================
// RESOLVE PFC GAME
// ============================================
async function resolvePFCGame(room: any): Promise<{ success: boolean; room?: GameRoomPublic; error?: string }> {
  const readyPlayers = room.players.filter((p: any) => p.isReady && p.choice);

  if (readyPlayers.length < 2) {
    return { success: false, error: "pas assez de joueurs" };
  }

  // Compter les choix
  const choices = { pierre: 0, feuille: 0, ciseaux: 0 };
  for (const p of readyPlayers) {
    choices[p.choice as keyof typeof choices]++;
  }

  // Déterminer le résultat
  // Pierre > Ciseaux, Ciseaux > Feuille, Feuille > Pierre
  // Si les 3 sont présents ou tous identiques = égalité
  let winningChoice: string | null = null;

  const hasP = choices.pierre > 0;
  const hasF = choices.feuille > 0;
  const hasC = choices.ciseaux > 0;

  if (hasP && hasF && hasC) {
    // Les 3 présents = égalité
    winningChoice = null;
  } else if (hasP && hasC) {
    winningChoice = "pierre";
  } else if (hasC && hasF) {
    winningChoice = "ciseaux";
  } else if (hasF && hasP) {
    winningChoice = "feuille";
  } else {
    // Tous le même choix = égalité
    winningChoice = null;
  }

  const pot = Number(room.amount) * readyPlayers.length;
  const houseFee = pot * HOUSE_FEE;
  const prizePool = pot - houseFee;

  const winners = winningChoice
    ? readyPlayers.filter((p: any) => p.choice === winningChoice)
    : readyPlayers; // Égalité = tous récupèrent leur mise (moins les frais)

  const prizePerWinner = prizePool / winners.length;

  const updatedRoom = await prisma.$transaction(async (tx) => {
    for (const p of readyPlayers) {
      const isWinner = winningChoice ? p.choice === winningChoice : true;
      const profit = isWinner ? prizePerWinner - Number(room.amount) : -Number(room.amount);

      await tx.gameRoomPlayer.update({
        where: { id: p.id },
        data: {
          profit: new Decimal(profit),
          rank: isWinner ? 1 : 2,
        },
      });

      if (isWinner) {
        await tx.user.update({
          where: { id: p.userId },
          data: { balance: { increment: prizePerWinner } },
        });
        await tx.transaction.create({
          data: {
            userId: p.userId,
            type: "game_room_win",
            amount: new Decimal(prizePerWinner),
            description: `${winningChoice ? "Victoire" : "Égalité"} PFC - Room #${room.id.slice(-6)}`,
          },
        });
      }
    }

    // Joueurs non-ready perdent leur mise
    const notReadyPlayers = room.players.filter((p: any) => !p.isReady || !p.choice);
    for (const p of notReadyPlayers) {
      if (!readyPlayers.find((rp: any) => rp.id === p.id)) {
        await tx.gameRoomPlayer.update({
          where: { id: p.id },
          data: {
            profit: new Decimal(-Number(room.amount)),
            rank: 99,
          },
        });
      }
    }

    return tx.gameRoom.update({
      where: { id: room.id },
      data: {
        status: "finished",
        finishedAt: new Date(),
      },
      include: { players: true },
    });
  });

  return { success: true, room: toPublicRoom(updatedRoom) };
}

// ============================================
// GET MY ACTIVE ROOM
// ============================================
export async function getMyActiveRoom(): Promise<{
  success: boolean;
  room?: GameRoomPublic;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false };
  }

  const player = await prisma.gameRoomPlayer.findFirst({
    where: {
      userId: session.user.id,
      room: {
        status: { in: ["waiting", "countdown", "playing"] },
      },
    },
    include: {
      room: {
        include: { players: true },
      },
    },
  });

  if (!player) {
    return { success: true };
  }

  return { success: true, room: toPublicRoom(player.room) };
}

// ============================================
// REMATCH - Créer une nouvelle partie avec les mêmes joueurs
// ============================================
export async function rematchRoom(
  oldRoomId: string
): Promise<{ success: boolean; room?: GameRoomPublic; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "non connecté" };
  }

  const userId = session.user.id;

  // Récupérer l'ancienne room
  const oldRoom = await prisma.gameRoom.findUnique({
    where: { id: oldRoomId },
    include: { players: true },
  });

  if (!oldRoom) {
    return { success: false, error: "room introuvable" };
  }

  if (oldRoom.status !== "finished") {
    return { success: false, error: "la partie n'est pas terminée" };
  }

  // Vérifier que l'utilisateur était dans la room
  const wasInRoom = oldRoom.players.some(p => p.userId === userId);
  if (!wasInRoom) {
    return { success: false, error: "tu n'étais pas dans cette room" };
  }

  // Vérifier le solde
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true, discordUsername: true },
  });

  if (!user) {
    return { success: false, error: "utilisateur introuvable" };
  }

  const amount = Number(oldRoom.amount);
  if (Number(user.balance) < amount) {
    return { success: false, error: "solde insuffisant" };
  }

  // Créer la nouvelle room avec les mêmes paramètres
  const newRoom = await prisma.$transaction(async (tx) => {
    // Déduire la mise du créateur
    await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } },
    });

    // Créer la room
    const room = await tx.gameRoom.create({
      data: {
        gameType: oldRoom.gameType as GameType,
        amount: new Decimal(amount),
        minPlayers: 2,
        maxPlayers: oldRoom.players.length,
        hostId: userId,
        code: generateRoomCode(),
        status: "waiting",
        expiresAt: new Date(Date.now() + ROOM_EXPIRE_MINUTES * 60 * 1000),
        players: {
          create: {
            userId,
            username: user.discordUsername,
            isReady: true,
          },
        },
      },
      include: { players: true },
    });

    // Transaction log
    await tx.transaction.create({
      data: {
        userId,
        type: "game_room_join",
        amount: new Decimal(-amount),
        description: `Rematch ${oldRoom.gameType} #${room.id.slice(-6)}`,
      },
    });

    return room;
  });

  return { success: true, room: toPublicRoom(newRoom) };
}

// ============================================
// GET REMATCH INFO - Récupérer les infos pour proposer un rematch
// ============================================
export async function getRematchInfo(roomId: string): Promise<{
  success: boolean;
  opponents?: { odrzerId: string; username: string }[];
  gameType?: GameType;
  amount?: number;
  code?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false };
  }

  const room = await prisma.gameRoom.findUnique({
    where: { id: roomId },
    include: { players: true },
  });

  if (!room || room.status !== "finished") {
    return { success: false };
  }

  // Récupérer les adversaires (tous sauf moi)
  const opponents = room.players
    .filter(p => p.userId !== session.user!.id)
    .map(p => ({
      odrzerId: p.userId,
      username: p.username,
    }));

  return {
    success: true,
    opponents,
    gameType: room.gameType as GameType,
    amount: Number(room.amount),
  };
}
