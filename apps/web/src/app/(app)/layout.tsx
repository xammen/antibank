import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BalanceProvider } from "@/hooks/use-balance";
import { AppNav } from "@/components/nav/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  return (
    <BalanceProvider initialBalance={session.user.balance || "0"}>
      {/* Navigation persistante - ne re-render jamais */}
      <AppNav initialBalance={session.user.balance || "0"} />
      
      {/* Contenu avec padding pour la nav */}
      <div className="pb-16 lg:pb-0 lg:pt-14">
        {children}
      </div>
    </BalanceProvider>
  );
}
