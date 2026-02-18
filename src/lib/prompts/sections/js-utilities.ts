/**
 * Shared JS utilities snippet for single-page chat mode.
 * Provides common interactive patterns via data-attributes so the AI
 * doesn't have to reinvent them from scratch every generation.
 */

// Marker comment used to detect the snippet in existing HTML
export const JS_UTILITIES_MARKER = '/* wb-utils */';

export const JS_UTILITIES_SNIPPET = `<script>${JS_UTILITIES_MARKER}
document.addEventListener('DOMContentLoaded',()=>{
/* Mobile nav toggle */
const mt=document.querySelector('[data-menu-toggle]'),mn=document.querySelector('[data-menu]');
if(mt&&mn){const cl=()=>{mn.classList.add('hidden');mt.setAttribute('aria-expanded','false');document.body.style.overflow=''};
mt.addEventListener('click',()=>{const open=mn.classList.toggle('hidden')===false;mt.setAttribute('aria-expanded',String(open));
document.body.style.overflow=open?'hidden':''});document.addEventListener('keydown',e=>{if(e.key==='Escape')cl()});
document.addEventListener('click',e=>{if(!mn.contains(e.target)&&!mt.contains(e.target))cl()});
window.addEventListener('resize',()=>{if(window.innerWidth>=768)cl()})}

/* Scroll reveal */
if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
const ro=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('active');ro.unobserve(e.target)}})},{threshold:0.15});
document.querySelectorAll('[data-reveal]').forEach((el,i)=>{el.style.transitionDelay=(el.dataset.revealDelay||(i%5)*0.1)+'s';ro.observe(el)})}

/* Smooth scroll */
document.querySelectorAll('a[href^="#"]').forEach(a=>{a.addEventListener('click',e=>{const t=document.querySelector(a.getAttribute('href'));
if(t){e.preventDefault();const hdr=document.querySelector('header,nav,[data-block="header"],[data-block="nav"]');
const off=hdr?hdr.offsetHeight:0;window.scrollTo({top:t.offsetTop-off,behavior:'smooth'})}})});

/* Accordion */
document.querySelectorAll('[data-accordion-trigger]').forEach(tr=>{tr.addEventListener('click',()=>{
const ct=tr.nextElementSibling||document.querySelector(tr.dataset.accordionTrigger);if(!ct)return;
const open=ct.style.maxHeight&&ct.style.maxHeight!=='0px';ct.style.maxHeight=open?'0px':ct.scrollHeight+'px';
ct.style.overflow='hidden';ct.style.transition='max-height 0.3s ease';tr.setAttribute('aria-expanded',String(!open))})});

/* Counter animation */
const co=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){const el=e.target,to=+el.dataset.countTo,
du=+el.dataset.countDuration||2000,st=performance.now(),fmt=el.dataset.countPrefix||'',sfx=el.dataset.countSuffix||'';
(function step(now){const p=Math.min((now-st)/du,1),ease=1-Math.pow(1-p,4),v=Math.round(ease*to);
el.textContent=fmt+v.toLocaleString()+sfx;if(p<1)requestAnimationFrame(step)})(st);co.unobserve(el)}})},{threshold:0.3});
document.querySelectorAll('[data-count-to]').forEach(el=>{el.textContent='0';co.observe(el)});

/* Carousel */
document.querySelectorAll('[data-carousel]').forEach(c=>{const track=c.querySelector('[data-carousel-track]');
if(!track)return;const prev=c.querySelector('[data-carousel-prev]'),next=c.querySelector('[data-carousel-next]');
const items=track.children,gap=parseInt(getComputedStyle(track).gap)||0;let idx=0;
const go=i=>{idx=Math.max(0,Math.min(i,items.length-1));track.scrollTo({left:items[idx].offsetLeft-track.offsetLeft,behavior:'smooth'})};
if(prev)prev.addEventListener('click',()=>go(idx-1));if(next)next.addEventListener('click',()=>go(idx+1));
let sx,dx;track.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;dx=0},{passive:true});
track.addEventListener('touchmove',e=>{dx=sx-e.touches[0].clientX},{passive:true});
track.addEventListener('touchend',()=>{if(Math.abs(dx)>50)go(idx+(dx>0?1:-1))});
const iv=+c.dataset.carouselInterval;if(iv>0)setInterval(()=>go((idx+1)%items.length),iv)});
});
</script>`;

export const JS_UTILITIES_INSTRUCTION = `Shared JS utilities:
Include the <script> from <shared_js_utilities> verbatim before </body>. It provides these behaviors via data-attributes — do NOT write custom JS for any of these patterns:

- Mobile nav: Add \`data-menu-toggle\` to the hamburger button and \`data-menu\` to the nav links container. The menu starts with class "hidden" and toggles on click. Handles Escape, outside click, resize close, body scroll lock, and aria-expanded.
- Scroll reveal: Add \`data-reveal\` to any element that should animate in on scroll. Pair with CSS: \`[data-reveal]{opacity:0;transform:translateY(20px);transition:opacity 0.6s,transform 0.6s}[data-reveal].active{opacity:1;transform:none}\`. Optional \`data-reveal-delay="0.2s"\` for stagger. Respects prefers-reduced-motion.
- Smooth scroll: All \`a[href^="#"]\` links automatically smooth-scroll, accounting for fixed header height. No attributes needed.
- Accordion: Add \`data-accordion-trigger\` to the toggle button. The next sibling element becomes the content panel — give it \`max-height:0;overflow:hidden;transition:max-height 0.3s ease\` initially. Sets aria-expanded.
- Counter: Add \`data-count-to="1500"\` to a number element. Animates from 0 on scroll into view with easeOut. Optional \`data-count-duration="2000"\` (ms), \`data-count-prefix="$"\`, \`data-count-suffix="+"\`.
- Carousel: Wrap in \`data-carousel\`, add \`data-carousel-track\` to the scrolling container, \`data-carousel-prev\`/\`data-carousel-next\` to buttons. Supports touch swipe. Optional \`data-carousel-interval="5000"\` for auto-play (ms).`;
