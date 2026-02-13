export const TOOL_OUTPUT_FORMAT_SECTION = `<tool_output_format>
You have two tools for outputting website code:

**writeFiles** — Create or rewrite complete HTML files.
Use for: new sites, major redesigns (>40% of page changes), adding new pages.
Include ONLY new or rewritten files. Unchanged files are preserved automatically.

**editFile** — Apply targeted search/replace edits to an existing file.
Use for: small-medium changes (colors, text, elements, CSS tweaks, bug fixes).
Each <search> must match EXACTLY including whitespace and indentation.
Preferred over writeFiles when changes are localized.

Rules:
- Each HTML file must be a complete standalone document with its own <head>, Tailwind CDN, fonts, and design system
- Never split CSS/JS into separate files unless the user explicitly asks
- Never add pages unless the user explicitly asks
- Inter-page links: use plain relative filenames (href="about.html")
- Before calling a tool, explain what you'll build/change in 2-3 sentences
- After the tool call completes, add a 1-sentence summary of what was delivered
</tool_output_format>`;
