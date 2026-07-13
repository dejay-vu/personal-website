export const CONTACT_ATTACHMENT_LIMITS = {
  maxFiles: 3,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 3 * 1024 * 1024,
};

export const CONTACT_HONEYPOT_FIELD_NAME = 'contact_meta_input';

export const CONTACT_ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
] as const;

export const CONTACT_ATTACHMENT_ACCEPT =
  CONTACT_ALLOWED_ATTACHMENT_TYPES.join(',');

export type ContactFormField =
  | 'name'
  | 'email'
  | 'message'
  | 'attachments'
  | 'form';

export type ContactValidationError = string | string[];

export type ContactFormState = {
  status: 'idle' | 'success' | 'error';
  message: string;
  fieldErrors?: Partial<Record<ContactFormField, ContactValidationError>>;
  feedbackKey?: number;
  resetKey?: number;
};

export const INITIAL_CONTACT_FORM_STATE: ContactFormState = {
  status: 'idle',
  message: '',
};

export { formatFileSize } from './format';
