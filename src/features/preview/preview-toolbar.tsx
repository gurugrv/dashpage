'use client';

import { Download, Monitor, RotateCcw, Smartphone, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { DeviceSize } from '@/features/preview/constants';

interface PreviewToolbarProps {
  device: DeviceSize;
  hasContent: boolean;
  onDeviceChange: (device: DeviceSize) => void;
  onRefresh: () => void;
  onDownload: () => void;
}

const DEVICES: Array<{ size: DeviceSize; label: string; icon: typeof Smartphone }> = [
  { size: 'mobile', label: 'Mobile', icon: Smartphone },
  { size: 'tablet', label: 'Tablet', icon: Tablet },
  { size: 'desktop', label: 'Desktop', icon: Monitor },
];

export function PreviewToolbar({
  device,
  hasContent,
  onDeviceChange,
  onRefresh,
  onDownload,
}: PreviewToolbarProps) {
  return (
    <div className="flex items-center justify-between border-b bg-background px-3 py-1.5">
      <div className="flex items-center gap-1">
        <TooltipProvider>
          {DEVICES.map(({ size, icon: Icon, label }) => (
            <Tooltip key={size}>
              <TooltipTrigger asChild>
                <Button
                  variant={device === size ? 'secondary' : 'ghost'}
                  size="icon-xs"
                  onClick={() => onDeviceChange(size)}
                >
                  <Icon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={onRefresh} disabled={!hasContent}>
                <RotateCcw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh preview</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" onClick={onDownload} disabled={!hasContent}>
                <Download className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download HTML</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
