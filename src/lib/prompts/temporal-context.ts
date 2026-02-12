export interface TemporalContext {
  currentDate: string;
  timeZone: string;
}

const DEFAULT_TIME_ZONE = 'UTC';

function normalizeTimeZone(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_TIME_ZONE;
  const candidate = value.trim();
  if (!candidate) return DEFAULT_TIME_ZONE;

  try {
    // Throws on invalid IANA time zone names.
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function resolvePreferredTimeZone(
  savedTimeZoneInput: unknown,
  browserTimeZoneInput: unknown
): string {
  if (typeof savedTimeZoneInput === 'string' && savedTimeZoneInput.trim()) {
    return normalizeTimeZone(savedTimeZoneInput);
  }

  if (typeof browserTimeZoneInput === 'string' && browserTimeZoneInput.trim()) {
    return normalizeTimeZone(browserTimeZoneInput);
  }

  return DEFAULT_TIME_ZONE;
}

export function buildTemporalContext(timeZoneInput: unknown): TemporalContext {
  const now = new Date();
  const timeZone = normalizeTimeZone(timeZoneInput);

  const currentDate = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  return {
    currentDate,
    timeZone,
  };
}
