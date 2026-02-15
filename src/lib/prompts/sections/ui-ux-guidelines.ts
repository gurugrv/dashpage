// UI/UX Pro Max Guidelines - Condensed for system prompt
// Source: docs/ui-ux-pro-max-skill-main

export const UI_UX_GUIDELINES_SECTION = `<ui_ux_guidelines>
<industry_colors>
Use the industry as inspiration, generate unique custom HSL values every time:
- SaaS/B2B: Trust-evoking blues or teals with an energetic CTA accent
- Healthcare/Medical: Calm tones — cyans, sage greens, soft blues
- Fintech/Banking: Deep authoritative tones with warm metallic accents
- Beauty/Spa/Wellness: Soft warm tones — rose, sage, champagne, lavender
- E-commerce: Confidence-building greens or warm urgency tones for CTAs
- Restaurant/Food: Appetizing warm colors — terracotta, amber, olive, burgundy
- Legal/Consulting: Deep authoritative tones with understated elegance
- Creative/Agency: Bold expressive palettes that show personality
- Education: Approachable and clear — balanced warm/cool with progress indicators
</industry_colors>

<accessibility_rules>
- All interactive elements: cursor-pointer, hover feedback, smooth transition (duration-200/300), focus-visible:ring-2
- Touch targets: minimum 44x44px. Animations: 150-300ms, never >500ms. Respect prefers-reduced-motion.
- Text contrast: minimum 4.5:1 ratio. Form inputs: ALWAYS have labels. Icon buttons: aria-label required.
- Images: meaningful alt text. Keyboard navigation: all features via Tab/Enter.
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

<interaction_standards>
- Use the searchIcons tool for UI icons — real SVG icons look professional, emojis don't.
- Style focus states intentionally: replace default outlines with focus-visible:ring-2, not just outline-none.
- Form inputs always get visible labels (not placeholder-only). Allow paste on all fields.
- Keep mobile viewport zoomable — accessibility requires it.
- Animate with transform and opacity for smooth 60fps performance.
</interaction_standards>
</ui_ux_guidelines>`;
