import { Link, Text } from '@react-email/components';

import { formatFileSize } from '@/lib/contact';

import type { StoredContactAttachment } from '@/services/contactAttachments';

import { Label, P, Panel, Shell, Sign, colors, fonts } from './emailTheme';

export default function EmailToMe({
  attachments = [],
  userEmail,
  userMessage,
}: {
  attachments?: StoredContactAttachment[];
  userEmail: string;
  userMessage: string;
}) {
  const paragraphs = userMessage.split(/\r?\n/);

  return (
    <Shell preview={`Inbound · ${userEmail}`}>
      <Sign color={colors.mag}>◇ Inbound — Contact</Sign>

      <Label>From</Label>
      <Text style={{ margin: '0 0 4px' }}>
        <Link
          href={`mailto:${userEmail}`}
          style={{
            fontFamily: fonts.mono,
            fontSize: '17px',
            fontWeight: 700,
            color: colors.mag,
            textDecoration: 'none',
          }}
        >
          {userEmail}
        </Link>
      </Text>

      <Label>Message</Label>
      <Panel hue={colors.mag}>
        {paragraphs.map((line, i) => (
          <P
            key={i}
            style={{ margin: i === paragraphs.length - 1 ? 0 : '0 0 10px' }}
          >
            {line || ' '}
          </P>
        ))}
      </Panel>

      {attachments.length > 0 && (
        <>
          <Label>
            {`Payload — ${attachments.length} file${attachments.length > 1 ? 's' : ''}`}
          </Label>
          {attachments.map((attachment) => (
            <Panel
              key={attachment.key}
              hue={colors.amber}
              style={{ margin: '0 0 8px' }}
            >
              <Text style={{ margin: '0 0 4px' }}>
                <Link
                  href={attachment.signedUrl}
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: '14px',
                    fontWeight: 700,
                    color: colors.amber,
                    textDecoration: 'none',
                  }}
                >
                  {attachment.filename}
                </Link>
              </Text>
              <Text
                style={{
                  fontFamily: fonts.mono,
                  fontSize: '11px',
                  lineHeight: '18px',
                  color: colors.dim,
                  margin: 0,
                }}
              >
                {formatFileSize(attachment.size)} · {attachment.contentType} ·
                link expires {attachment.expiresAt.toUTCString()} · sha256{' '}
                {attachment.sha256.slice(0, 12)}
              </Text>
            </Panel>
          ))}
        </>
      )}
    </Shell>
  );
}
