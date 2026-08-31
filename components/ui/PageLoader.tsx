interface PageLoaderProps {
  /** Message shown under the spinner. */
  label?: string;
}

/** Full-screen branded loading state, reused by route-level loading.tsx files. */
export default function PageLoader({ label = "Loading…" }: PageLoaderProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <span
        aria-hidden="true"
        className="h-10 w-10 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
      />
      <p className="cormorant text-xl text-primary-dark">{label}</p>
    </main>
  );
}
