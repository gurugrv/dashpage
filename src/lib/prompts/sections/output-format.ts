export const OUTPUT_FORMAT_SECTION = `<output_format>
Brief explanation of what you're building/changing (2-3 sentences).
Then output EITHER <editOperations> (edit mode) or <htmlOutput> (rewrite mode).

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
</output_format>`;
