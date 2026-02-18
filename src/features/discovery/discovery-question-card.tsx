'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, MessageSquare, SkipForward } from 'lucide-react';
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
import type { DiscoveryQuestion, PlacesEnrichment } from '@/lib/discovery/types';
import { AddressAutocomplete } from './address-autocomplete';

interface DiscoveryQuestionCardProps {
  question: DiscoveryQuestion;
  answered?: string;
  onSubmit: (value: string) => void;
  onAddressSelect?: (address: string, enrichment: PlacesEnrichment) => void;
  disabled?: boolean;
}

export function DiscoveryQuestionCard({
  question,
  answered,
  onSubmit,
  onAddressSelect,
  disabled,
}: DiscoveryQuestionCardProps) {
  const [value, setValue] = useState(question.prefilled ?? '');
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [otherActive, setOtherActive] = useState(false);
  const [otherText, setOtherText] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  const handleSkip = () => {
    onSubmit('');
  };

  // business_name is the only truly required field — everything else can be skipped
  const canSkip = question.id !== 'business_name' && question.id !== 'name';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && question.type !== 'textarea') {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (disabled && answered !== undefined) {
    const wasSkipped = answered === '';
    return (
      <div
        className="flex gap-3 px-4 py-3"
        style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
      >
        <div className={`flex size-7 shrink-0 items-center justify-center rounded-full ${wasSkipped ? 'bg-muted' : 'bg-green-100 dark:bg-green-900/30'}`}>
          {wasSkipped
            ? <SkipForward className="size-3.5 text-muted-foreground" />
            : <Check className="size-3.5 text-green-600 dark:text-green-500" />
          }
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground">{question.question}</span>
          <span className={`text-sm ${wasSkipped ? 'italic text-muted-foreground' : 'font-medium'}`}>
            {wasSkipped ? 'Skipped' : answered}
          </span>
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
          ) : question.type === 'multi_select' && question.options ? (
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {question.options.map((opt) => {
                  const isSelected = selectedOptions.has(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setSelectedOptions(prev => {
                          const next = new Set(prev);
                          if (next.has(opt)) next.delete(opt);
                          else next.add(opt);
                          return next;
                        });
                      }}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground hover:bg-muted'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setOtherActive(prev => !prev);
                    if (!otherActive) {
                      setTimeout(() => otherInputRef.current?.focus(), 50);
                    }
                  }}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    otherActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-dashed border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  + Other
                </button>
              </div>
              {otherActive && (
                <Input
                  ref={otherInputRef}
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const parts = [...Array.from(selectedOptions)];
                      const trimmed = otherText.trim();
                      if (trimmed) parts.push(trimmed);
                      if (parts.length > 0) onSubmit(parts.join(', '));
                    }
                  }}
                  placeholder="Type your own..."
                  className="h-9 text-sm"
                />
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    const parts = [...Array.from(selectedOptions)];
                    const trimmed = otherText.trim();
                    if (trimmed) parts.push(trimmed);
                    onSubmit(parts.join(', '));
                  }}
                  disabled={selectedOptions.size === 0 && !otherText.trim()}
                >
                  Submit
                </Button>
                {canSkip && (
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Skip
                  </button>
                )}
              </div>
            </div>
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
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!value.trim()}
                >
                  Submit
                </Button>
                {canSkip && (
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Skip
                  </button>
                )}
              </div>
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
                disabled={!value.trim()}
              >
                Submit
              </Button>
              {canSkip && (
                <button
                  type="button"
                  onClick={handleSkip}
                  className="h-9 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip
                </button>
              )}
            </>
          )}
        </div>
        {canSkip && (question.type === 'address_autocomplete' || question.type === 'select') && (
          <button
            type="button"
            onClick={handleSkip}
            className="self-start text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip this question
          </button>
        )}
      </div>
    </div>
  );
}
