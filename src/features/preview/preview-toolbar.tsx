'use client';

import { Download, Maximize, Minimize, Monitor, RotateCcw, Smartphone, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DeviceSize } from '@/features/preview/constants';

interface PreviewToolbarProps {
  device: DeviceSize;
  hasContent: boolean;
  isFullscreen: boolean;
  onDeviceChange: (device: DeviceSize) => void;
  onRefresh: () => void;
  onDownload: () => void;
  onToggleFullscreen: () => void;
  htmlPages?: string[];
  activePage?: string;
  onPageChange?: (page: string) => void;
}

const DEVICES: Array<{ size: DeviceSize; label: string; icon: typeof Smartphone }> = [
  { size: 'mobile', label: 'Mobile', icon: Smartphone },
  { size: 'tablet', label: 'Tablet', icon: Tablet },
  { size: 'desktop', label: 'Desktop', icon: Monitor },
];

function formatPageLabel(filename: string): string {
  return filename.replace('.html', '');
}

export function PreviewToolbar({
  device,
  hasContent,
  isFullscreen,
  onDeviceChange,
  onRefresh,
  onDownload,
  onToggleFullscreen,
  htmlPages = [],
  activePage = 'index.html',
  onPageChange,
}: PreviewToolbarProps) {
  const showPageTabs = htmlPages.length > 1;

  return (
    <div className="flex flex-col border-b bg-background">
      <div className="flex items-center justify-between px-3 py-1.5">
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
              <TooltipContent>Download</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" onClick={onToggleFullscreen}>
                  {isFullscreen ? (
                    <Minimize className="size-3.5" />
                  ) : (
                    <Maximize className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {showPageTabs && (
        <div className="flex items-center gap-0.5 overflow-x-auto border-t px-3 py-1">
          {htmlPages.map((page) => (
            <button
              key={page}
              onClick={() => onPageChange?.(page)}
              className={cn(
                'rounded-sm px-2.5 py-0.5 text-xs font-medium transition-colors',
                page === activePage
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {formatPageLabel(page)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
