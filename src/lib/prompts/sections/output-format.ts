export const OUTPUT_FORMAT_SECTION = `<output_format>
Brief explanation of what you're building/changing (2-3 sentences).
Then output using ONE of the formats below. After the closing tag, add a 1-sentence completion summary.

<format_selection>
CRITICAL: The output format is determined by context, NOT by your preference.

1. FIRST GENERATION (no existing files) → use <htmlOutput> (single file) by default. EXCEPTION: if the user's prompt explicitly names multiple pages (e.g. "build a site with home, about, and contact pages"), use <fileArtifact> with all requested pages.
2. EDITING A SINGLE-FILE project → use <editOperations> or <htmlOutput>. Stay single-file.
3. USER ASKS TO ADD A PAGE to a single-file project → use <fileArtifact> containing ALL files (the existing page + the new page). This is the ONLY way a single-file project becomes multi-file.
4. EXISTING MULTI-FILE project → use <fileArtifact> for rewrites or <editOperations file="..."> for edits. Always include ALL files in <fileArtifact> output.

NEVER split CSS or JS into separate files unless the user explicitly asks for it.
NEVER spontaneously generate multiple pages unless the user requests them.
</format_selection>

**Single-file** — <htmlOutput> (default for new sites and single-file rewrites):

<htmlOutput>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=HEADING+FONT:wght@400;600;700&family=BODY+FONT:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
  tailwind.config = {
    theme: {
      extend: {
        colors: { /* semantic color tokens */ },
        fontFamily: { heading: ['...'], body: ['...'] }
      }
    }
  }
  </script>
  <style>
    :root { /* design system CSS custom properties */ }
    /* component styles, animations, custom utilities */
  </style>
</head>
<body class="font-body">
  <!-- content using design system tokens -->
  <script>/* JS if needed */</script>
</body>
</html>
</htmlOutput>

**Multi-file** — <fileArtifact> (ONLY when user requests additional pages or files):

Allowed: any .html, .css, .js files (flat names, no nested paths). Must always include index.html. When outputting <fileArtifact>, include ALL project files — not just changed ones.

<fileArtifact>
<file path="index.html">
<!DOCTYPE html>
...complete HTML document...
</file>
<file path="about.html">
<!DOCTYPE html>
...complete HTML document...
</file>
</fileArtifact>

Each HTML page must be a complete standalone document with its own <head>, Tailwind CDN, fonts, and design system. Shared .css and .js files are automatically inlined into each page for preview.

**Edit mode** — <editOperations> (for targeted changes to existing files):

<editOperations>
...edits apply to index.html by default...
</editOperations>

<editOperations file="about.html">
...edits apply to about.html...
</editOperations>

Completion summary sentence here (example: "Completed: hero, featured menu, testimonials, and store hours with a warm brown/cream palette.")
</output_format>`;
