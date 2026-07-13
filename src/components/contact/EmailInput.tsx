'use client';

import { useState } from 'react';

import { FieldError, InputGroup, TextField } from '@heroui/react';

import { EmailIcon, EmailOutlineIcon } from '../ui/Icons';
import { ContactFieldIcon } from './ContactFieldIcon';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isContactEmailValid(email: string) {
  return emailPattern.test(email);
}

export function EmailInput({
  onValueChange,
  value,
}: {
  onValueChange: (value: string) => void;
  value: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const isInvalid = value.length > 0 && !isContactEmailValid(value);

  return (
    <TextField
      name="email"
      type="email"
      fullWidth
      isRequired
      aria-label="Email"
      isInvalid={isInvalid}
    >
      <InputGroup
        fullWidth
        className="rounded-large border border-foreground/10 bg-background shadow-sm transition-[border-color,box-shadow] duration-300 focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
      >
        <InputGroup.Prefix>
          <ContactFieldIcon
            isActive={isFocused}
            SolidIcon={EmailIcon}
            OutlineIcon={EmailOutlineIcon}
          />
        </InputGroup.Prefix>
        <InputGroup.Input
          type="email"
          autoComplete="email"
          maxLength={254}
          placeholder="name@email.com"
          value={value}
          onBlur={() => setIsFocused(false)}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          onFocus={() => setIsFocused(true)}
        />
      </InputGroup>
      <FieldError>
        I don&apos;t think that&apos;s a valid email address :(
      </FieldError>
    </TextField>
  );
}
