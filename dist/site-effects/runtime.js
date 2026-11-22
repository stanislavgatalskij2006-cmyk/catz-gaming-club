/** Local Lenis + GSAP + Vanta integration. No build step or CDN. */
const resources = new Map();
const controllers = new WeakMap();
const supported = new Set(['birds', 'cells', 'clouds', 'clouds2', 'dots', 'fog', 'globe', 'halo', 'net', 'rings', 'ripple', 'topology', 'trunk', 'waves']);
const p5Effects = new Set(['topology', 'trunk']);
const base = new URL('./', import.meta.url);

function stylesheet(path) {
  const href = new URL(path, base).href;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(el => el.href === href)) return;
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
}
function script(path, available) {
  if (available()) return Promise.resolve();
  const src = new URL(path, base).href;
  if (!resources.has(src)) resources.set(src, new Promise((resolve, reject) => {
    const el = Object.assign(document.createElement('script'), { src, async: true });
    const timer = setTimeout(fail, 15000);
    function fail() {
      clearTimeout(timer); el.remove(); resources.delete(src);
      reject(new Error(`Could not load ${path}`));
    }
    el.onerror = fail;
    el.onload = () => { clearTimeout(timer); available() ? resolve() : fail(); };
    document.head.append(el);
  }));
  return resources.get(src);
}
function select(root, selector) {
  return [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
}
function bounded(value, fallback, min, max) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
function restoreStyle(el, value) {
  if (value === null) el.removeAttribute('style');
  else el.setAttribute('style', value);
}
function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

/** Returns immediately. Await .ready; call .refresh() after new DOM and .destroy() on unmount. */
export function mountEffects(root = typeof document === 'undefined' ? null : document, options = {}) {
  if (typeof window === 'undefined') return { ready: Promise.resolve(), refresh() {}, destroy() {} };
  controllers.get(root)?.destroy();
  stylesheet('effects.css');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 767px), (pointer: coarse)');
  const cleanups = [];
  const errors = [];
  let disposed = false;
  let generation = 0;
  let currentReady = Promise.resolve();
  function report(error) {
    errors.push(error.message);
    if (options.onError) options.onError(error);
    else console.warn('[Website Effects]', error.message);
  }
  function cleanup() {
    while (cleanups.length) {
      try { cleanups.pop()(); } catch (error) { report(error); }
    }
  }
  async function initialize(id) {
    const active = () => !disposed && id === generation;
    if (reduced.matches || options.enabled === false) return;
    const animated = select(root, '[data-reveal], [data-stagger], [data-parallax]');
    const smooth = options.smooth !== false && root === document && !mobile.matches;
    if (smooth || animated.length) {
      try {
        await script('vendor/gsap.min.js', () => !!window.gsap);
        await script('vendor/ScrollTrigger.min.js', () => !!window.ScrollTrigger);
        if (!active()) return;
        const { gsap, ScrollTrigger } = window;
        gsap.registerPlugin(ScrollTrigger);
        const context = gsap.context(() => {});
        cleanups.push(() => context.revert());
        context.add(() => {
          for (const el of animated) {
            if (el.hasAttribute('data-parallax')) {
              const distance = bounded(el.dataset.parallax, 20, -80, 80);
              gsap.fromTo(el, { y: -distance }, {
                y: distance, ease: 'none',
                scrollTrigger: { trigger: el.parentElement || el, start: 'top bottom', end: 'bottom top', scrub: 0.7 },
              });
            } else {
              const targets = el.hasAttribute('data-stagger') ? [...el.children] : [el];
              gsap.fromTo(targets, { opacity: 0, y: 22 }, {
                opacity: 1, y: 0, duration: bounded(el.dataset.duration, 0.65, 0.15, 1.5), ease: 'power2.out',
                delay: bounded(el.dataset.delay, 0, 0, 0.6),
                stagger: Math.min(0.07, 0.55 / Math.max(targets.length, 1)),
                scrollTrigger: { trigger: el, start: 'top 94%', once: true },
              });
            }
          }
        });
        if (smooth) {
          await script('vendor/lenis.min.js', () => !!window.Lenis);
          if (!active()) return;
          const lenis = new window.Lenis({ anchors: true, allowNestedScroll: true,
            smoothWheel: true, syncTouch: false, ...(options.lenis || {}), autoRaf: false });
          const tick = time => lenis.raf(time * 1000);
          lenis.on('scroll', ScrollTrigger.update);
          gsap.ticker.add(tick);
          cleanups.push(() => {
            gsap.ticker.remove(tick);
            lenis.off('scroll', ScrollTrigger.update);
            lenis.destroy();
          });
        }
        if (active()) ScrollTrigger.refresh();
      } catch (error) { if (active()) { cleanup(); report(error); } }
    }
    if (!active() || options.background === false ||
        (mobile.matches && options.backgroundOnMobile !== true) || navigator.connection?.saveData) return;
    const backgrounds = select(root, '[data-vanta]').slice(0, options.maxBackgrounds ?? 1);
    if (!backgrounds.length || !hasWebGL()) return;
    const instances = new Map();
    const pending = new Set();
    const usable = () => active() && !document.hidden;
    function remove(el) {
      const record = instances.get(el);
      if (!record) return;
      instances.delete(el);
      record.instance.destroy();
      record.renderer?.dispose?.();
      record.renderer?.forceContextLoss?.();
      restoreStyle(el, record.style);
    }
    async function start(el) {
      if (!usable() || instances.has(el) || pending.has(el)) return;
      pending.add(el);
      try {
        const name = el.dataset.vanta.toLowerCase() || 'net';
        if (!supported.has(name)) throw new Error(`Unknown Vanta effect: ${name}`);
        const useP5 = p5Effects.has(name);
        if (!useP5 && window.THREE && window.THREE.REVISION !== '134')
          throw new Error('Vanta needs Three r134; an existing different global Three was preserved.');
        if (useP5) await script('vendor/p5.min.js', () => !!window.p5);
        else await script('vendor/three.r134.min.js', () => !!window.THREE);
        await script(`vendor/vanta.${name}.min.js`, () => !!window.VANTA?.[name.toUpperCase()]);
        const rect = el.getBoundingClientRect();
        if (!usable() || !el.isConnected || rect.bottom <= 0 || rect.top >= innerHeight) return;
        const settings = JSON.parse(el.dataset.vantaOptions || '{}');
        const style = el.getAttribute('style');
        const instance = window.VANTA[name.toUpperCase()]({
          backgroundColor: 0x10283e, color: 0x59a9d8, points: 7, maxDistance: 19, spacing: 18,
          mouseControls: true, touchControls: false, gyroControls: false, scale: 1.5, scaleMobile: 2,
          ...(name === 'clouds2' ? { texturePath: new URL('textures/noise.png', base).href } : {}),
          ...settings, el, ...(useP5 ? { p5: window.p5 } : { THREE: window.THREE }),
        });
        // Vanta's p5 base also creates an unused WebGL canvas when global THREE exists.
        if (useP5 && instance.p5canvas && instance.renderer) {
          instance.renderer.domElement.remove();
          instance.renderer.dispose();
          instance.renderer.forceContextLoss();
          instance.renderer = null;
          instance.scene = null;
        }
        const canvas = el.querySelector('canvas');
        if (canvas) { canvas.setAttribute('aria-hidden', 'true'); canvas.style.pointerEvents = 'none'; }
        instances.set(el, { instance, style, renderer: instance.renderer });
      } catch (error) { if (active()) report(error); }
      finally { pending.delete(el); }
    }
    function visibility() {
      if (document.hidden) backgrounds.forEach(remove);
      else backgrounds.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight) void start(el);
      });
    }
    const observer = new IntersectionObserver(entries => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) void start(target);
        else remove(target);
      }
    });
    backgrounds.forEach(el => observer.observe(el));
    document.addEventListener('visibilitychange', visibility);
    cleanups.push(() => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      backgrounds.forEach(remove);
    });
  }
  function refresh() {
    if (disposed) return Promise.resolve();
    const id = ++generation;
    cleanup();
    currentReady = initialize(id).catch(error => { if (!disposed && id === generation) report(error); });
    return currentReady;
  }
  function destroy() {
    if (disposed) return;
    disposed = true; generation++; cleanup();
    reduced.removeEventListener('change', refresh);
    mobile.removeEventListener('change', refresh);
    if (controllers.get(root) === controller) controllers.delete(root);
  }
  const controller = { get ready() { return currentReady; }, get errors() { return [...errors]; }, refresh, destroy };
  controllers.set(root, controller);
  reduced.addEventListener('change', refresh);
  mobile.addEventListener('change', refresh);
  refresh();
  return controller;
}
