// UI/UX Pro Max Guidelines - Condensed for system prompt
// Source: docs/ui-ux-pro-max-skill-main

export const UI_UX_GUIDELINES_SECTION = `<ui_ux_guidelines>
<industry_tones>
Industry tonal guidance — adjust the temperature and energy of your palette, not the specific colors (the design seed sets actual hues):
- SaaS/B2B: Trust and stability — lean cool on the base hue, energetic accent for CTAs
- Healthcare/Medical: Calm and reassuring — desaturate slightly, favor soft transitions
- Fintech/Banking: Authority and weight — deepen tones, use warm metallic accents sparingly
- Beauty/Spa/Wellness: Gentle and inviting — soften saturation, lean warm, airy backgrounds
- E-commerce: Confident and actionable — clear contrast, warm urgency for CTAs
- Restaurant/Food: Appetizing warmth — lean warm on the base hue, earth-toned accents
- Legal/Consulting: Understated authority — muted saturation, deep tones, minimal accent use
- Creative/Agency: Expressive energy — push saturation higher, bolder contrasts
- Education: Approachable clarity — balanced warmth, clean hierarchy, progress-indicator accents
</industry_tones>

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
