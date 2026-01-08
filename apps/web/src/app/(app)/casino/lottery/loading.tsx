export default function LotteryLoading() {
  return (
    <main className="min-h-screen flex flex-col items-center pt-[4vh] lg:pt-[6vh] px-6 pb-20 lg:pb-6">
      <div className="max-w-[500px] w-full animate-pulse">
        <div className="flex items-center justify-center border-b border-[var(--line)] pb-4 mb-6">
          <div className="h-4 w-16 bg-[var(--line)]" />
        </div>
        <div className="h-32 bg-[var(--line)]/20 border border-[var(--line)] mb-4" />
        <div className="h-12 bg-[var(--line)]/30" />
      </div>
    </main>
  );
}
