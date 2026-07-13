'use client';

import {
  type Dispatch,
  type SetStateAction,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { sendContactMessage } from '@/app/contact/actions';
import { Fieldset, Form } from '@heroui/react';

import {
  CONTACT_HONEYPOT_FIELD_NAME,
  type ContactFormState,
  INITIAL_CONTACT_FORM_STATE,
} from '@/lib/contact';

import { EmailInput, MessageInput, NameInput } from '.';
import { isContactEmailValid } from './EmailInput';

type ContactFormDraft = {
  email: string;
  message: string;
  name: string;
};

type ContactFormDraftField = keyof ContactFormDraft;
type ContactFormDraftVersions = Record<ContactFormDraftField, number>;

const EMPTY_CONTACT_FORM_DRAFT: ContactFormDraft = {
  email: '',
  message: '',
  name: '',
};

const INITIAL_CONTACT_FORM_DRAFT_VERSIONS: ContactFormDraftVersions = {
  email: 0,
  message: 0,
  name: 0,
};

function ContactFormFields({
  draft,
  draftVersions,
  ignoredFeedbackKey,
  setDraft,
  setDraftVersions,
  submittedDraftVersions,
  state,
}: {
  draft: ContactFormDraft;
  draftVersions: ContactFormDraftVersions;
  ignoredFeedbackKey?: number;
  setDraft: Dispatch<SetStateAction<ContactFormDraft>>;
  setDraftVersions: Dispatch<SetStateAction<ContactFormDraftVersions>>;
  submittedDraftVersions: ContactFormDraftVersions;
  state: ContactFormState;
}) {
  const trimmedEmail = draft.email.trim();
  const trimmedMessage = draft.message.trim();
  const isEmailInvalid =
    trimmedEmail.length > 0 && !isContactEmailValid(trimmedEmail);
  const canSubmit =
    trimmedEmail.length > 0 && trimmedMessage.length > 0 && !isEmailInvalid;
  const isStaleServerFeedback = Boolean(
    state.feedbackKey && state.feedbackKey === ignoredFeedbackKey,
  );
  const getVisibleFieldError = (field: ContactFormDraftField) =>
    !isStaleServerFeedback &&
    draftVersions[field] === submittedDraftVersions[field]
      ? state.fieldErrors?.[field]
      : undefined;
  const updateDraftField = (field: ContactFormDraftField, value: string) => {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
    setDraftVersions((currentDraftVersions) => ({
      ...currentDraftVersions,
      [field]: currentDraftVersions[field] + 1,
    }));
  };

  return (
    <>
      <NameInput
        value={draft.name}
        onValueChange={(name) => updateDraftField('name', name)}
      />
      <EmailInput
        value={draft.email}
        onValueChange={(email) => updateDraftField('email', email)}
      />
      <MessageInput
        attachmentError={
          isStaleServerFeedback ? undefined : state.fieldErrors?.attachments
        }
        canSubmit={canSubmit}
        feedbackKey={isStaleServerFeedback ? undefined : state.feedbackKey}
        messageError={getVisibleFieldError('message')}
        onValueChange={(message) => updateDraftField('message', message)}
        response={isStaleServerFeedback ? '' : state.message}
        status={isStaleServerFeedback ? 'idle' : state.status}
        value={draft.message}
      />
    </>
  );
}

export function ContactForm() {
  const [draft, setDraft] = useState<ContactFormDraft>(
    EMPTY_CONTACT_FORM_DRAFT,
  );
  const [draftVersions, setDraftVersions] = useState<ContactFormDraftVersions>(
    INITIAL_CONTACT_FORM_DRAFT_VERSIONS,
  );
  const [ignoredFeedbackKey, setIgnoredFeedbackKey] = useState<number>();
  const [submittedDraftVersions, setSubmittedDraftVersions] =
    useState<ContactFormDraftVersions>(INITIAL_CONTACT_FORM_DRAFT_VERSIONS);
  const formRef = useRef<HTMLFormElement>(null);
  const honeypotInputRef = useRef<HTMLInputElement>(null);
  const lastResetKey = useRef<number | undefined>(undefined);
  const startedAtInputRef = useRef<HTMLInputElement>(null);
  const [state, formAction] = useActionState(
    sendContactMessage,
    INITIAL_CONTACT_FORM_STATE,
  );

  const resetFormStartedAt = useCallback(() => {
    if (startedAtInputRef.current && !startedAtInputRef.current.value) {
      startedAtInputRef.current.value = String(Date.now());
    }
  }, []);

  useEffect(() => {
    resetFormStartedAt();
  }, [resetFormStartedAt]);

  useEffect(() => {
    if (
      state.status === 'success' &&
      state.resetKey &&
      state.resetKey !== lastResetKey.current
    ) {
      lastResetKey.current = state.resetKey;
      setDraft({ ...EMPTY_CONTACT_FORM_DRAFT });
      setDraftVersions({ ...INITIAL_CONTACT_FORM_DRAFT_VERSIONS });
      setSubmittedDraftVersions({ ...INITIAL_CONTACT_FORM_DRAFT_VERSIONS });
      formRef.current?.reset();
      if (startedAtInputRef.current) {
        startedAtInputRef.current.value = '';
      }
      resetFormStartedAt();
    }
  }, [resetFormStartedAt, state]);

  const handleSubmit = () => {
    setIgnoredFeedbackKey(state.feedbackKey);

    if (honeypotInputRef.current) {
      honeypotInputRef.current.value = '';
    }

    setSubmittedDraftVersions(draftVersions);
  };

  return (
    <div>
      <Form
        ref={formRef}
        action={formAction}
        validationBehavior="aria"
        onSubmit={handleSubmit}
        className="flex h-full w-full flex-col items-stretch space-y-4"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
        >
          <input
            ref={honeypotInputRef}
            name={CONTACT_HONEYPOT_FIELD_NAME}
            type="text"
            tabIndex={-1}
            autoComplete="new-password"
            inputMode="none"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            className="h-px w-px opacity-0"
          />
        </div>
        <input
          ref={startedAtInputRef}
          type="hidden"
          name="formStartedAt"
          defaultValue=""
        />

        <Fieldset className="m-0 flex h-full min-w-0 flex-col border-0 p-0">
          <Fieldset.Legend className="sr-only">Contact form</Fieldset.Legend>
          <Fieldset.Group className="flex h-full w-full flex-col items-stretch gap-4">
            <ContactFormFields
              key={state.resetKey ?? 0}
              draft={draft}
              draftVersions={draftVersions}
              ignoredFeedbackKey={ignoredFeedbackKey}
              setDraft={setDraft}
              setDraftVersions={setDraftVersions}
              submittedDraftVersions={submittedDraftVersions}
              state={state}
            />
          </Fieldset.Group>
        </Fieldset>
      </Form>
    </div>
  );
}
