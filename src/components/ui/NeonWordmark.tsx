// The DEJAYVU dead-tube wordmark. Shared by the home hero and the deep-page
// top strip; size comes entirely from the inherited font-size (glow shadows
// are em-based in globals.css).
const LETTERS: { ch: string; c: string; d: string; dead?: boolean }[] = [
  { ch: 'D', c: 'var(--mag)', d: '0s' },
  { ch: 'E', c: 'var(--mag)', d: '.5s' },
  { ch: 'J', c: 'var(--cyan)', d: '.2s', dead: true },
  { ch: 'A', c: 'var(--mag)', d: '.9s' },
  { ch: 'Y', c: 'var(--cyan)', d: '.3s' },
  { ch: 'V', c: 'var(--mag)', d: '.7s' },
  { ch: 'U', c: 'var(--mag)', d: '.1s', dead: true },
];

export function NeonWordmark() {
  return (
    <span className="neon-wordmark">
      {LETTERS.map((letter, index) => (
        <span
          key={index}
          className="neon-wordmark__letter"
          data-dead={letter.dead || undefined}
          style={{
            ['--c' as string]: letter.c,
            ['--d' as string]: letter.d,
          }}
        >
          {letter.ch}
        </span>
      ))}
    </span>
  );
}
