/**
 * Detects whether a user prompt implies a multi-page website (3+ pages).
 * Used to auto-activate blueprint mode without a manual toggle.
 */

// Common page names users mention
const PAGE_NAMES = [
  'home', 'about', 'contact', 'menu', 'services', 'pricing',
  'portfolio', 'gallery', 'blog', 'faq', 'team', 'careers',
  'events', 'testimonials', 'products', 'shop', 'store',
  'login', 'signup', 'dashboard', 'features', 'how it works',
  'reservations', 'booking', 'schedule', 'news', 'press',
  'terms', 'privacy', 'support', 'help', 'resources',
  'case studies', 'partners', 'locations', 'donate',
];

// Explicit multi-page signals
const MULTI_PAGE_PATTERNS = [
  /\b(\d+)\s*(?:-\s*)?pages?\b/i,                    // "5 pages", "5-page"
  /\bmulti[- ]?page\b/i,                              // "multi-page", "multipage"
  /\bfull\s+(?:website|site)\b/i,                     // "full website", "full site"
  /\bcomplete\s+(?:website|site)\b/i,                 // "complete website"
  /\bentire\s+(?:website|site)\b/i,                   // "entire website"
  /\bwith\s+(?:the\s+following\s+)?pages?\s*[:\-]/i,  // "with pages:", "with the following pages:"
  /\bpages?\s*(?:include|including|such as|like)\b/i,  // "pages including"
  /\beach\s+page\b/i,                                 // "each page"
  /\bseparate\s+pages?\b/i,                           // "separate pages"
  /\bnavigation\s+(?:between|across|to)\b/i,          // "navigation between"
];

export function detectMultiPageIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();

  // Check explicit numeric page count (e.g., "5 pages")
  const pageCountMatch = lower.match(/\b(\d+)\s*(?:-\s*)?pages?\b/);
  if (pageCountMatch) {
    const count = parseInt(pageCountMatch[1], 10);
    if (count >= 3) return true;
  }

  // Check explicit multi-page patterns
  for (const pattern of MULTI_PAGE_PATTERNS) {
    if (pattern.test(lower)) return true;
  }

  // Count distinct page names mentioned in the prompt
  const mentionedPages = new Set<string>();
  for (const name of PAGE_NAMES) {
    // Match as whole word (with word boundary or surrounded by punctuation/spaces)
    const regex = new RegExp(`\\b${name}\\b`, 'i');
    if (regex.test(lower)) {
      mentionedPages.add(name);
    }
  }

  // If 3+ distinct page names are mentioned, it's multi-page
  if (mentionedPages.size >= 3) return true;

  // Check for comma/and-separated page listing pattern
  // e.g., "home, about, contact, and menu"
  const listPattern = /(?:home|about|contact|menu|services|pricing|portfolio|gallery|blog|faq|team|events|products|shop|features)(?:\s*(?:,|and)\s*(?:home|about|contact|menu|services|pricing|portfolio|gallery|blog|faq|team|events|products|shop|features)){2,}/i;
  if (listPattern.test(lower)) return true;

  return false;
}
