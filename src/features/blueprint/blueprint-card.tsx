'use client';

import { FileText, Navigation, Palette, Type, Users, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Blueprint } from '@/lib/blueprint/types';

interface BlueprintCardProps {
  blueprint: Blueprint;
  onApprove: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function BlueprintCard({
  blueprint,
  onApprove,
  onRegenerate,
  onCancel,
  disabled,
}: BlueprintCardProps) {
  const { designSystem, pages, contentStrategy, sharedComponents } = blueprint;

  const colors = [
    { label: 'Primary', value: designSystem.primaryColor },
    { label: 'Secondary', value: designSystem.secondaryColor },
    { label: 'Accent', value: designSystem.accentColor },
    { label: 'Background', value: designSystem.backgroundColor },
    { label: 'Surface', value: designSystem.surfaceColor },
    { label: 'Text', value: designSystem.textColor },
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
          <div className="flex items-center gap-1.5">
            {colors.map((c) => (
              <div
                key={c.label}
                className="size-5 rounded-full border border-border/50 shadow-sm"
                style={{ backgroundColor: c.value }}
                title={`${c.label}: ${c.value}`}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{designSystem.mood}</span>
        </div>

        {/* Typography */}
        <div className="flex items-center gap-2">
          <Type className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs">
            <span className="font-medium">{designSystem.headingFont}</span>
            <span className="text-muted-foreground"> / </span>
            <span>{designSystem.bodyFont}</span>
          </span>
        </div>

        {/* Pages */}
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="flex flex-wrap gap-1">
            {pages.map((page) => (
              <span
                key={page.filename}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
              >
                {page.filename.replace('.html', '')}
                <span className="text-muted-foreground">({page.sections.length})</span>
              </span>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <Navigation className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {sharedComponents.navLinks.map((l) => l.label).join(' / ')}
          </span>
        </div>

        {/* Content Strategy */}
        <div className="flex items-center gap-2">
          <Users className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{contentStrategy.targetAudience}</span>
        </div>
        <div className="flex items-center gap-2">
          <Megaphone className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{contentStrategy.tone}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t px-4 py-3">
        <Button size="sm" onClick={onApprove} disabled={disabled}>
          Generate Pages
        </Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={disabled}>
          Regenerate
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
