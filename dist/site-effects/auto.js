import { mountEffects } from './runtime.js';
const start = () => {
  window.websiteEffects?.destroy();
  window.websiteEffects = mountEffects(document, window.websiteEffectsOptions || {});
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
addEventListener('pagehide', () => window.websiteEffects?.destroy());
addEventListener('pageshow', event => { if (event.persisted) start(); });
