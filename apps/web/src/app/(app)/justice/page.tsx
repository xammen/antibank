import { auth } from "@/lib/auth";
import { JusticeClient } from "./client";

export default async function JusticePage() {
  const session = await auth();

  return (
    <main className="min-h-screen flex flex-col items-center pt-[4vh] lg:pt-[6vh] px-6 pb-20 lg:pb-6">
      <JusticeClient userId={session!.user.id} />
    </main>
  );
}
