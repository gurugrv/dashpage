'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import { FONT_CATEGORIES, ALL_FONTS_URL } from '@/lib/fonts';

// Track whether fonts CSS has been injected globally (across all pickers)
let fontsLoaded = false;

function ensureFontsLoaded() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = ALL_FONTS_URL;
  document.head.appendChild(link);
}

interface FontPickerProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function FontPicker({ value, onValueChange, placeholder = 'Pick a font…', className }: FontPickerProps) {
  const [open, setOpen] = useState(false);

  // Load Google Fonts CSS on first open
  const hasOpened = useRef(false);
  useEffect(() => {
    if (open && !hasOpened.current) {
      hasOpened.current = true;
      ensureFontsLoaded();
    }
  }, [open]);

  return (
    <Combobox
      value={value}
      onValueChange={(val) => {
        if (val != null) onValueChange(val as string);
      }}
      open={open}
      onOpenChange={setOpen}
    >
      <ComboboxInput
        placeholder={placeholder}
        className={className}
        style={{ fontFamily: value || undefined }}
      />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty>No fonts found</ComboboxEmpty>
          {FONT_CATEGORIES.map((category) => (
            <ComboboxGroup key={category.label}>
              <ComboboxLabel>{category.label}</ComboboxLabel>
              {category.fonts.map((font) => (
                <ComboboxItem key={font} value={font} style={{ fontFamily: font }}>
                  {font}
                </ComboboxItem>
              ))}
            </ComboboxGroup>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
