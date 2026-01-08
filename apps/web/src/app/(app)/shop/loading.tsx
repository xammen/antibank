export default function ShopLoading() {
  return (
    <main className="min-h-screen flex flex-col items-center pt-[10vh] px-6 pb-20">
      <div className="max-w-[600px] w-full flex flex-col gap-8 animate-pulse">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div className="h-4 w-16 bg-[var(--line)] rounded" />
          <div className="h-4 w-12 bg-[var(--line)] rounded" />
        </header>

        {/* Balance */}
        <div className="flex justify-center">
          <div className="h-10 w-28 bg-[var(--line)] rounded" />
        </div>

        {/* Items skeleton */}
        <div className="flex flex-col gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-[var(--line)] rounded" />
          ))}
        </div>
      </div>
    </main>
  );
}
