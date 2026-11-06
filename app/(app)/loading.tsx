// Shown at once while a page loads its data, so a tap never feels ignored.
export default function Loading() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Carregando">
      <div className="h-10 w-40 animate-pulse rounded-full bg-muted" />
      <div className="grid gap-2">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="h-32 animate-pulse rounded-2xl bg-muted" />
      <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
