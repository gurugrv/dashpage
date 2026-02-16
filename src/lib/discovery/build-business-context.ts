import type { BusinessProfileData } from './types';

export function buildBusinessContextBlock(profile: BusinessProfileData | null | undefined): string {
  if (!profile) return '';

  const lines: string[] = [];

  if (profile.name) lines.push(`Business Name: ${profile.name}`);
  if (profile.category) lines.push(`Category: ${profile.category}`);
  if (profile.address) lines.push(`Address: ${profile.address}`);
  if (profile.phone) lines.push(`Phone: ${profile.phone}`);
  if (profile.email) lines.push(`Email: ${profile.email}`);
  if (profile.website) lines.push(`Website: ${profile.website}`);
  if (profile.hours && Object.keys(profile.hours).length > 0) {
    lines.push(`Hours: ${Object.entries(profile.hours).map(([day, time]) => `${day}: ${time}`).join(', ')}`);
  }
  if (profile.services && profile.services.length > 0) {
    lines.push(`Services: ${profile.services.join(', ')}`);
  }
  if (profile.socialMedia && Object.keys(profile.socialMedia).length > 0) {
    lines.push(`Social Media: ${Object.entries(profile.socialMedia).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  }
  if (profile.googleMapsUri) lines.push(`Google Maps: ${profile.googleMapsUri}`);
  if (profile.additionalInfo) lines.push(`Additional Info: ${profile.additionalInfo}`);

  if (lines.length === 0) return '';

  return `\n<business_context>
${lines.join('\n')}

USE THIS REAL DATA. Do not invent placeholder names, addresses, phone numbers, or services.
Replace any placeholder content with the actual business information above.
When generating contact sections, forms, or maps, use the real address and phone number provided.
</business_context>`;
}
