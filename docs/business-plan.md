# Business Plan: AI Website Generator
*Prompt-to-Website Platform for Non-Technical Users*

---

## Executive Summary

An AI-powered website generator targeting non-tech savvy small business owners, freelancers, and solopreneurs. Users describe their business in plain language and receive a beautiful, fully hosted single-page website in under 5 minutes. The platform includes hosting, with an option to bring your own domain or purchase one at extra cost. Priced at **$59/year** — one plan, one site — significantly undercutting the market while delivering superior output quality.

---

## Problem

- 27% of small businesses still have no website in 2025
- 26% cite cost as the primary barrier
- Existing builders are either too expensive ($15–$30/month), too complex, or produce generic output
- Non-tech users are abandoned at the point of setup — domain connection, hosting configuration, and page editing cause drop-off

---

## Solution

A prompt-to-website generator that:
- Takes a plain-language description of the user's business
- Automatically researches the business online to enrich content with real data
- Generates a beautiful, mobile-first single-page website in under 5 minutes
- Hosts the site, handles SSL, and manages deployment automatically
- Allows editing via natural language — no drag-and-drop, no code

---

## Market Opportunity

- Global AI Website Builder Market: **$5 billion in 2025**, projected to reach **$20+ billion by 2033** (31% CAGR)
- 27% of small businesses globally still lack a website — a large addressable market actively seeking affordable solutions
- 62.5% of web traffic comes from mobile — demand for fast, mobile-first sites is structural
- 32% of small businesses use DIY website builders — a proven, paying audience

---

## Product

### Core Features
- **Prompt-to-site generation** — describe your business, get a complete website
- **Automatic business research** — pipeline searches the web for real business data (address, phone, reviews, services) and incorporates it into the site
- **AI-generated images** — contextually appropriate visuals generated via Together.ai FLUX.1-dev
- **Real-time streaming preview** — users watch their site build live, section by section
- **Natural language editing** — post-generation edits via chat
- **One-click publish** — hosting, SSL, and deployment handled automatically
- **Custom domain support** — bring your own or purchase at extra cost

### What We Generate
A structured single-page site with:
- Hero section with headline, subheading, and CTA
- About / credentials section
- Services or products section
- Trust signals (stats, testimonials, reviews)
- FAQ section
- Contact section with form, address, and map

### What We Don't Do (At Launch)
- Multi-page sites as the default experience (deliberate decision — see Product Philosophy). Multi-page blueprint pipeline exists in the codebase as a future upsell.
- E-commerce / payment processing
- CMS / blog functionality
- Custom code editing

---

## Product Philosophy: Single-Page Only

The decision to launch as a single-page generator is strategic, not a limitation.

**Why single-page is right for our audience:**
- A local bakery, freelance photographer, personal trainer, or small consultancy doesn't need 8 pages — they need a homepage that looks credible, loads fast, and gets people to contact or book
- Non-tech users asking for "multiple pages" are describing their *content*, not a technical requirement — a well-structured single page covers it entirely
- Single-page sites are faster to generate, cheaper to host, simpler to edit, and have fewer failure modes
- Mobile users prefer scrolling over navigation — single-page is the native mobile format

**The competitive precedent:**
Durable built a $20M+ funded business with 3 million users on essentially this model. They added multi-page later. We make it a deliberate product choice from day one.

**Multi-page as future upsell:**
The multi-page blueprint pipeline exists in the codebase. It becomes a paid upgrade tier when user demand and infrastructure maturity justify it — not a launch complexity.

---

## Technical Architecture

### Generation Pipeline

```
User Prompt → Discovery (optional business intake via AI analysis + Google Places)
           → Blueprint Generation (Sonnet) → Business Research (Haiku + Brave Search)
           → Shared Components Generation (header/footer)
           → Shared Assets Generation (styles.css + scripts.js)
           → HTML Page Generation (Sonnet, parallel, max 3 concurrent)
           → Post-Processing (block validation + component extraction)
           → Image generation: Together.ai FLUX.1-dev
           → Icon sourcing: Iconify (Lucide, Heroicons, Tabler, Phosphor)
           → CDN Deploy
```

### Key Technical Decisions

**Blueprint-first generation:**
AI produces structured JSON (design system, section specs, content strategy) before any HTML is written. This keeps AI responsible for content decisions while deterministic code handles rendering.

**Data-block ID system:**
Every semantic element carries a `data-block="unique-id"` attribute, giving the editing layer a stable handle on the DOM regardless of AI output variation.

**Four-tier fuzzy editing:**
Post-generation edits use Cheerio-based DOM manipulation with CSS/blockId targeting, falling back through exact match → whitespace-tolerant → token-based → Levenshtein fuzzy matching (≥85% threshold). AI can also delete pages via `deleteFile` tool (with guards preventing deletion of `index.html` and referenced components).

**Real-time SSE streaming:**
Build progress, tool activity, and code deltas stream to the client live. Users see their site building section by section, not a spinner.

**Alpine.js interactivity layer:**
All interactive patterns (accordions, carousels, counters, mobile menus, scroll reveals, tabs) use Alpine.js CDN directives with `@alpinejs/collapse` and `@alpinejs/intersect` plugins. Eliminates inline JavaScript, reducing token output by an estimated 30-40% per generation.

**Static site output:**
Every generated site is a self-contained static HTML/CSS/JS bundle deployed to Cloudflare CDN. Zero server-side rendering per request — near-zero hosting cost at scale.

**Provider-agnostic:**
Pipeline supports 10 providers: OpenRouter, Anthropic, Google, OpenAI, DeepInfra, MiniMax, Moonshot, Z.ai, Cerebras, and Together (image generation only via FLUX.1-dev). Model selection is configurable per generation step.

### Current Performance (POC Benchmark)

| Step | Model | Duration | Cost |
|------|-------|----------|------|
| Blueprint generation | Claude Sonnet 4.6 | 44.9s | $0.058 |
| Business research | Claude Haiku 4.5 | 7.1s | ~$0.005 |
| Page generation | Claude Sonnet 4.6 | 363s | $0.533 |
| **Total** | | **~6.1 min** | **~$0.60** |

### Known Performance Issue & Roadmap

**The problem:** Page generation takes 363 seconds because the model streams ~31,000 output tokens (92KB HTML) in a single tool call at ~190 chars/second. This is a mathematical ceiling, not a server bottleneck.

**Solutions (priority order):**

1. **Alpine.js + CSS cleanup** *(COMPLETE)*
   Replaced inline JavaScript (accordions, carousels, counters, scroll observers, tabs, mobile menus) with Alpine.js CDN directives (including `@alpinejs/collapse` and `@alpinejs/intersect` plugins). Integrated into both chat and blueprint prompt pipelines. Expected 30-40% token reduction → ~3.5 minutes generation time. Needs benchmarking to confirm actual savings.

2. **Two-pass generation** *(target architecture)*
   - Pass 1: Generate lightweight HTML skeleton with all sections as semantic containers (~5-10K tokens, ~30s)
   - Pass 2: Fill each section in parallel using the skeleton as shared design context
   Preserves visual coherence while parallelising heavy content generation. Estimated target: 60-90 seconds.

3. **Section-parallel generation** *(long-term ceiling raiser)*
   8 sections × 3 concurrent = ~2 minutes. Requires solving CSS scope conflicts and visual coherence across independently-generated fragments.

4. **Model swap to Haiku** *(test immediately)*
   Haiku is 3-4x faster and 15x cheaper than Sonnet. If output quality is acceptable for HTML generation (blueprint spec already defined), generation time drops to ~90 seconds and cost drops from $0.53 to ~$0.04 per page.

---

## Unit Economics

### Per-User Cost Model (One Site Per Plan)

| Item | Cost |
|------|------|
| Initial generation (1x) | ~$0.60 |
| Regenerations during setup (2-4x avg) | ~$1.20–$2.40 |
| Edits (token-efficient, near-zero cost) | ~$0.05 |
| Hosting (Cloudflare static, per user) | ~$0.50/year |
| Domain infrastructure | ~$1.00/year |
| **Total estimated cost per user/year** | **~$3–5** |
| **Revenue per user/year** | **$59** |
| **Gross margin (est.)** | **~90–95%** |

*Alpine.js optimization is now implemented. Actual token/cost savings need benchmarking. Current unoptimised cost was ~$0.60/generation.*

### Sensitivity
- Generation cost drops 10-15x with Haiku swap → margin improves further
- Primary cost risk: users rage-regenerating due to slow generation time → solved by progress UX and generation time improvements
- Secondary cost risk: power users making hundreds of edits → editBlock is near-zero cost, low risk

---

## Competitive Landscape

| Product | Price | Generation Time | Hosting | Notes |
|---------|-------|-----------------|---------|-------|
| **Ours** | **$59/year** | **~5 min (target)** | **Included** | Single-page focus, real business data |
| Durable | $144–$300/year | ~30 seconds | Included | Simple output, limited customisation |
| Hostinger AI | $36/year | ~1 minute | Included | Budget option, generic output |
| Wix ADI | $192+/year | ~2 minutes | Included | Complex, overwhelming for non-tech |
| Squarespace | $192+/year | ~3 minutes | Included | Beautiful templates, high price |
| Framer | $120–$360/year | ~2 minutes | Included | Design-focused, not beginner-friendly |

### Our Differentiation
- **Price:** Significantly cheaper than every credible competitor
- **Output quality:** Blueprint-driven generation produces more structured, contextually rich sites than prompt-to-template approaches
- **Real business data:** Research pipeline finds and incorporates actual business information — address, phone, reviews — automatically
- **Editing experience:** Natural language editing post-generation, not drag-and-drop

---

## Pricing Strategy

### Launch Pricing

**Single Plan: $59/year**
- One site
- Hosting included
- SSL included
- Subdomain included (e.g., `yourbusiness.ourplatform.com`)
- Custom domain connection (+$X/year or bring your own)
- Unlimited edits
- Regeneration included

### Rationale
- Under $5/month removes the "let me think about it" hesitation for the target audience
- 26% of small businesses without a website cite cost as the barrier — $59/year directly addresses this
- Gross margin remains ~90%+ even at this price point with optimised generation
- One plan, one decision — no tier confusion for non-tech users

### Future Pricing Considerations
- **$79–$89/year** is likely still a no-brainer for the target audience and adds meaningful revenue at scale — worth A/B testing at launch
- **Multi-page tier at $119–$139/year** when blueprint pipeline is production-ready
- **One-time site fee model** ($29 to publish + $29/year to maintain) as an alternative for users averse to subscriptions

---

## Go-To-Market Strategy

### Target Audience
- Local service businesses (restaurants, salons, clinics, tradespeople)
- Freelancers and solopreneurs (photographers, consultants, coaches)
- Early-stage startups needing a fast web presence
- Anyone currently relying solely on social media (21% of small businesses)

### Acquisition Channels
Non-tech users don't read TechCrunch or browse Product Hunt. They find tools through:
- **Google search** — "cheap website builder for my bakery," "easy website for small business"
- **Facebook groups** — small business owner communities, local entrepreneur groups
- **Word of mouth** — the generation experience is shareable; a 5-minute website demo is inherently viral
- **Local business networks** — chambers of commerce, accountants, business associations recommending tools to clients

### Conversion Strategy
- **Free tier (generate, don't publish)** — the output needs to be seen before non-tech users will pay. Let them generate for free, pay to go live.
- **Live demo on homepage** — show the generation happening in real time, not a screenshot
- **Niche examples** — show a dentist site, a photographer site, a restaurant site. Your audience needs to see their own business type represented.

### Trust Signals
- Real generated examples with real business names (with permission)
- "Built in X minutes" timestamps
- Clear "what you get" page — non-tech users buy clarity, not feature lists

---

## Operational Risks & Mitigations

### Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| 6-minute generation time causing user drop-off | High | Alpine.js optimisation (DONE) + real-time progress UX. Needs benchmarking. |
| AI provider outage | Medium | Multi-provider architecture, explicit user-facing degradation message |
| Rage-regeneration inflating costs | Medium | Per-user in-flight generation lock (one active generation per user) |
| Zombie generations burning API spend | Medium | Server-side AbortController registry per conversationId |
| Provider rate limits under load | High | Redis-backed per-provider rate counter wrapping streamText() |

### Business Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Output quality inconsistency at long tail | High | Stress test across diverse business types before launch |
| Competition from Wix/Squarespace AI features | Medium | Price moat + niche positioning |
| Support burden at $59/year price point | Medium | Excellent self-serve docs + AI support layer |
| Domain/DNS confusion for non-tech users | Medium | Guided domain setup flow, near-zero-config experience |

---

## Infrastructure Roadmap

### Pre-Launch (Critical)
1. ~~Alpine.js migration in page generation system prompt~~ *(DONE — integrated into chat + blueprint pipelines)*
2. Per-provider Redis rate limiter (preserves SSE streaming UX)
3. Server-side AbortController registry (stops zombie generations)
4. Per-user in-flight generation lock
5. ~~Postgres `generation_events` table for telemetry~~ *(DONE — `GenerationEvent` model with cost tracking, token counts, tool call counts, repair/fallback flags)*
6. `z.preprocess()` migration for searchIcons tool input

### Implemented (Not Yet Documented Elsewhere)
1. ~~Alpine.js integration~~ (complete — chat + blueprint pipelines)
2. ~~GenerationEvent telemetry~~ (complete — tracks per-generation cost, tokens, duration, tool calls, repair/fallback flags)
3. ~~Together.ai FLUX.1-dev AI image generation~~ (complete — sole image source)
4. ~~Iconify integration~~ (complete — SVG icons from Lucide, Heroicons, Tabler, Phosphor via local database, no external API)
5. ~~Blueprint assets step~~ (complete — generates shared `styles.css` + `scripts.js` for multi-page sites)
6. ~~Temporal context injection~~ (complete — current date/timezone in system prompts for correct copyright years)

### Post-Launch (Scale)
1. Two-pass generation architecture (skeleton + parallel fill)
2. Font allowlist with fallback chains
3. Per-provider/model repair rate monitoring with alerting
4. BullMQ job queue migration (only when horizontal scaling needed)
5. User-facing provider degradation notices (not automatic failover)

---

## Success Metrics

### Launch Targets (First 90 Days)
- 100 paying users
- <10% churn in first month
- Average generation-to-publish rate >60% (users who generate also publish)
- Average support tickets per user <0.5

### Quality Targets
- First-generation satisfaction rate >70% (users don't regenerate)
- Generation completion rate >95% (no failures or timeouts)
- Average generation time <4 minutes (with Alpine.js optimisation)

### Financial Targets
- Break-even at ~500 users (covering infrastructure + AI costs)
- Target 1,000 users by end of year 1

---

## Summary

The product is technically ready to launch with one known performance issue (6-minute generation time) and a clear optimisation path. The market is real, growing, and underserved at this price point. The unit economics work at $59/year with ~90% gross margin. The primary challenge is distribution — getting the product in front of non-tech small business owners who will not find it through traditional tech channels.

The single-page focus is a feature, not a limitation. Ship it, make it exceptionally beautiful and fast, and let real user data determine when and whether to expand the scope.

---

*Document prepared February 2026. Updated February 18, 2026 with codebase audit — Alpine.js integration complete, telemetry system live, Together.ai image generation added, 10 providers supported.*
