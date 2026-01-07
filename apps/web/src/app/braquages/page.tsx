import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RobberyClient } from "./client";
import {
  getRobberyTargets,
  getRobberyCooldown,
  getRobberyHistory,
  getAntibankRobberyInfo,
} from "@/actions/robbery";
import { getActiveBounties } from "@/actions/bounty";
import { getHeistProgress } from "@/actions/heist";

export default async function BraquagesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  // Charger toutes les données en parallèle côté serveur
  const [targetsRes, cooldownRes, historyRes, bountiesRes, antibankRes, heistRes] = await Promise.all([
    getRobberyTargets(),
    getRobberyCooldown(),
    getRobberyHistory(10),
    getActiveBounties(),
    getAntibankRobberyInfo(),
    getHeistProgress(),
  ]);

  const initialData = {
    targets: targetsRes.success && targetsRes.targets ? targetsRes.targets : [],
    canRob: cooldownRes.canRob,
    cooldownEnds: cooldownRes.cooldownEnds,
    history: historyRes.success && historyRes.history ? historyRes.history : [],
    bounties: bountiesRes.success && bountiesRes.bounties ? bountiesRes.bounties : [],
    antibankInfo: antibankRes,
    heistProgress: heistRes,
  };

  return (
    <main className="min-h-screen flex flex-col items-center pt-[10vh] px-6 pb-20">
      <RobberyClient userId={session.user.id} initialData={initialData} />
    </main>
  );
}
