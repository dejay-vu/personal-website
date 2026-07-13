import styles from './NeonHud.module.css';

// The projection HUD (home only): a fixed top-right readout — overall
// projection % + the current sector's status — above the sector list, which
// is the page's navigation (it replaced the old bottom street pill; deep
// pages use a minimal "← GATE" return). Links carry data-navlink so the
// landing's existing IntersectionObserver drives the active state.
//
// The readout text is NOT rendered here or written as textContent — the
// scroll engine writes it as the `--neon-hud-pct` / `--neon-hud-status` CSS
// custom properties (see neonScroll.ts) and the .pct/.status ::after render
// them. That lets the layout.tsx boot script restore the last value BEFORE
// first paint on a refresh, so the readout never flashes a wrong/blank value
// (the engine also fills it on its synchronous init tick). Decorative, so
// pseudo-element content is fine.
const SECTORS = [
  { id: 'home', code: 'GATE', name: 'DEJAYVU' },
  { id: 'about', code: 'B01', name: 'ABOUT' },
  { id: 'timeline', code: 'B02', name: 'TIMELINE' },
  { id: 'street', code: 'B03', name: 'STREET' },
  { id: 'contact', code: 'B04', name: 'CONTACT' },
] as const;

export function NeonHud() {
  return (
    <nav className={styles.hud} aria-label="Sections">
      <div className={styles.readout} aria-hidden="true">
        <span className={styles.pct} />
        <small className={styles.status} />
      </div>
      {/* No SSR default highlight: the active sector is restored pre-paint
          via <html data-neon-sector> (boot script + CSS below) and managed
          by the IntersectionObserver after hydration — a hardcoded "home"
          default would flash wrong on a scrolled refresh. */}
      <ul className={styles.links}>
        {SECTORS.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} data-navlink={s.id}>
              <b>{s.code}</b>
              <span>{s.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
