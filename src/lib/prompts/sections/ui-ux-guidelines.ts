// UI/UX Pro Max Guidelines - Condensed for system prompt
// Source: docs/ui-ux-pro-max-skill-main

export const UI_UX_GUIDELINES_SECTION = `<ui_ux_guidelines>
<industry_colors>
Use the industry as inspiration, but generate unique custom hex values every time (NOT generic purple/blue):
- SaaS/B2B: Trust-evoking blues or teals with an energetic CTA accent
- Healthcare/Medical: Calm, clean tones — cyans, sage greens, or soft blues
- Fintech/Banking: Deep authoritative tones with warm metallic accents
- Beauty/Spa/Wellness: Soft warm tones — rose, sage, champagne, or lavender
- E-commerce: Confidence-building greens or warm urgency tones for CTAs
- Restaurant/Food: Appetizing warm colors — terracotta, amber, olive, burgundy
- Legal/Consulting: Deep authoritative tones with understated elegance
- Creative/Agency: Bold expressive palettes that show personality
- Education: Approachable and clear — balanced warm/cool with progress indicators
</industry_colors>

<interaction_essentials>
CRITICAL: Every interactive element must have:
1. cursor-pointer class
2. Hover feedback (color, shadow, or scale)
3. Smooth transition: duration-200 or duration-300
4. Visible focus state: focus-visible:ring-2 focus-visible:ring-primary

Touch targets: minimum 44x44px (min-h-[44px] min-w-[44px])
Animations: 150-300ms for micro-interactions, never >500ms for UI
Respect prefers-reduced-motion for accessibility
</interaction_essentials>

<accessibility_rules>
- Text contrast: minimum 4.5:1 ratio (use contrast checker)
- Form inputs: ALWAYS have associated labels
- Icon buttons: aria-label required
- Images: meaningful alt text
- Keyboard navigation: all features accessible via Tab/Enter
- Focus rings: visible 3-4px on interactive elements
</accessibility_rules>

<layout_patterns>
Landing page structures (choose based on goal):
- Hero-Centric: Full viewport hero + compelling headline + CTA above fold
- Social Proof-Focused: Testimonials prominently placed before final CTA
- Feature Showcase: Grid layout (3-4 columns) with icon cards
- Minimal Direct: Single column, generous whitespace, one clear CTA
- Conversion-Optimized: Form above fold, minimal fields (3 max), trust badges

Responsive breakpoints: 375px, 768px, 1024px, 1440px
Content max-width: max-w-3xl for text (65-75ch readable length)
</layout_patterns>

<anti_patterns_critical>
NEVER:
- Use emojis as UI icons (use the searchIcons tool instead)
- Remove outline without replacement (focus:outline-none alone)
- Block paste on password fields
- Use placeholder-only inputs (always add labels)
- Disable zoom on mobile viewport
- Animate width/height/top/left directly (use transform/opacity instead)
</anti_patterns_critical>
</ui_ux_guidelines>`;
