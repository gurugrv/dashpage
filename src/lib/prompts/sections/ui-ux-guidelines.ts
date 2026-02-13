// UI/UX Pro Max Guidelines - Condensed for system prompt
// Source: docs/ui-ux-pro-max-skill-main

export const UI_UX_GUIDELINES_SECTION = `<ui_ux_guidelines>
<industry_colors>
Choose color palettes that match the industry (NOT generic purple/blue):
- SaaS/B2B: Trust blue (#2563EB) + orange CTA (#F97316)
- Healthcare/Medical: Calm cyan (#0891B2) + health green (#059669)
- Fintech/Banking: Navy (#0F172A) + gold trust (#CA8A04)
- Beauty/Spa/Wellness: Soft pink (#EC4899) + sage green (#A8D5BA) + gold accents
- E-commerce: Success green (#059669) + urgency orange (#F97316)
- Restaurant/Food: Appetizing warm colors, avoid clinical blues
- Legal/Consulting: Authority navy (#1E3A8A) + professional grey
- Creative/Agency: Bold brand colors, expressive palette
- Education: Playful but clear - indigo (#4F46E5) + progress green
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
- Use emojis as UI icons (use Lucide/Heroicons SVG instead)
- Remove outline without replacement (focus:outline-none alone)
- Use transition-all (specify properties: transition-colors)
- Block paste on password fields
- Use placeholder-only inputs (always add labels)
- Disable zoom on mobile viewport
- Animate width/height/top/left (use transform/opacity)
</anti_patterns_critical>

<professional_details>
- No Lorem ipsum — write realistic, contextual content
- Navigation: contextually appropriate menu items
- CTAs: action-specific text ("Book a Call" not "Learn More")
- Spacing: py-16 md:py-24 minimum between sections
- Shadows: layered, not flat — creates depth
- Border radius: consistent token usage (--radius)
</professional_details>
</ui_ux_guidelines>`;
