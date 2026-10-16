import { App } from './ui/app.js';
import { SIMULATIONS } from './sims/index.js';

window.app = new App(document.body, SIMULATIONS);

// Installable / offline (PWA). Service workers need a secure context (https or localhost).
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline mode unavailable', err));
}
