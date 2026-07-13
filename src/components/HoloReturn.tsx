import Link from 'next/link';

// The deep-page return affordance — a fixed top-right mono link back up the
// tree, mirroring the home HUD's position and material. Replaces the old
// bottom street pill + top-left wordmark strip on non-admin deep pages.
export function HoloReturn({ href, label }: { href: string; label: string }) {
  return (
    <nav className="holo-return" aria-label="Return">
      <Link href={href}>← {label}</Link>
    </nav>
  );
}
