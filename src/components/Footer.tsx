// Deep-page footer: the home page's mono sign-off line. Owner tooling remains
// available only through its known protected route, not public chrome.
export default function Footer() {
  return (
    <div className="relative z-2 w-full">
      <footer className="w-full pb-10 pt-8 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-(--neon-dim)">
        <p>
          © 2026 JUNHAO ZHANG ·{' '}
          <span style={{ fontFamily: 'var(--font-cjk), sans-serif' }}>
            张俊豪
          </span>{' '}
          — ALL RIGHTS RESERVED
        </p>
      </footer>
    </div>
  );
}
