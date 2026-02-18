// Alpine.js interactivity patterns for AI-generated websites.
// Replaces inline <script> blocks with declarative Alpine.js directives.
// Used by both chat mode (system-prompt.ts) and blueprint mode (page-system-prompt.ts).

export const ALPINE_CDN_TAGS = `<script defer src="https://cdn.jsdelivr.net/npm/@alpinejs/collapse@3.x.x/dist/cdn.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/@alpinejs/intersect@3.x.x/dist/cdn.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>`;

export const ALPINE_CLOAK_CSS = `[x-cloak] { display: none !important; }`;

export const INTERACTIVITY_SECTION = `<interactivity>
Use Alpine.js for ALL UI interactivity. Alpine.js and its plugins (Collapse, Intersect) are loaded via CDN in <head>. NEVER write inline <script> blocks for toggles, accordions, carousels, counters, scroll animations, or mobile menus.

The ONLY acceptable <script> blocks are:
1. CDN script tags in <head> (Alpine + plugins + Tailwind)
2. The Tailwind config script
3. A single Alpine.data() registration block for reusable components (optional)

Everything else MUST use Alpine directives in HTML attributes.

CRITICAL: Add x-cloak to every element that uses x-show and starts hidden. The [x-cloak] { display: none !important } CSS rule is already loaded — this prevents flash of unstyled content.

<pattern name="accordion">
FAQ/accordion with smooth collapse animation:

<div x-data="{ active: '' }" class="divide-y divide-gray-200">
  <!-- Repeat this block per item, changing the id string -->
  <div>
    <button @click="active = active === 'q1' ? '' : 'q1'"
      class="flex items-center justify-between w-full py-5 text-left font-medium"
      :aria-expanded="active === 'q1'">
      <span>Question text here</span>
      <svg class="w-5 h-5 shrink-0 transition-transform duration-200" :class="active === 'q1' && 'rotate-180'"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div x-show="active === 'q1'" x-collapse x-cloak>
      <div class="pb-5 text-[var(--color-text-muted)]">Answer text here</div>
    </div>
  </div>
</div>
</pattern>

<pattern name="carousel">
Testimonial/card carousel with autoplay and navigation:

<div x-data="{
  current: 0,
  total: 4,
  auto: null,
  init() { this.auto = setInterval(() => this.next(), 5000) },
  destroy() { clearInterval(this.auto) },
  next() { this.current = (this.current + 1) % this.total },
  prev() { this.current = (this.current - 1 + this.total) % this.total }
}" class="relative overflow-hidden">
  <div class="relative min-h-[200px]">
    <!-- One div per slide. Use x-cloak on all but first -->
    <div x-show="current === 0" x-transition.opacity.duration.500ms class="absolute inset-0 p-8">
      Slide 1 content
    </div>
    <div x-show="current === 1" x-transition.opacity.duration.500ms class="absolute inset-0 p-8" x-cloak>
      Slide 2 content
    </div>
    <!-- ... more slides -->
  </div>
  <!-- Dots -->
  <div class="flex justify-center gap-2 mt-6">
    <template x-for="i in total" :key="i">
      <button @click="current = i - 1" class="w-2.5 h-2.5 rounded-full transition-colors"
        :class="current === i - 1 ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-text-muted)]/30'"></button>
    </template>
  </div>
  <!-- Arrows -->
  <button @click="prev()" class="absolute left-2 top-1/2 -translate-y-1/2">&#8249;</button>
  <button @click="next()" class="absolute right-2 top-1/2 -translate-y-1/2">&#8250;</button>
</div>
</pattern>

<pattern name="counter">
Animated counter that counts up when scrolled into view (requires Intersect plugin):

For repeating counters, register once with Alpine.data then reuse:
<script>
document.addEventListener('alpine:init', () => {
  Alpine.data('counter', (target, duration = 2000) => ({
    count: 0, started: false,
    start() {
      if (this.started) return;
      this.started = true;
      const steps = 60, step = Math.ceil(target / steps);
      let current = 0;
      const timer = setInterval(() => {
        current = Math.min(current + step, target);
        this.count = current;
        if (current >= target) clearInterval(timer);
      }, duration / steps);
    }
  }));
});
</script>

<!-- Usage per stat -->
<div x-data="counter(5000)" x-intersect.once="start()">
  <span class="text-5xl font-bold" x-text="count.toLocaleString()">0</span>
  <span>Happy Patients</span>
</div>
</pattern>

<pattern name="mobile-menu">
Mobile hamburger menu with body scroll lock and animated icon:

<nav x-data="{ open: false }" @keydown.escape.window="open = false; document.body.classList.remove('overflow-hidden')">
  <div class="flex items-center justify-between px-6 py-4">
    <a href="#" class="font-heading text-xl font-bold">Brand</a>
    <!-- Desktop links (hidden on mobile) -->
    <div class="hidden md:flex gap-8">
      <a href="#about">About</a>
      <a href="#services">Services</a>
      <a href="#contact">Contact</a>
    </div>
    <!-- Hamburger (visible on mobile only) -->
    <button @click="open = !open; document.body.classList.toggle('overflow-hidden', open)"
      class="md:hidden p-2" :aria-expanded="open">
      <div class="w-6 h-5 flex flex-col justify-between">
        <span class="h-0.5 bg-current transition-all duration-300 origin-center" :class="open && 'rotate-45 translate-y-2'"></span>
        <span class="h-0.5 bg-current transition-all duration-300" :class="open && 'opacity-0'"></span>
        <span class="h-0.5 bg-current transition-all duration-300 origin-center" :class="open && '-rotate-45 -translate-y-2'"></span>
      </div>
    </button>
  </div>
  <!-- Mobile overlay -->
  <div x-show="open" x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0"
    x-transition:enter-end="opacity-100" x-transition:leave="transition ease-in duration-150"
    x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0"
    @click="open = false; document.body.classList.remove('overflow-hidden')"
    class="fixed inset-0 bg-black/40 z-40 md:hidden" x-cloak></div>
  <!-- Mobile drawer -->
  <div x-show="open" x-transition:enter="transition ease-out duration-300" x-transition:enter-start="-translate-x-full"
    x-transition:enter-end="translate-x-0" x-transition:leave="transition ease-in duration-200"
    x-transition:leave-start="translate-x-0" x-transition:leave-end="-translate-x-full"
    class="fixed top-0 left-0 h-full w-72 bg-[var(--color-bg)] shadow-xl z-50 flex flex-col p-8 gap-6 md:hidden" x-cloak>
    <a href="#about" @click="open = false; document.body.classList.remove('overflow-hidden')">About</a>
    <a href="#services" @click="open = false; document.body.classList.remove('overflow-hidden')">Services</a>
    <a href="#contact" @click="open = false; document.body.classList.remove('overflow-hidden')">Contact</a>
  </div>
</nav>
</pattern>

<pattern name="scroll-reveal">
Elements that animate in when scrolled into view (requires Intersect plugin):

<!-- Single element fade-up -->
<div x-data="{ shown: false }" x-intersect.once="shown = true"
  :class="shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
  class="transition-all duration-700 ease-out">
  Content here
</div>

<!-- Staggered cards — use inline transition-delay -->
<div class="grid grid-cols-3 gap-6">
  <div x-data="{ shown: false }" x-intersect.once="shown = true" style="transition-delay: 0ms"
    :class="shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
    class="transition-all duration-700 ease-out">Card 1</div>
  <div x-data="{ shown: false }" x-intersect.once="shown = true" style="transition-delay: 150ms"
    :class="shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
    class="transition-all duration-700 ease-out">Card 2</div>
  <div x-data="{ shown: false }" x-intersect.once="shown = true" style="transition-delay: 300ms"
    :class="shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
    class="transition-all duration-700 ease-out">Card 3</div>
</div>

IMPORTANT: Always use full Tailwind class names in :class bindings — never construct classes dynamically with template literals. Tailwind CDN cannot detect dynamically constructed class names.
</pattern>

<pattern name="tabs">
Tab switching component:

<div x-data="{ tab: 'tab1' }">
  <div class="flex border-b border-[var(--color-surface)]">
    <button @click="tab = 'tab1'" class="px-5 py-3 text-sm font-medium border-b-2 transition-colors"
      :class="tab === 'tab1' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)]'">
      Tab 1</button>
    <button @click="tab = 'tab2'" class="px-5 py-3 text-sm font-medium border-b-2 transition-colors"
      :class="tab === 'tab2' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)]'">
      Tab 2</button>
  </div>
  <div class="p-6">
    <div x-show="tab === 'tab1'" x-transition.opacity>Tab 1 content</div>
    <div x-show="tab === 'tab2'" x-transition.opacity x-cloak>Tab 2 content</div>
  </div>
</div>
</pattern>

Smooth scrolling: Add scroll-behavior: smooth to html element in CSS. For nav links pointing to #section-id anchors, this is all you need — no JavaScript required.
</interactivity>`;
