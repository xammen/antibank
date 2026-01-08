import { auth } from "@/lib/auth";
import { RobberyClient } from "./client";
import {
  getRobberyTargets,
  getRobberyCooldown,
  getRobberyHistory,
  getGlobalRobberyHistory,
  getAntibankRobberyInfo,
} from "@/actions/robbery";
import { getActiveBounties } from "@/actions/bounty";
import { getHeistProgress } from "@/actions/heist";

export default async function BraquagesPage() {
  const session = await auth();
  const userId = session!.user.id;

  // Charger toutes les données en parallèle côté serveur
  const [targetsRes, cooldownRes, historyRes, globalHistoryRes, bountiesRes, antibankRes, heistRes] = await Promise.all([
    getRobberyTargets(),
    getRobberyCooldown(),
    getRobberyHistory(10),
    getGlobalRobberyHistory(20),
    getActiveBounties(),
    getAntibankRobberyInfo(),
    getHeistProgress(),
  ]);

  const initialData = {
    targets: targetsRes.success && targetsRes.targets ? targetsRes.targets : [],
    canRob: cooldownRes.canRob,
    cooldownEnds: cooldownRes.cooldownEnds,
    history: historyRes.success && historyRes.history ? historyRes.history : [],
    globalHistory: globalHistoryRes.success && globalHistoryRes.history ? globalHistoryRes.history : [],
    bounties: bountiesRes.success && bountiesRes.bounties ? bountiesRes.bounties : [],
    antibankInfo: antibankRes,
    heistProgress: heistRes,
  };

  return (
    <main className="min-h-screen flex flex-col items-center pt-[4vh] lg:pt-[6vh] px-6 pb-20 lg:pb-6">
      <RobberyClient userId={userId} initialData={initialData} />
    </main>
  );
}
