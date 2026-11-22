const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

// All layers use the photograph's coordinate system. Only their opacity changes.
const STARTUP = [
  { name: 'neon', delay: 0, duration: 1200, values: [0, .62, .34, .72, 0], offsets: [0, .17, .29, .58, 1] },
  { name: 'room', delay: 100, duration: 950, values: [0, .08, .48, 1], offsets: [0, .18, .55, 1] },
  { name: 'monitor-back', delay: 1100, duration: 800, values: [1, .91, .95, .28, 0], offsets: [0, .18, .3, .67, 1] },
  { name: 'wake-back', delay: 1110, duration: 830, values: [0, .16, .04, 0], offsets: [0, .2, .48, 1] },
  { name: 'bloom-back', delay: 1170, duration: 1000, values: [0, .2, .09, 0], offsets: [0, .42, .67, 1] },
  { name: 'monitor-front', delay: 1370, duration: 900, values: [1, .86, .92, .2, 0], offsets: [0, .18, .3, .68, 1] },
  { name: 'wake-front', delay: 1380, duration: 930, values: [0, .2, .05, 0], offsets: [0, .19, .48, 1] },
  { name: 'bloom-front', delay: 1450, duration: 1200, values: [0, .24, .1, 0], offsets: [0, .4, .66, 1] },
  { name: 'keyboard-back', delay: 2120, duration: 400, values: [1, .5, .58, 0], offsets: [0, .35, .49, 1] },
  { name: 'keyboard-front', delay: 2240, duration: 480, values: [1, .42, .5, 0], offsets: [0, .36, .5, 1] },
  { name: 'mouse-back', delay: 2430, duration: 330, values: [1, 0] },
  { name: 'mouse-front', delay: 2500, duration: 380, values: [1, 0] },
  { name: 'ambient', delay: 200, duration: 1000, values: [0, .11] },
];

export function mountHeroPower(hero, button) {
  const layers = new Map([...hero.querySelectorAll('[data-power-layer]')].map(node => [node.dataset.powerLayer, node]));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  const sceneImage = new Image();
  let desiredOn = false;
  let initialPending = true;
  let imageReady = false;
  let bootTimer;
  let generation = 0;
  let suspended = false;
  let disposed = false;

  function cancelAnimations() {
    // Read every current value before cancelling, so fast toggles retarget without a flash.
    const current = [...layers.values()].map(node => [node, getComputedStyle(node).opacity]);
    generation++;
    animations.forEach(animation => animation.cancel());
    animations.clear();
    current.forEach(([node, opacity]) => { node.style.opacity = opacity; });
  }

  function stableOpacity(name, on) {
    if (name === 'room') return on ? 1 : 0;
    if (name === 'ambient') return on ? .11 : 0;
    return /^(monitor|keyboard|mouse)-/.test(name) ? (on ? 0 : 1) : 0;
  }

  function updateControl() {
    button.setAttribute('aria-pressed', String(desiredOn));
    const label = desiredOn ? 'Выключить свет и технику' : 'Включить свет и технику';
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  function settle() {
    layers.forEach((node, name) => { node.style.opacity = String(stableOpacity(name, desiredOn)); });
    hero.dataset.powerState = desiredOn ? 'on' : 'off';
  }

  function animateLayer(name, values, duration, delay, offsets, run) {
    const node = layers.get(name);
    if (!node) return Promise.resolve();
    const start = Number.parseFloat(node.style.opacity || getComputedStyle(node).opacity);
    const frames = values.map((opacity, index) => ({
      opacity: index === 0 ? start : opacity,
      ...(offsets ? { offset: offsets[index] } : {}),
    }));
    const animation = node.animate(frames, { duration, delay, easing: EASE_OUT, fill: 'both' });
    animations.add(animation);
    return animation.finished.then(() => {
      if (run !== generation || disposed) return;
      node.style.opacity = String(values.at(-1));
      animation.cancel();
      animations.delete(animation);
    }).catch(() => { /* A new power request owns the layers after cancellation. */ });
  }

  function setPower(on, { immediate = false } = {}) {
    if (disposed) return;
    const fullyOff = hero.dataset.powerState === 'off';
    clearTimeout(bootTimer);
    cancelAnimations();
    desiredOn = on;
    updateControl();
    if (immediate || reducedMotion.matches || !hero.animate || suspended || document.hidden) {
      settle();
      return;
    }
    const run = generation;
    hero.dataset.powerState = on ? 'starting' : 'stopping';
    // A complete cold boot has a prewarm. Interrupted toggles head directly to the new state.
    const tasks = on && fullyOff
      ? STARTUP.map(({ name, values, duration, delay, offsets }) => animateLayer(name, values, duration, delay, offsets, run))
      : [...layers].map(([name]) => animateLayer(name, [0, stableOpacity(name, on)], on ? 420 : 260, 0, undefined, run));
    Promise.all(tasks).then(() => { if (run === generation && !disposed) settle(); });
  }

  function scheduleBoot() {
    clearTimeout(bootTimer);
    if (!initialPending || !imageReady || disposed || suspended || document.hidden) return;
    bootTimer = setTimeout(() => {
      initialPending = false;
      setPower(true);
    }, 1000);
  }

  function sceneReady() {
    if (imageReady || disposed) return;
    imageReady = true;
    scheduleBoot();
  }

  function toggle() {
    initialPending = false;
    setPower(!desiredOn);
  }

  function onVisibilityChange() {
    if (document.hidden) {
      clearTimeout(bootTimer);
      if (!initialPending) setPower(desiredOn, { immediate: true });
    } else scheduleBoot();
  }

  function onMotionChange() {
    if (reducedMotion.matches) setPower(desiredOn, { immediate: true });
    if (initialPending) scheduleBoot();
  }

  function onPageHide(event) {
    if (!event.persisted) { destroy(); return; }
    suspended = true;
    clearTimeout(bootTimer);
    cancelAnimations();
    settle();
  }

  function onPageShow(event) {
    if (!event.persisted || disposed) return;
    suspended = false;
    // Preserve a visitor's manual off state when navigating back to the page.
    settle();
    scheduleBoot();
  }

  function destroy() {
    if (disposed) return;
    clearTimeout(bootTimer);
    cancelAnimations();
    disposed = true;
    button.removeEventListener('click', toggle);
    sceneImage.removeEventListener('load', sceneReady);
    sceneImage.removeEventListener('error', sceneReady);
    reducedMotion.removeEventListener('change', onMotionChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
  }

  settle();
  updateControl();
  button.addEventListener('click', toggle);
  reducedMotion.addEventListener('change', onMotionChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  sceneImage.addEventListener('load', sceneReady, { once: true });
  sceneImage.addEventListener('error', sceneReady, { once: true });
  sceneImage.src = new URL('./hero.webp', import.meta.url).href;
  if (sceneImage.complete) sceneReady();
  return { setPower, destroy };
}
