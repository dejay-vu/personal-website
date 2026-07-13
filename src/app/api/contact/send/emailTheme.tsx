import type { CSSProperties, ReactNode } from 'react';

import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';

/**
 * Neon email system — the site's cyberpunk identity, translated for the inbox.
 *
 * Grounded in globals.css: the void background, lavender ink, and the four
 * rotating neon hues (mag / cyan / jade / amber) the site cycles per card.
 * Custom display faces (Saiba 45) can't load in mail, so the "techno" voice is
 * carried by a monospace stack; glow (text-shadow) is progressive-enhancement
 * only — legibility holds on saturated color + 1px neon borders alone.
 *
 * Dark mail is fragile on mobile: clients strip or invert backgrounds and leave
 * light text stranded on white. Defenses: color-scheme:dark (asks Gmail not to
 * invert), and the void background repeated on EVERY level (body → wrapper →
 * container → each section) so text always sits on its own dark surface.
 */
export const colors = {
  void: '#0b0714',
  panel: '#160c26',
  line: 'rgba(154, 134, 192, 0.24)',
  ink: '#f3ecff',
  body: '#eae4ff',
  dim: '#a794c9',
  mag: '#ff2e88',
  cyan: '#35e6ff',
  jade: '#5dff9e',
  amber: '#ffce3a',
} as const;

// rgba() from a #rrggbb hex — wider client support than 8-digit hex, which
// Outlook and some mobile clients drop (taking the whole declaration with it).
function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const CJK =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC"';
export const fonts = {
  mono: `"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", ${CJK}, monospace`,
  sans: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, ${CJK}, sans-serif`,
} as const;

// The real socials from NeonLanding.tsx, each given one of the site's card hues.
export const SOCIALS = [
  {
    label: 'GitHub',
    handle: 'dejay-vu',
    href: 'https://github.com/dejay-vu',
    hue: colors.cyan,
  },
  {
    label: 'LinkedIn',
    handle: 'junhao-zh',
    href: 'https://linkedin.com/in/junhao-zh',
    hue: colors.jade,
  },
  {
    label: 'Instagram',
    handle: 'dejayyvu',
    href: 'https://instagram.com/dejayyvu',
    hue: colors.mag,
  },
];

// Four-segment neon rail — the site's --card-hue rotation, laid flat. The one
// element both emails are built around.
function RailBar() {
  const seg = (bg: string): CSSProperties => ({
    width: '25%',
    height: '4px',
    lineHeight: '4px',
    fontSize: '1px',
    backgroundColor: bg,
  });
  return (
    <Section style={{ padding: 0, margin: 0 }}>
      <Row style={{ margin: 0 }}>
        <Column style={seg(colors.mag)}>&nbsp;</Column>
        <Column style={seg(colors.cyan)}>&nbsp;</Column>
        <Column style={seg(colors.jade)}>&nbsp;</Column>
        <Column style={seg(colors.amber)}>&nbsp;</Column>
      </Row>
    </Section>
  );
}

// A neon "sign" — the site frames each section with an illuminated marker.
// Section signs are uppercase techno labels; the wordmark keeps its own casing.
export function Sign({
  color,
  children,
  size = '12px',
  transform = 'uppercase',
  spacing = '0.24em',
}: {
  color: string;
  children: ReactNode;
  size?: string;
  transform?: CSSProperties['textTransform'];
  spacing?: string;
}) {
  return (
    <Text
      style={{
        fontFamily: fonts.mono,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: spacing,
        textTransform: transform,
        color,
        margin: '0 0 10px',
        textShadow: `0 0 10px ${rgba(color, 0.35)}`,
      }}
    >
      {children}
    </Text>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: fonts.mono,
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: colors.dim,
        margin: '22px 0 8px',
      }}
    >
      {children}
    </Text>
  );
}

export function P({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Text
      style={{
        fontFamily: fonts.sans,
        fontSize: '15px',
        lineHeight: '24px',
        color: colors.body,
        margin: '0 0 12px',
        ...style,
      }}
    >
      {children}
    </Text>
  );
}

// A bordered panel with a neon edge — the site's card, with the hue on the spine.
export function Panel({
  hue,
  children,
  style,
}: {
  hue: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Section
      style={{
        backgroundColor: colors.panel,
        border: `1px solid ${rgba(hue, 0.34)}`,
        borderLeft: `3px solid ${hue}`,
        borderRadius: '6px',
        padding: '14px 18px',
        ...style,
      }}
    >
      {children}
    </Section>
  );
}

// Three equal, table-aligned neon buttons — one row on every client (tables
// don't reflow), so the socials never go ragged the way wrapped chips did.
export function SocialRail() {
  return (
    <Section style={{ padding: '2px 0 0' }}>
      <Row>
        {SOCIALS.map((s) => (
          <Column
            key={s.label}
            style={{ width: '33.33%', padding: '0 4px', verticalAlign: 'top' }}
          >
            <Link
              href={s.href}
              style={{
                display: 'block',
                textDecoration: 'none',
                border: `1px solid ${s.hue}`,
                borderRadius: '8px',
                padding: '12px 4px',
                textAlign: 'center',
                backgroundColor: colors.panel,
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontFamily: fonts.mono,
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: s.hue,
                }}
              >
                {s.label}
              </span>
              <span
                style={{
                  display: 'block',
                  marginTop: '4px',
                  fontFamily: fonts.mono,
                  fontSize: '11px',
                  color: colors.dim,
                }}
              >
                /{s.handle}
              </span>
            </Link>
          </Column>
        ))}
      </Row>
    </Section>
  );
}

// Outer chrome: void background repeated at every level, top rail, footer.
export function Shell({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}) {
  const surface: CSSProperties = { backgroundColor: colors.void };
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <style>{`:root{color-scheme:dark;supported-color-schemes:dark;} body{background:${colors.void}!important;margin:0;padding:0;}`}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{ ...surface, margin: 0, padding: 0, fontFamily: fonts.sans }}
      >
        <Section style={{ ...surface, width: '100%' }}>
          <Container
            style={{
              ...surface,
              maxWidth: '600px',
              margin: '0 auto',
              width: '100%',
            }}
          >
            <RailBar />
            <Section style={{ ...surface, padding: '28px 24px 6px' }}>
              {children}
            </Section>
            <Section style={{ ...surface, padding: '6px 24px 28px' }}>
              <Hr
                style={{
                  border: 'none',
                  borderTop: `1px solid ${colors.line}`,
                  margin: '18px 0 14px',
                }}
              />
              <Text
                style={{
                  fontFamily: fonts.mono,
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  color: colors.dim,
                  margin: '0 0 4px',
                }}
              >
                © 2026 JUNHAO ZHANG · 张俊豪
              </Text>
              <Text
                style={{
                  fontFamily: fonts.mono,
                  fontSize: '11px',
                  letterSpacing: '0.04em',
                  color: colors.dim,
                  margin: 0,
                }}
              >
                <Link
                  href="https://dejayvu.com"
                  style={{ color: colors.cyan, textDecoration: 'none' }}
                >
                  dejayvu.com
                </Link>
                {'  ·  sent from the contact rail'}
              </Text>
            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  );
}
