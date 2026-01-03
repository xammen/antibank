import { auth } from "@/lib/auth";
import { BalanceProvider } from "@/hooks/use-balance";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <BalanceProvider initialBalance={session?.user.balance || "0"}>
      {children}
    </BalanceProvider>
  );
}
