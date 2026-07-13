import { createHash, randomUUID } from 'crypto';

import {
  CONTACT_ALLOWED_ATTACHMENT_TYPES,
  CONTACT_ATTACHMENT_LIMITS,
} from '@/lib/contact';

import {
  awsS3CreateSignedGetUrl,
  awsS3DefaultBucketName,
  awsS3Delete,
  awsS3Put,
} from './awsS3';

const CONTACT_ATTACHMENT_PREFIX = 'private/contact';
const DEFAULT_SIGNED_URL_EXPIRES_SECONDS = 3 * 24 * 60 * 60;
const MAX_SIGNED_URL_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

type ContactAttachmentInput = {
  clientIp: string;
  email: string;
  formData: FormData;
};

export type StoredContactAttachment = {
  contentType: (typeof CONTACT_ALLOWED_ATTACHMENT_TYPES)[number];
  expiresAt: Date;
  filename: string;
  key: string;
  sha256: string;
  signedUrl: string;
  size: number;
};

type AttachmentCandidate = {
  buffer: Buffer;
  contentType: StoredContactAttachment['contentType'];
  filename: string;
  sha256: string;
  size: number;
};

function getContactAttachmentBucketName() {
  const contactBucketName = process.env.CONTACT_S3_BUCKET_NAME?.trim();

  if (contactBucketName) return contactBucketName;
  if (process.env.NODE_ENV === 'production') return null;

  return process.env.S3_BUCKET_NAME?.trim() || awsS3DefaultBucketName;
}

function getSignedUrlExpiresSeconds() {
  const configured = Number(process.env.CONTACT_ATTACHMENT_URL_EXPIRES_SECONDS);

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_SIGNED_URL_EXPIRES_SECONDS;
  }

  return Math.min(Math.floor(configured), MAX_SIGNED_URL_EXPIRES_SECONDS);
}

function sanitizeFilename(filename: string) {
  const sanitized = filename
    .replace(/[^\w.() -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return sanitized || 'attachment';
}

function encodeContentDispositionFilename(filename: string) {
  const fallback = sanitizeFilename(filename).replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function getDatePrefix(now = new Date()) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');

  return `${year}/${month}/${day}`;
}

function hasPrefix(buffer: Buffer, bytes: number[]) {
  if (buffer.length < bytes.length) return false;

  return bytes.every((byte, index) => buffer[index] === byte);
}

function isProbablyPlainText(buffer: Buffer) {
  if (buffer.includes(0)) return false;

  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));

  return sample.every((byte) => {
    if (byte === 9 || byte === 10 || byte === 13) return true;
    return byte >= 32;
  });
}

function detectContentType(buffer: Buffer) {
  if (hasPrefix(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'application/pdf';
  }

  if (hasPrefix(buffer, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (isProbablyPlainText(buffer)) {
    return 'text/plain';
  }

  return null;
}

function isSafeDeclaredContentType(
  declaredContentType: string,
  detectedContentType: string,
) {
  if (
    !declaredContentType ||
    declaredContentType === 'application/octet-stream'
  ) {
    return true;
  }

  return declaredContentType === detectedContentType;
}

async function readAttachmentCandidates(formData: FormData) {
  const files = formData
    .getAll('attachments')
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (files.length > CONTACT_ATTACHMENT_LIMITS.maxFiles) {
    return {
      error: `Attach up to ${CONTACT_ATTACHMENT_LIMITS.maxFiles} files.`,
      attachments: [],
    };
  }

  let totalBytes = 0;
  const attachments: AttachmentCandidate[] = [];

  for (const file of files) {
    totalBytes += file.size;

    if (file.size > CONTACT_ATTACHMENT_LIMITS.maxFileBytes) {
      return {
        error: `${file.name} is larger than ${CONTACT_ATTACHMENT_LIMITS.maxFileBytes / 1024 / 1024} MB.`,
        attachments: [],
      };
    }

    if (totalBytes > CONTACT_ATTACHMENT_LIMITS.maxTotalBytes) {
      return {
        error: 'Attachments are too large in total.',
        attachments: [],
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detectedContentType = detectContentType(buffer);

    if (
      !detectedContentType ||
      !CONTACT_ALLOWED_ATTACHMENT_TYPES.includes(
        detectedContentType as (typeof CONTACT_ALLOWED_ATTACHMENT_TYPES)[number],
      ) ||
      !isSafeDeclaredContentType(file.type, detectedContentType)
    ) {
      return {
        error: `${file.name} is not an accepted file type.`,
        attachments: [],
      };
    }

    attachments.push({
      buffer,
      contentType:
        detectedContentType as (typeof CONTACT_ALLOWED_ATTACHMENT_TYPES)[number],
      filename: sanitizeFilename(file.name),
      sha256: createHash('sha256').update(buffer).digest('hex'),
      size: file.size,
    });
  }

  return {
    attachments,
  };
}

export async function storeContactAttachments({
  clientIp,
  email,
  formData,
}: ContactAttachmentInput) {
  const { attachments, error } = await readAttachmentCandidates(formData);

  if (error) {
    return {
      error,
      attachments: [],
    };
  }

  if (attachments.length === 0) {
    return {
      attachments: [],
    };
  }

  const bucketName = getContactAttachmentBucketName();

  if (!bucketName) {
    return {
      error: 'Secure attachment storage is not configured.',
      attachments: [],
    };
  }

  const uploadId = randomUUID();
  const datePrefix = getDatePrefix();
  const signedUrlExpiresSeconds = getSignedUrlExpiresSeconds();
  const expiresAt = new Date(Date.now() + signedUrlExpiresSeconds * 1000);
  const clientIpHash = createHash('sha256').update(clientIp).digest('hex');
  const emailHash = createHash('sha256').update(email).digest('hex');

  const uploadedKeys: string[] = [];
  const storedAttachments: StoredContactAttachment[] = [];

  try {
    for (const [index, attachment] of attachments.entries()) {
      const key = `${CONTACT_ATTACHMENT_PREFIX}/${datePrefix}/${uploadId}/${String(index + 1).padStart(2, '0')}-${attachment.filename}`;

      await awsS3Put(key, attachment.buffer, attachment.contentType, {
        Bucket: bucketName,
        CacheControl: 'private, no-store, max-age=0',
        ContentDisposition: encodeContentDispositionFilename(
          attachment.filename,
        ),
        Metadata: {
          'client-ip-sha256': clientIpHash,
          'contact-email-sha256': emailHash,
          'original-filename': encodeURIComponent(attachment.filename),
          sha256: attachment.sha256,
          source: 'contact-form',
        },
        ServerSideEncryption: 'AES256',
        Tagging: 'source=contact-form',
      });

      uploadedKeys.push(key);

      const signedUrl = await awsS3CreateSignedGetUrl({
        Bucket: bucketName,
        ExpiresIn: signedUrlExpiresSeconds,
        Key: key,
        ResponseContentDisposition: encodeContentDispositionFilename(
          attachment.filename,
        ),
      });

      storedAttachments.push({
        contentType: attachment.contentType,
        expiresAt,
        filename: attachment.filename,
        key,
        sha256: attachment.sha256,
        signedUrl,
        size: attachment.size,
      });
    }
  } catch (error) {
    await Promise.allSettled(
      uploadedKeys.map((key) => awsS3Delete({ Bucket: bucketName, Key: key })),
    );

    throw error;
  }

  return {
    attachments: storedAttachments,
  };
}

/**
 * Best-effort removal of already-stored attachments when the email send
 * fails afterwards — otherwise the objects orphan in the private bucket
 * until (out-of-band) lifecycle rules reap them.
 */
export async function deleteContactAttachments(
  attachments: StoredContactAttachment[],
) {
  const bucketName = getContactAttachmentBucketName();

  if (!bucketName || attachments.length === 0) return;

  const results = await Promise.allSettled(
    attachments.map((attachment) =>
      awsS3Delete({ Bucket: bucketName, Key: attachment.key }),
    ),
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Failed to delete contact attachment', result.reason);
    }
  }
}
