export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getSavedTimeZone(): string | null {
  try {
    const value = localStorage.getItem('userTimeZone');
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}
