import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/login-button";

export default async function Home() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col items-center pt-[30vh] px-6 text-center">
      <div className="max-w-[400px] w-full flex flex-col items-center animate-fade-in">
        
        <div className="mb-8 text-[var(--text-muted)] text-lg hover:text-[var(--text)] transition-colors cursor-default select-none">
          ༼ つ €_€ ༽つ
        </div>

        <h1 className="text-[2rem] font-light mb-2 tracking-tight">antibank</h1>
        
        <div className="w-px h-8 bg-[var(--line)] my-6"></div>

        <p className="text-[0.85rem] text-[var(--text-muted)] leading-relaxed mb-8 max-w-[300px]">
          antilibe avec le capitalisme
        </p>

        <LoginButton />


      </div>
    </main>
  );
}
