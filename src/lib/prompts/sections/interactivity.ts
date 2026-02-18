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
}" class="relative overflow-hidden" aria-label="Slideshow">
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
  <button @click="prev()" class="absolute left-2 top-1/2 -translate-y-1/2" aria-label="Previous slide">&#8249;</button>
  <button @click="next()" class="absolute right-2 top-1/2 -translate-y-1/2" aria-label="Next slide">&#8250;</button>
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
  class="transition-[transform,opacity] duration-700 ease-out">
  Content here
</div>

<!-- Staggered cards — use inline transition-delay -->
<div class="grid grid-cols-3 gap-6">
  <div x-data="{ shown: false }" x-intersect.once="shown = true" style="transition-delay: 0ms"
    :class="shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
    class="transition-[transform,opacity] duration-700 ease-out">Card 1</div>
  <div x-data="{ shown: false }" x-intersect.once="shown = true" style="transition-delay: 150ms"
    :class="shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
    class="transition-[transform,opacity] duration-700 ease-out">Card 2</div>
  <div x-data="{ shown: false }" x-intersect.once="shown = true" style="transition-delay: 300ms"
    :class="shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
    class="transition-[transform,opacity] duration-700 ease-out">Card 3</div>
</div>

IMPORTANT: Always use full Tailwind class names in :class bindings — never construct classes dynamically with template literals. Tailwind CDN cannot detect dynamically constructed class names.
</pattern>

<pattern name="tabs">
Tab switching component:

<div x-data="{ tab: 'tab1' }">
  <div class="flex border-b border-[var(--color-surface)]" role="tablist">
    <button @click="tab = 'tab1'" class="px-5 py-3 text-sm font-medium border-b-2 transition-colors"
      :class="tab === 'tab1' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)]'"
      role="tab" :aria-selected="tab === 'tab1'">
      Tab 1</button>
    <button @click="tab = 'tab2'" class="px-5 py-3 text-sm font-medium border-b-2 transition-colors"
      :class="tab === 'tab2' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)]'"
      role="tab" :aria-selected="tab === 'tab2'">
      Tab 2</button>
  </div>
  <div class="p-6">
    <div x-show="tab === 'tab1'" x-transition.opacity role="tabpanel">Tab 1 content</div>
    <div x-show="tab === 'tab2'" x-transition.opacity x-cloak role="tabpanel">Tab 2 content</div>
  </div>
</div>
</pattern>

<pattern name="pricing-toggle">
Annual/monthly pricing toggle:

<div x-data="{ annual: true }">
  <div class="flex items-center justify-center gap-4 mb-10">
    <span :class="!annual ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'" class="text-sm font-medium transition-colors">Monthly</span>
    <button @click="annual = !annual" class="relative w-14 h-7 rounded-full bg-[var(--color-primary)] transition-colors" role="switch" :aria-checked="annual.toString()">
      <span class="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform" :class="annual && 'translate-x-7'"></span>
    </button>
    <span :class="annual ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'" class="text-sm font-medium transition-colors">Annual <span class="text-[var(--color-accent)] font-semibold">Save 20%</span></span>
  </div>
  <!-- Price display: swap values based on toggle -->
  <div class="text-5xl font-bold font-heading">
    $<span x-text="annual ? '79' : '99'">79</span><span class="text-lg text-[var(--color-text-muted)]">/mo</span>
  </div>
</div>
</pattern>

<pattern name="hover-reveal">
Card with content revealed on hover (touch-friendly via click fallback):

<div x-data="{ show: false }" @mouseenter="show = true" @mouseleave="show = false" @click="show = !show"
  class="relative overflow-hidden rounded-[var(--radius)] cursor-pointer group">
  <img src="..." alt="..." class="w-full h-80 object-cover transition-transform duration-500 group-hover:scale-105">
  <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-end p-6"
    :class="show ? 'opacity-100' : 'opacity-0 md:opacity-0'" class="transition-opacity duration-300 opacity-100 md:opacity-0">
    <div :class="show ? 'translate-y-0' : 'translate-y-4 md:translate-y-4'" class="transition-transform duration-300 translate-y-0 md:translate-y-4">
      <h3 class="text-white text-xl font-heading font-bold">Team Member Name</h3>
      <p class="text-white/80 text-sm mt-1">Role & bio text here</p>
    </div>
  </div>
</div>
</pattern>

<pattern name="modal-lightbox">
Image lightbox modal with backdrop blur and keyboard close:

<div x-data="{ open: false, src: '', alt: '' }">
  <!-- Trigger (repeat per image) -->
  <img src="thumb.jpg" alt="Gallery image" class="cursor-pointer hover:opacity-90 transition-opacity"
    @click="src = 'full.jpg'; alt = 'Gallery image'; open = true; document.body.classList.add('overflow-hidden')">

  <!-- Modal -->
  <template x-teleport="body">
    <div x-show="open" x-transition:enter="transition ease-out duration-300" x-transition:enter-start="opacity-0"
      x-transition:enter-end="opacity-100" x-transition:leave="transition ease-in duration-200"
      x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0"
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      @click.self="open = false; document.body.classList.remove('overflow-hidden')"
      @keydown.escape.window="open = false; document.body.classList.remove('overflow-hidden')"
      role="dialog" aria-modal="true" x-cloak>
      <img :src="src" :alt="alt" class="max-w-full max-h-[90vh] rounded-lg shadow-2xl">
      <button @click="open = false; document.body.classList.remove('overflow-hidden')"
        class="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="Close lightbox">
        <svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  </template>
</div>
</pattern>

<pattern name="sticky-header-shrink">
Header that shrinks on scroll with background change:

<header x-data="{ scrolled: false }" @scroll.window.passive="scrolled = window.scrollY > 50"
  :class="scrolled ? 'py-2 shadow-md bg-[var(--color-bg)]/95 backdrop-blur-sm' : 'py-5 bg-transparent'"
  class="fixed top-0 left-0 right-0 z-50 transition-all duration-300" data-block="main-nav">
  <div class="max-w-7xl mx-auto px-6 flex items-center justify-between">
    <a href="#" class="font-heading font-bold transition-all duration-300" :class="scrolled ? 'text-lg' : 'text-xl'">Brand</a>
    <!-- nav links -->
  </div>
</header>
</pattern>

<pattern name="tilt-card">
3D tilt card that follows mouse position:

<div x-data="{
  rx: 0, ry: 0,
  tilt(e) {
    const r = $el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    this.rx = y * -15;
    this.ry = x * 15;
  },
  reset() { this.rx = 0; this.ry = 0; }
}" @mouseenter="tilt($event)" @mousemove="tilt($event)" @mouseleave="reset()"
  :style="\`transform: perspective(800px) rotateX(\${rx}deg) rotateY(\${ry}deg)\`"
  class="transition-transform duration-150 ease-out rounded-[var(--radius)] bg-[var(--color-surface)] p-8 shadow-lg">
  Card content — works great for portfolio items, product cards, or feature highlights.
</div>
</pattern>

<pattern name="before-after-slider">
Draggable before/after image comparison:

<div x-data="{
  pos: 50,
  dragging: false,
  updatePos(e) {
    const r = $el.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    this.pos = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
  }
}" @mousedown="dragging = true" @mousemove="dragging && updatePos($event)"
  @mouseup="dragging = false" @mouseleave="dragging = false"
  @touchstart.prevent="dragging = true" @touchmove="updatePos($event)" @touchend="dragging = false"
  class="relative overflow-hidden rounded-[var(--radius)] cursor-ew-resize select-none" style="aspect-ratio:16/9">
  <!-- After image (full width) -->
  <img src="after.jpg" alt="After" class="absolute inset-0 w-full h-full object-cover">
  <!-- Before image (clipped) -->
  <div class="absolute inset-0" :style="\`clip-path: inset(0 \${100 - pos}% 0 0)\`">
    <img src="before.jpg" alt="Before" class="w-full h-full object-cover">
  </div>
  <!-- Slider handle -->
  <div class="absolute top-0 bottom-0 w-1 bg-white shadow-lg" :style="\`left: \${pos}%\`">
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center">
      <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 12H16M8 12L5 9M8 12L5 15M16 12L19 9M16 12L19 15"/></svg>
    </div>
  </div>
</div>
</pattern>

<pattern name="magnetic-button">
Button that subtly follows the cursor on hover (premium CTA feel):

<button x-data="{
  dx: 0, dy: 0,
  pull(e) {
    const r = $el.getBoundingClientRect();
    this.dx = (e.clientX - r.left - r.width/2) * 0.3;
    this.dy = (e.clientY - r.top - r.height/2) * 0.3;
  },
  reset() { this.dx = 0; this.dy = 0; }
}" @mousemove="pull($event)" @mouseleave="reset()"
  :style="\`transform: translate(\${dx}px, \${dy}px)\`"
  class="transition-transform duration-200 ease-out px-8 py-4 bg-[var(--color-primary)] text-white rounded-[var(--radius)] font-semibold hover:shadow-lg">
  Get Started
</button>
</pattern>

<pattern name="counter-scroll">
Animated counter triggered on scroll entry with smooth easing:

<div x-data="{
  value: 0,
  target: 2847,
  animate() {
    const duration = 2000;
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      this.value = Math.round(this.target * ease);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}" x-intersect.once="animate()">
  <span class="text-5xl font-bold font-heading" x-text="value.toLocaleString()">0</span>
  <span class="text-[var(--color-text-muted)]">Happy Clients</span>
</div>

For multiple counters, use this pattern inline on each stat — no Alpine.data() registration needed.
Preferred over the older counter pattern above — uses requestAnimationFrame for smoother animation and cubic ease-out.
</pattern>

Smooth scrolling: Add scroll-behavior: smooth to html element in CSS. For nav links pointing to #section-id anchors, this is all you need — no JavaScript required.

ACCESSIBILITY: ALL scroll-triggered animations and transitions MUST be wrapped in a prefers-reduced-motion media query. Add this CSS to every page:
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
</interactivity>`;
