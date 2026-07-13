import { Heading } from '@react-email/components';

import {
  Label,
  P,
  Panel,
  Shell,
  Sign,
  SocialRail,
  colors,
  fonts,
} from './emailTheme';

export default function EmailToUser({
  userName,
  userMessage,
}: {
  userName?: string;
  userMessage?: string;
}) {
  const message = (userMessage ?? '').trim();
  const paragraphs = message.split(/\r?\n/);
  const opener = userName ? `Thanks, ${userName} —` : 'Thanks —';

  return (
    <Shell preview="Signal received — I'll reply to this address soon.">
      <Sign color={colors.cyan} size="15px" transform="none" spacing="0.14em">
        DeJay Vu
      </Sign>

      <Heading
        as="h1"
        style={{
          fontFamily: fonts.mono,
          fontSize: '27px',
          fontWeight: 700,
          letterSpacing: '0.01em',
          color: colors.ink,
          margin: '4px 0 16px',
          textShadow: '0 0 14px rgba(53, 230, 255, 0.3)',
        }}
      >
        Signal received.
      </Heading>

      <P>
        {opener} your message reached the end of the rail. I read everything
        that lands here myself, and I’ll reply to this address soon.
      </P>

      {message.length > 0 && (
        <>
          <Label>Your message</Label>
          <Panel hue={colors.cyan}>
            {paragraphs.map((line, i) => (
              <P
                key={i}
                style={{ margin: i === paragraphs.length - 1 ? 0 : '0 0 10px' }}
              >
                {line || ' '}
              </P>
            ))}
          </Panel>
        </>
      )}

      <Label>Find me on the street</Label>
      <SocialRail />

      <P
        style={{
          margin: '22px 0 0',
          color: colors.dim,
          fontFamily: fonts.mono,
          fontSize: '13px',
        }}
      >
        — Junhao · 张俊豪
      </P>
    </Shell>
  );
}
