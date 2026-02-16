'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { IntakeQuestion, PlacesEnrichment } from '@/lib/intake/types';
import { AddressAutocomplete } from './address-autocomplete';

interface IntakeQuestionCardProps {
  question: IntakeQuestion;
  answered?: string;
  onSubmit: (value: string) => void;
  onAddressSelect?: (address: string, enrichment: PlacesEnrichment) => void;
  disabled?: boolean;
}

export function IntakeQuestionCard({
  question,
  answered,
  onSubmit,
  onAddressSelect,
  disabled,
}: IntakeQuestionCardProps) {
  const [value, setValue] = useState(question.prefilled ?? '');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed && question.required) return;
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && question.type !== 'textarea') {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (disabled && answered) {
    return (
      <div
        className="flex gap-3 px-4 py-3"
        style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
      >
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <Check className="size-3.5 text-green-600 dark:text-green-500" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground">{question.question}</span>
          <span className="text-sm font-medium">{answered}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex gap-3 px-4 py-3"
      style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <MessageSquare className="size-3.5 text-primary" />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <span className="text-sm text-foreground">{question.question}</span>
        <div className="flex gap-2">
          {question.type === 'address_autocomplete' ? (
            <AddressAutocomplete
              value={value}
              onChange={setValue}
              onSelect={(address, enrichment) => {
                setValue(address);
                if (onAddressSelect) {
                  onAddressSelect(address, enrichment);
                } else {
                  onSubmit(address);
                }
              }}
              onSubmitPlain={handleSubmit}
            />
          ) : question.type === 'select' && question.options ? (
            <Select
              value={value}
              onValueChange={(v) => {
                setValue(v);
                onSubmit(v);
              }}
            >
              <SelectTrigger className="h-9 flex-1 text-sm">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {question.options.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : question.type === 'textarea' ? (
            <div className="flex flex-1 flex-col gap-2">
              <Textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Type your answer..."
                className="min-h-[80px] text-sm"
                rows={3}
              />
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={question.required && !value.trim()}
              >
                Submit
              </Button>
            </div>
          ) : (
            <>
              <Input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type={question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  question.type === 'phone' ? '(555) 123-4567'
                    : question.type === 'email' ? 'name@example.com'
                    : 'Type your answer...'
                }
                className="h-9 flex-1 text-sm"
              />
              <Button
                size="sm"
                className="h-9"
                onClick={handleSubmit}
                disabled={question.required && !value.trim()}
              >
                Submit
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
