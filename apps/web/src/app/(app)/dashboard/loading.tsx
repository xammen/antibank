export default function DashboardLoading() {
  return (
    <main className="min-h-screen flex flex-col items-center pt-[8vh] px-6">
      <div className="max-w-[500px] w-full flex flex-col gap-12 animate-pulse">
        {/* Header skeleton */}
        <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[var(--line)]" />
            <div className="h-4 w-20 bg-[var(--line)] rounded" />
          </div>
          <div className="h-6 w-16 bg-[var(--line)] rounded" />
        </header>

        {/* Balance skeleton */}
        <div className="flex justify-center">
          <div className="h-12 w-32 bg-[var(--line)] rounded" />
        </div>

        {/* Clicker skeleton */}
        <div className="flex justify-center">
          <div className="w-32 h-32 rounded-full bg-[var(--line)]" />
        </div>

        {/* Stats skeleton */}
        <div className="grid grid-cols-3 gap-3 pt-8 border-t border-[var(--line)]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-[var(--line)] rounded" />
          ))}
        </div>

        {/* Nav skeleton */}
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-[var(--line)] rounded" />
          ))}
        </div>
      </div>
    </main>
  );
}
