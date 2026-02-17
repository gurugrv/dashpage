'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ImageGenConfig, ImageProvider } from '@/hooks/useImageGenConfig';
import { IMAGE_GEN_MODELS } from '@/hooks/useImageGenConfig';

interface ImageGenSettingsProps {
  config: ImageGenConfig;
  onChange: (update: Partial<ImageGenConfig>) => void;
}

export function ImageGenSettings({ config, onChange }: ImageGenSettingsProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Choose how images are sourced for generated websites.
      </p>

      <div className="space-y-2">
        <label className="text-xs font-medium">Image Source</label>
        <Select
          value={config.provider}
          onValueChange={(value: ImageProvider) => onChange({ provider: value })}
        >
          <SelectTrigger className="text-xs h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pexels" className="text-xs">
              Pexels — Stock Photos (Free)
            </SelectItem>
            <SelectItem value="together" className="text-xs">
              AI Generated — Together.ai (FLUX)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.provider === 'together' && (
        <div className="space-y-2">
          <label className="text-xs font-medium">Image Model</label>
          <Select
            value={config.model}
            onValueChange={(model) => onChange({ model })}
          >
            <SelectTrigger className="text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_GEN_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.name} <span className="text-muted-foreground ml-1">{m.price}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Requires a Together.ai API key (set in API Keys tab).
          </p>
        </div>
      )}
    </div>
  );
}
