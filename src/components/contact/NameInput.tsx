'use client';

import { useState } from 'react';

import { InputGroup, TextField } from '@heroui/react';

import { UserIcon, UserOutlineIcon } from '../ui/Icons';
import { ContactFieldIcon } from './ContactFieldIcon';

export function NameInput({
  onValueChange,
  value,
}: {
  onValueChange: (value: string) => void;
  value: string;
}) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <TextField fullWidth name="name" aria-label="Name">
      <InputGroup
        fullWidth
        className="rounded-large border border-foreground/10 bg-background shadow-sm transition-[border-color,box-shadow] duration-300 focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
      >
        <InputGroup.Prefix>
          <ContactFieldIcon
            isActive={isFocused}
            SolidIcon={UserIcon}
            OutlineIcon={UserOutlineIcon}
          />
        </InputGroup.Prefix>
        <InputGroup.Input
          autoComplete="name"
          placeholder="Enter your name"
          maxLength={80}
          value={value}
          onBlur={() => setIsFocused(false)}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          onFocus={() => setIsFocused(true)}
        />
      </InputGroup>
    </TextField>
  );
}
