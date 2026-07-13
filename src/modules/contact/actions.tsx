'use server';

import { headers } from 'next/headers';

import EmailToMe from '@/app/api/contact/send/EmailToMe';
import EmailToUser from '@/app/api/contact/send/EmailToUser';
import { Resend } from 'resend';

import {
  CONTACT_HONEYPOT_FIELD_NAME,
  type ContactFormState,
} from '@/lib/contact';

import {
  type StoredContactAttachment,
  deleteContactAttachments,
  storeContactAttachments,
} from '@/services/contactAttachments';

const CONTACT_RATE_LIMIT = {
  maxAttempts: 3,
  windowMs: 10 * 60 * 1000,
};

const MIN_SUBMIT_TIME_MS = 2500;
const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 5000;

type RateLimitBucket = {
  attempts: number;
  resetAt: number;
};

declare global {
  var contactRateLimitBuckets: Map<string, RateLimitBucket> | undefined;
}

const rateLimitBuckets =
  globalThis.contactRateLimitBuckets ?? new Map<string, RateLimitBucket>();

globalThis.contactRateLimitBuckets = rateLimitBuckets;

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
}

function getClientIp(headerStore: Headers) {
  // x-real-ip is set by the hosting proxy (Vercel); the first value of
  // x-forwarded-for can be spoofed by the client, so it is only a fallback.
  const realIp = headerStore.get('x-real-ip');

  if (realIp) return realIp.trim();

  const forwardedFor = headerStore.get('x-forwarded-for');

  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

function isAllowedOrigin(headerStore: Headers) {
  const origin = headerStore.get('origin');
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');

  // Match the stricter admin policy: only dev tolerates a missing origin.
  if (!origin || !host) {
    return process.env.NODE_ENV !== 'production';
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function checkRateLimit(key: string) {
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.CONTACT_RATE_LIMIT_DISABLED === 'true'
  ) {
    return true;
  }

  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, {
      attempts: 1,
      resetAt: now + CONTACT_RATE_LIMIT.windowMs,
    });

    return true;
  }

  if (bucket.attempts >= CONTACT_RATE_LIMIT.maxAttempts) return false;

  bucket.attempts += 1;

  return true;
}

function validateSubmitTime(formStartedAt: string) {
  const startedAt = Number(formStartedAt);

  if (!Number.isFinite(startedAt)) return true;

  const elapsed = Date.now() - startedAt;

  return elapsed < 0 || elapsed >= MIN_SUBMIT_TIME_MS;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function sendContactMessage(
  _previousState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const headerStore = await headers();

  if (!isAllowedOrigin(headerStore)) {
    return {
      status: 'error',
      message: 'This request could not be verified.',
      feedbackKey: Date.now(),
      fieldErrors: {
        form: 'This request could not be verified.',
      },
    };
  }

  if (!validateSubmitTime(getString(formData, 'formStartedAt'))) {
    return {
      status: 'error',
      message: 'Please wait a moment before sending.',
      feedbackKey: Date.now(),
      fieldErrors: {
        form: 'Please wait a moment before sending.',
      },
    };
  }

  const name = getString(formData, 'name');
  const email = getString(formData, 'email').toLowerCase();
  const message = getString(formData, 'message');

  const fieldErrors: ContactFormState['fieldErrors'] = {};

  if (name.length > MAX_NAME_LENGTH) {
    fieldErrors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  if (!email) {
    fieldErrors.email = 'Please enter an email address.';
  } else if (email.length > MAX_EMAIL_LENGTH || !isEmail(email)) {
    fieldErrors.email = 'Please enter a valid email address.';
  }

  if (!message) {
    fieldErrors.message = 'Please enter a message.';
  } else if (message.length < MIN_MESSAGE_LENGTH) {
    fieldErrors.message = `Message must be at least ${MIN_MESSAGE_LENGTH} characters.`;
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    fieldErrors.message = `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 'error',
      message: '',
      feedbackKey: Date.now(),
      fieldErrors,
    };
  }

  const honeypot = getString(formData, CONTACT_HONEYPOT_FIELD_NAME);

  if (honeypot) {
    return {
      status: 'success',
      message: 'Message Sent',
      feedbackKey: Date.now(),
      resetKey: Date.now(),
    };
  }

  const clientIp = getClientIp(headerStore);

  if (!checkRateLimit(clientIp)) {
    return {
      status: 'error',
      message: 'Too many messages. Please try again later.',
      feedbackKey: Date.now(),
      fieldErrors: {
        form: 'Too many messages. Please try again later.',
      },
    };
  }

  let attachments: StoredContactAttachment[] = [];

  try {
    const attachmentStorage = await storeContactAttachments({
      clientIp,
      email,
      formData,
    });

    if (attachmentStorage.error) {
      return {
        status: 'error',
        message: '',
        feedbackKey: Date.now(),
        fieldErrors: {
          attachments: attachmentStorage.error,
        },
      };
    }

    attachments = attachmentStorage.attachments;
  } catch {
    return {
      status: 'error',
      message: 'Attachments could not be stored securely.',
      feedbackKey: Date.now(),
      fieldErrors: {
        form: 'Attachments could not be stored securely.',
      },
    };
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    await deleteContactAttachments(attachments);

    return {
      status: 'error',
      message: 'Email service is not configured.',
      feedbackKey: Date.now(),
      fieldErrors: {
        form: 'Email service is not configured.',
      },
    };
  }

  const resend = new Resend(apiKey);
  const userSubject = name
    ? `Thanks for your message, ${name}!`
    : 'Thanks for your message!';

  try {
    const { error } = await resend.emails.send({
      from: 'DeJay Vu <contact@dejayvu.com>',
      to: ['junhao.zhang2301@gmail.com'],
      replyTo: email,
      subject: `New message from ${name || 'Anonymous'}`,
      react: (
        <EmailToMe
          attachments={attachments}
          userEmail={email}
          userMessage={message}
        />
      ),
    });

    if (error) {
      // Log the provider detail, but never surface it to the browser.
      console.error('Resend rejected contact email', error);
      await deleteContactAttachments(attachments);

      return {
        status: 'error',
        message: 'Message could not be sent.',
        feedbackKey: Date.now(),
        fieldErrors: {
          form: 'Message could not be sent. Please try again later.',
        },
      };
    }
  } catch (error) {
    console.error('Failed to send contact email', error);
    await deleteContactAttachments(attachments);

    return {
      status: 'error',
      message: 'Message could not be sent.',
      feedbackKey: Date.now(),
      fieldErrors: {
        form: 'Message could not be sent.',
      },
    };
  }

  // The owner email is the one that matters: a failed courtesy copy must not
  // report an error, or the sender retries and the owner receives duplicates.
  try {
    await resend.emails.send({
      from: 'DeJay Vu <contact@dejayvu.com>',
      to: [email],
      replyTo: 'junhao.zhang2301@gmail.com',
      subject: userSubject,
      react: <EmailToUser userName={name} userMessage={message} />,
    });
  } catch (error) {
    console.error('Failed to send contact confirmation email', error);
  }

  return {
    status: 'success',
    message: 'Message Sent',
    feedbackKey: Date.now(),
    resetKey: Date.now(),
  };
}
