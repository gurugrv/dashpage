'use client';

import { useState } from 'react';
import { FileText, Palette, Pencil, Sparkles, Type, Users, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import type { Blueprint, BlueprintDesignSystem, BlueprintContentStrategy } from '@/lib/blueprint/types';
import { FontPicker } from '@/features/blueprint/font-picker';

interface BlueprintCardProps {
  blueprint: Blueprint;
  onApprove: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
  onUpdate?: (blueprint: Blueprint) => void;
  disabled?: boolean;
}

export function BlueprintCard({
  blueprint,
  onApprove,
  onRegenerate,
  onCancel,
  onUpdate,
  disabled,
}: BlueprintCardProps) {
  const { designSystem, pages, contentStrategy, sharedComponents } = blueprint;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Blueprint>(blueprint);

  const designSource = isEditing ? draft.designSystem : designSystem;
  const strategySource = isEditing ? draft.contentStrategy : contentStrategy;

  const updateDesign = (field: keyof BlueprintDesignSystem, value: string) => {
    setDraft((prev) => ({
      ...prev,
      designSystem: { ...prev.designSystem, [field]: value },
    }));
  };

  const updateStrategy = (field: keyof BlueprintContentStrategy, value: string) => {
    setDraft((prev) => ({
      ...prev,
      contentStrategy: { ...prev.contentStrategy, [field]: value },
    }));
  };

  const handleEdit = () => {
    setDraft(blueprint);
    setIsEditing(true);
  };

  const handleDone = () => {
    setIsEditing(false);
    onUpdate?.(draft);
  };

  const colors: { label: string; value: string; field: keyof BlueprintDesignSystem }[] = [
    { label: 'Primary', value: designSource.primaryColor, field: 'primaryColor' },
    { label: 'Secondary', value: designSource.secondaryColor, field: 'secondaryColor' },
    { label: 'Accent', value: designSource.accentColor, field: 'accentColor' },
    { label: 'Background', value: designSource.backgroundColor, field: 'backgroundColor' },
    { label: 'Surface', value: designSource.surfaceColor, field: 'surfaceColor' },
    { label: 'Text', value: designSource.textColor, field: 'textColor' },
  ];

  return (
    <div className="mx-4 my-3 rounded-lg border bg-background shadow-sm">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{blueprint.siteName}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{blueprint.siteDescription}</p>
      </div>

      <div className="space-y-3 px-4 py-3">
        {/* Color Palette */}
        <div className="flex items-center gap-2">
          <Palette className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">Colors</span>
          <div className="flex items-center gap-1.5">
            {colors.map((c) =>
              isEditing ? (
                <Popover key={c.label}>
                  <PopoverTrigger asChild>
                    <button
                      className="size-5 rounded-full border border-border/50 shadow-sm ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ backgroundColor: c.value }}
                      title={`${c.label}: ${c.value}`}
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-3" align="start">
                    <label className="mb-1.5 block text-xs font-medium">{c.label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="size-6 shrink-0 cursor-pointer rounded border border-border/50 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-none"
                        value={c.value}
                        onChange={(e) => updateDesign(c.field, e.target.value)}
                      />
                      <input
                        type="text"
                        className="h-7 w-full rounded border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={c.value}
                        onChange={(e) => updateDesign(c.field, e.target.value)}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <div
                  key={c.label}
                  className="size-5 rounded-full border border-border/50 shadow-sm"
                  style={{ backgroundColor: c.value }}
                  title={`${c.label}: ${c.value}`}
                />
              ),
            )}
          </div>
        </div>

        {/* Mood */}
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">Mood</span>
          {isEditing ? (
            <input
              type="text"
              className="min-w-0 flex-1 border-b border-dashed border-input bg-transparent text-xs text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
              value={designSource.mood}
              onChange={(e) => updateDesign('mood', e.target.value)}
            />
          ) : (
            <span className="text-xs text-muted-foreground">{designSystem.mood}</span>
          )}
        </div>

        {/* Typography */}
        <div className="flex items-center gap-2">
          <Type className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">Fonts</span>
          {isEditing ? (
            <div className="flex items-center gap-1 text-xs">
              <FontPicker
                value={designSource.headingFont}
                onValueChange={(v) => updateDesign('headingFont', v)}
                placeholder="Heading font"
                className="w-36"
              />
              <span className="text-muted-foreground">/</span>
              <FontPicker
                value={designSource.bodyFont}
                onValueChange={(v) => updateDesign('bodyFont', v)}
                placeholder="Body font"
                className="w-36"
              />
            </div>
          ) : (
            <span className="text-xs">
              <span className="font-medium">{designSystem.headingFont}</span>
              <span className="text-muted-foreground"> / </span>
              <span>{designSystem.bodyFont}</span>
            </span>
          )}
        </div>

        {/* Pages */}
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span className="mt-0.5 w-14 shrink-0 text-xs font-medium text-muted-foreground">Pages</span>
          <div className="flex flex-wrap gap-1">
            {pages.map((page) => (
              <span
                key={page.filename}
                className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs"
              >
                {page.filename.replace('.html', '')}
              </span>
            ))}
          </div>
        </div>

        {/* Content Strategy */}
        <div className="flex items-center gap-2">
          <Users className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">Audience</span>
          {isEditing ? (
            <input
              type="text"
              className="min-w-0 flex-1 border-b border-dashed border-input bg-transparent text-xs text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
              value={strategySource.targetAudience}
              onChange={(e) => updateStrategy('targetAudience', e.target.value)}
            />
          ) : (
            <span className="text-xs text-muted-foreground">{contentStrategy.targetAudience}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Megaphone className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">Tone</span>
          {isEditing ? (
            <input
              type="text"
              className="min-w-0 flex-1 border-b border-dashed border-input bg-transparent text-xs text-muted-foreground focus-visible:outline-none focus-visible:border-ring"
              value={strategySource.tone}
              onChange={(e) => updateStrategy('tone', e.target.value)}
            />
          ) : (
            <span className="text-xs text-muted-foreground">{contentStrategy.tone}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t px-4 py-3">
        <Button size="sm" onClick={onApprove} disabled={disabled || isEditing}>
          Generate Pages
        </Button>
        {isEditing ? (
          <Button size="sm" variant="outline" onClick={handleDone}>
            Done
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={handleEdit} disabled={disabled}>
            <Pencil className="mr-1 size-3" />
            Edit
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={disabled || isEditing}>
          Regenerate
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
