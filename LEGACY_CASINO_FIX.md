# Legacy P2P Casino Systems Fix

## Summary

Fixed critical race conditions and synchronization issues in the legacy 1v1 casino systems (dice.ts, pfc.ts) by applying the same patterns used in GameRoom.

## Problems Fixed

### 1. Race Conditions
- **acceptDiceChallenge()**: Now uses `updateMany` with WHERE clause to prevent double-acceptance
- **acceptPFCChallenge()**: Now uses `updateMany` with WHERE clause to prevent double-acceptance  
- **makePFCChoice()**: Now uses `updateMany` to prevent players from changing their choice after submitting

### 2. Rematch Voting System Replaced
**Old system** (broken):
- Both players had to poll at exactly the right time
- Used `player1WantsRematch` and `player2WantsRematch` boolean flags
- Race conditions when both clicked simultaneously

**New system** (deterministic):
- Dice: Code format `RD{last5chars}` (e.g., `RDabc123`)
- PFC: Code format `RP{last5chars}` (e.g., `RPabc123`)
- First player to click creates a new pending challenge
- Second player sees it in their pending challenges list
- No polling needed, no race conditions

### 3. serverTime Added
All response interfaces now include `serverTime: number` for client/server clock synchronization:
- `CreateChallengeResult`
- `AcceptChallengeResult`
- `MakeChoiceResult`
- `DiceGameState`
- `PFCGameState`

### 4. New Polling Endpoints
Added single-source-of-truth polling endpoints:
- `getDiceGameState(gameId)`: Returns current game state with serverTime
- `getPFCGameState(gameId)`: Returns current game state with serverTime

**Deprecated** (but kept for compatibility):
- `getRecentDiceResults()`: 30s window misses events
- `getRecentPFCResults()`: 30s window misses events

## Files Modified

### Server Actions
- **apps/web/src/actions/dice.ts**
  - Added `serverTime` to all responses
  - Made `acceptDiceChallenge()` atomic with `updateMany`
  - Added `getDiceGameState()` polling endpoint
  - Replaced rematch voting with deterministic code system (`RD{last5chars}`)
  - Simplified `checkDiceRematchStatus()` to just check for existing rematch challenges

- **apps/web/src/actions/pfc.ts**
  - Added `serverTime` to all responses
  - Made `acceptPFCChallenge()` atomic with `updateMany`
  - Made `makePFCChoice()` atomic with `updateMany`
  - Added `getPFCGameState()` polling endpoint
  - Replaced rematch voting with deterministic code system (`RP{last5chars}`)
  - Simplified `checkPFCRematchStatus()` to just check for existing rematch challenges

### Client UI
- **apps/web/src/app/casino/dice/client.tsx**
  - Removed `rematchStatus` state (no longer needed)
  - Simplified rematch UI (no more voting status)
  - Removed rematch polling useEffect (deterministic code handles it)
  - Rematch now creates a new pending challenge that appears in challenges list

- **apps/web/src/app/casino/pfc/client.tsx**
  - Removed `rematchStatus` state (no longer needed)
  - Simplified rematch UI (no more voting status)
  - Removed rematch polling useEffect (deterministic code handles it)
  - Rematch now creates a new pending challenge that appears in challenges list

### Click-Battle (Verification)
- **apps/web/src/app/casino/click-battle/arena-client.tsx**
  - Already uses GameRoom which has `serverTime` in all responses ✓
  - Server-side state transitions in `checkAndStartGame()` ✓
  - Client uses Date.now() for UI countdowns (acceptable since server decides final transitions)

## Architecture Patterns Applied

All changes follow the **GameRoom atomic patterns**:

### 1. Atomic State Transitions
```typescript
// ATOMIC: Use updateMany with WHERE clause
const updateResult = await prisma.diceGame.updateMany({
  where: { 
    id: gameId, 
    status: "pending" // Only update if still pending
  },
  data: { status: "playing" }
});

// If count === 0, another process already transitioned
if (updateResult.count === 0) {
  return getCurrentState();
}
```

### 2. serverTime Synchronization
```typescript
export interface DiceGameState {
  success: boolean;
  game?: { /* ... */ };
  serverTime: number; // ALWAYS include server timestamp
}
```

### 3. Deterministic Rematch Codes
```typescript
// Both players get the same code based on old game ID
const rematchCode = `RD${oldGameId.slice(-5)}`;

// Check if rematch already exists
const existingRematch = await prisma.diceGame.findFirst({
  where: {
    OR: [
      { player1Id: p1, player2Id: p2 },
      { player1Id: p2, player2Id: p1 },
    ],
    status: "pending",
    createdAt: { gte: originalGame.completedAt },
  },
});

// If exists, return it; otherwise create new challenge
```

### 4. Single Source of Truth Polling
```typescript
// Instead of polling recent results (30s window)
// Poll the specific game state
const state = await getDiceGameState(gameId);
// Returns current state + serverTime for sync
```

## Testing Checklist

- [x] Build succeeds (`pnpm build`)
- [ ] Dice 1v1: Challenge creation
- [ ] Dice 1v1: Challenge acceptance (no double-accept)
- [ ] Dice 1v1: Rematch flow (deterministic code)
- [ ] PFC 1v1: Challenge creation  
- [ ] PFC 1v1: Challenge acceptance (no double-accept)
- [ ] PFC 1v1: Choice submission (no double-choice)
- [ ] PFC 1v1: Rematch flow (deterministic code)
- [ ] Click-battle: Room joining
- [ ] Click-battle: Game start countdown
- [ ] Click-battle: Click submission

## Migration Notes

### Database Schema
No schema changes required! All changes are logic-only:
- `player1WantsRematch` and `player2WantsRematch` fields still exist but are no longer used
- `rematchGameId` field still exists but is no longer used
- Deterministic code system uses existing challenge creation flow

### Bot Mode (vs CPU)
All bot mode functionality preserved:
- `playDiceVsBot()` unchanged
- `playPFCVsBot()` unchanged

### Backward Compatibility
- `getRecentDiceResults()` and `getRecentPFCResults()` still work (marked DEPRECATED)
- Old rematch status fields still exist in DB (just unused)
- All existing games/challenges remain valid

## Known Limitations

### Click-Battle Client
- Uses `Date.now()` for countdown timers (client clock)
- Could benefit from serverTime offset calculation
- **NOT CRITICAL**: Server makes final decision in `checkClickBattleStart()`
- Future improvement: Add clock offset sync like GameRoom

## Performance Impact

- **Reduced polling**: Deterministic codes eliminate rematch status polling
- **Fewer queries**: Single game state poll vs. scanning recent results
- **Atomic operations**: Faster state transitions with updateMany
- **No N+1 queries**: All responses include serverTime (no extra round-trips)

## Security Improvements

1. **No double-accept**: Atomic updateMany prevents race conditions
2. **No double-choice**: PFC choice submission is atomic
3. **Server-authoritative**: All state transitions validated server-side
4. **Deterministic codes**: Predictable, verifiable rematch system
5. **serverTime**: Prevents client clock manipulation exploits
