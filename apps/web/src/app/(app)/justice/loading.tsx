export default function JusticeLoading() {
  return (
    <main className="min-h-screen flex flex-col items-center pt-[4vh] lg:pt-[6vh] px-6 pb-20 lg:pb-6">
      <div className="max-w-[600px] w-full animate-pulse">
        <div className="flex items-center justify-center border-b border-[var(--line)] pb-4 mb-6">
          <div className="h-4 w-16 bg-[var(--line)]" />
        </div>
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-[var(--line)]/20 border border-[var(--line)]" />
          ))}
        </div>
      </div>
    </main>
  );
}
