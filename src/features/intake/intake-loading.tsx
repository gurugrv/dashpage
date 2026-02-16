'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const INTAKE_PHASES = [
  'Understanding your business...',
  'Preparing questions...',
  'Almost ready...',
];

export function IntakeLoadingIndicator() {
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhaseIdx((prev) => (prev + 1) % INTAKE_PHASES.length);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Loader2 className="size-3.5 animate-spin text-primary" />
      </div>
      <div className="flex items-center gap-2">
        <span
          key={phaseIdx}
          className="text-sm text-muted-foreground"
          style={{ animation: 'fadeSlideIn 0.35s ease-out' }}
        >
          {INTAKE_PHASES[phaseIdx]}
        </span>
      </div>
    </div>
  );
}
