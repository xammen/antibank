export default function AppLoading() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-pulse">
        <div className="w-12 h-12 border border-[var(--line)] flex items-center justify-center">
          <span className="text-[var(--text-muted)] text-lg">~</span>
        </div>
        <div className="h-2 w-24 bg-[var(--line)]" />
      </div>
    </main>
  );
}
