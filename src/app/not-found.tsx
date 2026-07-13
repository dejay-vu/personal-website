import { RouteLink } from '@/components/ui/RouteLink';

export default function NotFound() {
  return (
    <section className="mx-auto grid min-h-[calc(100dvh-13.5rem)] w-full max-w-md place-items-center text-center">
      <div className="flex flex-col items-center gap-4">
        <p className="font-mono text-sm font-semibold uppercase tracking-widest text-foreground/80">
          404
        </p>
        <h1 className="text-2xl font-semibold text-foreground">
          Page not found
        </h1>
        <p className="text-foreground/80">
          The page you are looking for does not exist or has moved.
        </p>
        <RouteLink
          href="/"
          progressLabel="Loading home"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-[var(--accent-hover)]"
        >
          Back to home
        </RouteLink>
      </div>
    </section>
  );
}
