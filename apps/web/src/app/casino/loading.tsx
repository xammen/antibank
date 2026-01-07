export default function CasinoLoading() {
  return (
    <main className="min-h-screen flex flex-col items-center pt-[10vh] px-6">
      <div className="max-w-[500px] w-full flex flex-col gap-8 animate-pulse">
        <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div className="h-4 w-16 bg-[var(--line)] rounded" />
          <div className="h-4 w-16 bg-[var(--line)] rounded" />
        </header>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-[var(--line)] rounded" />
          ))}
        </div>
      </div>
    </main>
  );
}
