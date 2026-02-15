import { z } from 'zod';

export const blueprintPageSectionSchema = z.object({
  id: z.string().describe('Unique section identifier (e.g., "hero", "features", "pricing")'),
  name: z.string().describe('Human-readable section name'),
  description: z.string().describe('What this section should contain and accomplish'),
  contentNotes: z.string().describe('Specific content guidance or copy direction'),
});

export const blueprintPageSchema = z.object({
  filename: z.string().describe('HTML filename (e.g., "index.html", "about.html")'),
  title: z.string().describe('Page title for <title> tag and SEO'),
  description: z.string().describe('Meta description for SEO'),
  purpose: z.string().describe('The role this page plays in the site'),
  sections: z.array(blueprintPageSectionSchema).describe('Ordered list of page sections'),
});

export const blueprintDesignSystemSchema = z.object({
  primaryColor: z.string().min(4).describe('Primary brand color (hex)'),
  secondaryColor: z.string().min(4).describe('Secondary color (hex)'),
  accentColor: z.string().min(4).describe('Accent/highlight color (hex)'),
  backgroundColor: z.string().min(4).describe('Page background color (hex)'),
  surfaceColor: z.string().min(4).describe('Card/surface background color (hex)'),
  textColor: z.string().min(4).describe('Primary text color (hex)'),
  textMutedColor: z.string().min(4).describe('Secondary/muted text color (hex)'),
  headingFont: z.string().min(1).describe('Google Font name for headings'),
  bodyFont: z.string().min(1).describe('Google Font name for body text'),
  borderRadius: z.string().min(1).describe('Border radius token (e.g., "8px", "12px", "0.5rem")'),
  mood: z.string().min(3).describe('Overall design mood (e.g., "warm and inviting", "sleek and modern")'),
});

export const blueprintContentStrategySchema = z.object({
  tone: z.string().min(3).describe('Writing tone (e.g., "professional yet approachable")'),
  targetAudience: z.string().min(3).describe('Who the site is for'),
  primaryCTA: z.string().min(3).describe('Main call-to-action text and goal'),
  brandVoice: z.string().min(3).describe('Brand personality in 2-3 words'),
});

export const blueprintNavLinkSchema = z.object({
  label: z.string().describe('Display text for the link'),
  href: z.string().describe('Relative filename (e.g., "about.html")'),
});

export const blueprintSharedComponentsSchema = z.object({
  navLinks: z.array(blueprintNavLinkSchema).min(1).describe('Navigation links for header and footer'),
  footerTagline: z.string().min(3).describe('Short tagline or description for the footer'),
});

export const siteFactsSchema = z.object({
  businessName: z.string().optional().describe('Official business name'),
  address: z.string().optional().describe('Physical address'),
  phone: z.string().optional().describe('Phone number'),
  email: z.string().optional().describe('Email address'),
  hours: z.string().optional().describe('Business hours (e.g. "Mon-Fri 9am-5pm, Sat 10am-2pm")'),
  services: z.array(z.string()).optional().describe('Key services or offerings'),
  tagline: z.string().optional().describe('Business tagline or slogan'),
  socialMedia: z.string().optional().describe('Social media URLs as comma-separated "platform: url" pairs, e.g. "Facebook: https://facebook.com/biz, Instagram: https://instagram.com/biz"'),
  additionalInfo: z.string().optional().describe('Any other relevant business details'),
});

export type SiteFacts = z.infer<typeof siteFactsSchema>;

export const blueprintSchema = z.object({
  siteName: z.string().describe('Name of the website'),
  siteDescription: z.string().describe('One-sentence site description'),
  pages: z.array(blueprintPageSchema).min(1).describe('Ordered list of all pages to generate'),
  designSystem: blueprintDesignSystemSchema,
  sharedComponents: blueprintSharedComponentsSchema,
  contentStrategy: blueprintContentStrategySchema,
  needsResearch: z.boolean().optional().describe('Set to true when the prompt references a real business, place, or person whose details should be looked up'),
  siteFacts: siteFactsSchema.optional().describe('Verified business details from web research'),
});

export type BlueprintPageSection = z.infer<typeof blueprintPageSectionSchema>;
export type BlueprintPage = z.infer<typeof blueprintPageSchema>;
export type BlueprintDesignSystem = z.infer<typeof blueprintDesignSystemSchema>;
export type BlueprintContentStrategy = z.infer<typeof blueprintContentStrategySchema>;
export type BlueprintSharedComponents = z.infer<typeof blueprintSharedComponentsSchema>;
export type Blueprint = z.infer<typeof blueprintSchema>;
