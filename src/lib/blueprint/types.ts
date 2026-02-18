import { z } from 'zod';

// Section enrichment enums — used by blueprint generation and page generation
export const sectionTypeEnum = z.enum([
  'hero', 'features', 'testimonials', 'pricing', 'faq', 'stats', 'team',
  'gallery', 'form', 'timeline', 'comparison', 'cta-banner', 'case-study',
  'process-steps', 'logo-cloud', 'video-showcase', 'map-contact',
  'blog-grid', 'portfolio-grid', 'before-after', 'scrollytelling',
  'mega-menu-preview', 'calculator-tool', 'custom'
]);

export const layoutHintEnum = z.enum([
  'bento-grid', 'split-screen', 'card-mosaic', 'asymmetric',
  'centered-minimal', 'horizontal-scroll', 'diagonal', 'full-bleed',
  'stacked', 'sticky-stack', 'overlapping-layers', 'cinematic-fullscreen',
  'alternating-sides', 'custom'
]);

export const mediaTypeEnum = z.enum([
  'hero-image', 'inline-photos', 'icons-only', 'background-pattern',
  'illustration', 'video-embed', 'gradient-mesh', 'none'
]);

export const interactiveElementEnum = z.enum([
  'accordion', 'tabs', 'carousel', 'counter-animation', 'toggle-switch',
  'hover-reveal', 'progressive-disclosure', 'before-after-slider',
  'tilt-card', 'magnetic-button', 'none'
]);

export const motionIntentEnum = z.enum([
  'entrance-reveal', 'staggered-cards', 'parallax-bg', 'counter-animation',
  'kinetic-type', 'hover-showcase', 'scroll-reveal', 'text-reveal',
  'zoom-entrance', 'none'
]);

export const surfaceTreatmentEnum = z.enum([
  'textured', 'layered-gradients', 'glassmorphism', 'clean', 'organic',
  'neubrutalist', 'claymorphism'
]);

export const visualStyleEnum = z.enum([
  'editorial-magazine', 'tech-minimal', 'luxury-refined', 'bold-expressive',
  'organic-warm', 'brutalist-raw', 'retro-nostalgic', 'corporate-clean'
]);

export const visualWeightEnum = z.enum([
  'hero-heavy', 'content-dense', 'balanced', 'minimal'
]);

export const contentDepthEnum = z.enum([
  'minimal', 'standard', 'rich'
]);

export const blueprintPageSectionSchema = z.object({
  id: z.string().describe('Unique section identifier (e.g., "hero", "features", "pricing")'),
  name: z.string().describe('Human-readable section name (e.g., "Hero", "Features"). Use empty string if unsure.'),
  description: z.string().describe('What this section should contain and accomplish'),
  contentNotes: z.string().describe('Specific content guidance or copy direction. Use empty string if none.'),
  sectionType: sectionTypeEnum.catch('custom').optional().default('custom').describe('Section archetype (hero, features, pricing, etc.)'),
  layoutHint: layoutHintEnum.catch('stacked').optional().default('stacked').describe('Layout pattern (bento-grid, split-screen, asymmetric, etc.)'),
  itemCount: z.number().catch(undefined as unknown as number).optional().describe('Number of repeating items (cards, testimonials, features). Omit to let generator decide.'),
  mediaType: mediaTypeEnum.catch('none').optional().default('none').describe('Primary media type for this section'),
  interactiveElement: interactiveElementEnum.catch('none').optional().default('none').describe('Interactive UI pattern (accordion, tabs, carousel, etc.)'),
  motionIntent: motionIntentEnum.catch('none').optional().default('none').describe('Animation intent (entrance-reveal, staggered-cards, parallax-bg, etc.)'),
  imageDirection: z.string().optional().default('').describe('Specific subject/style for imagery, e.g. "close-up hands working with clay, warm tones"'),
  contentDepth: contentDepthEnum.catch('standard').optional().default('standard').describe('How much copy/data this section should contain'),
}).transform((section) => ({
  ...section,
  // Derive name from id when model returns empty string (e.g., "about-doctor" → "About Doctor")
  name: section.name || section.id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
}));

export const blueprintPageSchema = z.object({
  filename: z.string().describe('HTML filename (e.g., "index.html", "about.html")'),
  title: z.string().describe('Page title for <title> tag and SEO'),
  description: z.string().describe('Meta description for SEO'),
  purpose: z.string().describe('The role this page plays in the site'),
  contentFocus: z.string().optional().default('').describe('Unique messaging this page owns, e.g. "trust through case studies"'),
  visualWeight: visualWeightEnum.catch('balanced').optional().default('balanced').describe('Visual spectacle vs information density'),
  heroApproach: z.string().optional().default('').describe('Hero section approach, e.g. "full-bleed image with overlay text"'),
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
  surfaceTreatment: surfaceTreatmentEnum.catch('clean').optional().default('clean').describe('Background surface style (textured, layered-gradients, glassmorphism, clean, organic)'),
  visualStyle: visualStyleEnum.catch('bold-expressive').optional().default('bold-expressive').describe('Site-level visual archetype driving layout and composition decisions'),
  imageStyle: z.string().optional().default('').describe('Image direction, e.g. "warm documentary photography with natural light"'),
  fontWeights: z.object({
    heading: z.array(z.number()).optional().default([400, 600, 700]),
    body: z.array(z.number()).optional().default([400, 500, 600]),
  }).optional().default({ heading: [400, 600, 700], body: [400, 500, 600] }).describe('Font weights to load'),
});

const keyStatSchema = z.object({
  label: z.string().describe('Stat label (e.g., "Happy Clients")'),
  value: z.string().describe('Stat value (e.g., "500+")'),
});

export const blueprintContentStrategySchema = z.object({
  tone: z.string().min(3).describe('Writing tone (e.g., "professional yet approachable")'),
  targetAudience: z.string().min(3).describe('Who the site is for'),
  primaryCTA: z.string().min(3).describe('Main call-to-action text and goal'),
  brandVoice: z.string().min(3).describe('Brand personality in 2-3 words'),
  valuePropositions: z.array(z.string()).optional().default([]).describe('3-5 core value propositions'),
  differentiators: z.array(z.string()).optional().default([]).describe('What makes this business unique'),
  keyStats: z.array(keyStatSchema).optional().default([]).describe('Impressive numbers to showcase'),
  brandStory: z.string().optional().default('').describe('2-3 sentence brand narrative'),
  contentDistribution: z.record(z.string(), z.array(z.string())).optional().default({}).describe('Maps page filenames to assigned value propositions — prevents repetitive content across pages'),
  seoKeywords: z.record(z.string(), z.array(z.string())).optional().default({}).describe('Per-page target keywords for SEO'),
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
  businessName: z.string().optional().default('').describe('Official business name, or empty string if unknown'),
  address: z.string().optional().default('').describe('Physical address, or empty string if unknown'),
  phone: z.string().optional().default('').describe('Phone number, or empty string if unknown'),
  email: z.string().optional().default('').describe('Email address, or empty string if unknown'),
  hours: z.string().optional().default('').describe('Business hours (e.g. "Mon: 9am-5pm, Tue: 9am-5pm"), or empty string if unknown'),
  services: z.array(z.string()).optional().default([]).describe('Key services or offerings, or empty array if unknown'),
  tagline: z.string().optional().default('').describe('Business tagline or slogan, or empty string if unknown'),
  socialMedia: z.string().optional().default('').describe('Social media URLs as comma-separated "platform: url" pairs, e.g. "Facebook: https://facebook.com/biz, Instagram: https://instagram.com/biz", or empty string if unknown'),
  category: z.string().optional().default('').describe('Business category or type (e.g. "dentist", "restaurant"), or empty string if unknown'),
  googleMapsUri: z.string().optional().default('').describe('Google Maps URL for embedding, or empty string if unknown'),
  location: z.string().optional().default('').describe('Lat/lng coordinates as "lat,lng" for map embeds, or empty string if unknown'),
  additionalInfo: z.string().optional().default('').describe('Any other relevant business details, or empty string if unknown'),
});

export type SiteFacts = z.infer<typeof siteFactsSchema>;

export const blueprintSchema = z.object({
  siteName: z.string().describe('Name of the website'),
  siteDescription: z.string().describe('One-sentence site description'),
  pages: z.array(blueprintPageSchema).min(1).describe('Ordered list of all pages to generate'),
  designSystem: blueprintDesignSystemSchema,
  sharedComponents: blueprintSharedComponentsSchema,
  contentStrategy: blueprintContentStrategySchema,
  needsResearch: z.boolean().describe('Set to true when the prompt references a real business, place, or person whose details should be looked up, false otherwise'),
});

export type BlueprintPageSection = z.infer<typeof blueprintPageSectionSchema>;
export type BlueprintPage = z.infer<typeof blueprintPageSchema>;
export type BlueprintDesignSystem = z.infer<typeof blueprintDesignSystemSchema>;
export type BlueprintContentStrategy = z.infer<typeof blueprintContentStrategySchema>;
export type BlueprintSharedComponents = z.infer<typeof blueprintSharedComponentsSchema>;
/** Blueprint type includes siteFacts which is populated by research after generation, not by the AI schema */
export type Blueprint = z.infer<typeof blueprintSchema> & {
  siteFacts?: SiteFacts;
  /** True while background research is in progress; cleared when research completes */
  researchPending?: boolean;
};
