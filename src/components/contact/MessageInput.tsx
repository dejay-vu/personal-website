'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';

import {
  Button,
  Description,
  FieldError,
  InputGroup,
  TextField,
} from '@heroui/react';

import {
  CONTACT_ALLOWED_ATTACHMENT_TYPES,
  CONTACT_ATTACHMENT_ACCEPT,
  CONTACT_ATTACHMENT_LIMITS,
  type ContactFormState,
  type ContactValidationError,
  formatFileSize,
} from '@/lib/contact';

import { ContactFormButton } from './ContactFormButton';
import { FileDropdown } from './FileDropdown';

function AttachmentRemoveIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className="block size-3.5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18 18 6M6 6l12 12"
      />
    </svg>
  );
}

export function MessageInput({
  attachmentError,
  canSubmit,
  feedbackKey,
  messageError,
  onValueChange,
  response,
  status,
  value,
}: {
  attachmentError?: ContactValidationError;
  canSubmit: boolean;
  feedbackKey?: number;
  messageError?: ContactValidationError;
  onValueChange: (value: string) => void;
  response: string;
  status: ContactFormState['status'];
  value: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [attachmentValidationError, setAttachmentValidationError] = useState<
    string | null
  >(null);
  const attachmentMessage = Array.isArray(attachmentError)
    ? attachmentError[0]
    : attachmentError;
  const messageErrorText = Array.isArray(messageError)
    ? messageError[0]
    : messageError;
  const visibleAttachmentMessage =
    attachmentValidationError || attachmentMessage;
  const isInvalid = Boolean(messageErrorText);

  const writeFilesToInput = (nextFiles: File[]) => {
    const transfer = new DataTransfer();

    for (const file of nextFiles) {
      transfer.items.add(file);
    }

    if (fileInputRef.current) fileInputRef.current.files = transfer.files;
  };

  const syncFiles = (nextFiles: File[]) => {
    writeFilesToInput(nextFiles);

    setFiles(nextFiles);
  };

  const validateFiles = (nextFiles: File[]) => {
    if (nextFiles.length > CONTACT_ATTACHMENT_LIMITS.maxFiles) {
      return `Attach up to ${CONTACT_ATTACHMENT_LIMITS.maxFiles} files.`;
    }

    let totalBytes = 0;

    for (const file of nextFiles) {
      totalBytes += file.size;

      if (file.size > CONTACT_ATTACHMENT_LIMITS.maxFileBytes) {
        return `${file.name} is larger than ${formatFileSize(CONTACT_ATTACHMENT_LIMITS.maxFileBytes)}.`;
      }

      if (totalBytes > CONTACT_ATTACHMENT_LIMITS.maxTotalBytes) {
        return `Attachments must be ${formatFileSize(CONTACT_ATTACHMENT_LIMITS.maxTotalBytes)} or less in total.`;
      }

      if (
        file.type &&
        !CONTACT_ALLOWED_ATTACHMENT_TYPES.includes(
          file.type as (typeof CONTACT_ALLOWED_ATTACHMENT_TYPES)[number],
        )
      ) {
        return `${file.name} is not an accepted file type.`;
      }
    }

    return null;
  };

  const handleAddFiles = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;

    const nextFiles = [...files, ...Array.from(event.target.files)];
    const validationError = validateFiles(nextFiles);

    if (validationError) {
      setAttachmentValidationError(validationError);
      event.target.value = '';
      return;
    }

    setAttachmentValidationError(null);
    syncFiles(nextFiles);
  };

  const removeFile = (index: number) => {
    const nextFiles = files.filter((_, fileIndex) => fileIndex !== index);

    setAttachmentValidationError(validateFiles(nextFiles));
    syncFiles(nextFiles);
  };

  useEffect(() => {
    writeFilesToInput(files);
  }, [files, status]);

  return (
    <TextField
      name="message"
      fullWidth
      isRequired
      aria-label="Message"
      className="flex grow flex-col"
      isInvalid={isInvalid}
    >
      {() => (
        <>
          <InputGroup
            fullWidth
            className="relative grow rounded-large border border-foreground/10 bg-background shadow-sm transition-[border-color,box-shadow] duration-300 focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
          >
            {files.length > 0 && (
              <ul className="absolute inset-x-3 top-3 z-10 flex max-h-12 flex-wrap gap-2 overflow-y-auto pr-1">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="inline-flex max-w-full items-center"
                  >
                    <Button
                      type="button"
                      variant="tertiary"
                      aria-label={`Remove ${file.name}`}
                      className="inline-flex h-8 max-w-60 items-center gap-2 rounded-full border border-foreground/20 bg-background/80 px-3 text-xs leading-none text-foreground/75 shadow-none backdrop-blur-sm transition-colors hover:border-foreground/35 hover:text-foreground"
                      onPress={() => removeFile(index)}
                    >
                      <span className="truncate">{file.name}</span>
                      <span className="inline-flex size-4 shrink-0 items-center justify-center self-center opacity-70">
                        <AttachmentRemoveIcon />
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <InputGroup.TextArea
              placeholder="Ask anything..."
              value={value}
              maxLength={5000}
              onChange={(event) => onValueChange(event.currentTarget.value)}
              className={`min-h-[25dvh] w-full resize-none pb-16 ${
                files.length > 0 ? 'pt-14' : ''
              }`}
            />
            <input
              type="file"
              name="attachments"
              multiple
              accept={CONTACT_ATTACHMENT_ACCEPT}
              ref={fileInputRef}
              onChange={handleAddFiles}
              className="hidden"
            />
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between">
              <FileDropdown onPress={() => fileInputRef.current?.click()} />
              <ContactFormButton
                feedbackKey={feedbackKey}
                isDisabled={!canSubmit}
                status={status}
              />
            </div>
          </InputGroup>
          <Description className="mt-1 text-xs">
            Minimum 10 characters
          </Description>

          {messageErrorText && (
            <FieldError className="mt-1">{messageErrorText}</FieldError>
          )}
          {visibleAttachmentMessage && (
            <p role="alert" className="mt-1 text-sm text-danger">
              {visibleAttachmentMessage}
            </p>
          )}
          {response && status === 'error' && (
            <p role="alert" className="mt-1 text-sm text-danger">
              {response}
            </p>
          )}
          {/* Always mounted: live regions announce reliably only when the
              element exists before its content changes. */}
          <p role="status" className="sr-only">
            {status === 'success' ? response || 'Message sent' : ''}
          </p>
        </>
      )}
    </TextField>
  );
}
