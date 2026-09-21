import {
  describeInstallHelp,
  describeOfflineStatus,
  describeUpdateStatus,
  detectInstallPlatform,
  isStandaloneDisplay,
  type OfflineReadiness,
} from './pwaStatus.js';

export interface PwaElements {
  readonly offlineStatus: HTMLElement;
  readonly updateStatus: HTMLElement;
  readonly installButton: HTMLButtonElement;
  readonly installHelpText: HTMLElement;
}

/** Chrome/Edge/Android's install prompt event; not in lib.dom.d.ts. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

function setOfflineStatus(element: HTMLElement, state: OfflineReadiness): void {
  setText(element, describeOfflineStatus(state));
}

function setUpdateStatus(element: HTMLElement, waiting: boolean): void {
  const message = describeUpdateStatus(waiting);
  element.hidden = message === null;
  if (message !== null) {
    setText(element, message);
  }
}

/**
 * Wires the title-screen install button/help text and, only when `enabled`,
 * registers the production service worker and reflects its lifecycle as a
 * quiet offline-readiness line plus a passive update notice (AC4/AC6/AC9).
 *
 * `enabled` must be false for the dev server and the fixture build: the
 * service worker and its offline claims apply to ordinary production output
 * only, and a fixture/dev origin must never register it (D020, brief item 7).
 */
export function initPwa(elements: PwaElements, enabled: boolean): void {
  const nav = navigator as Navigator & { standalone?: boolean };
  const platform = detectInstallPlatform(nav.userAgent);
  setText(elements.installHelpText, describeInstallHelp(platform));

  const standaloneMediaMatches =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  const standalone = isStandaloneDisplay(standaloneMediaMatches, nav.standalone);

  let deferredPrompt: BeforeInstallPromptEvent | null = null;

  if (!standalone) {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event as BeforeInstallPromptEvent;
      elements.installButton.hidden = false;
    });
  }

  elements.installButton.addEventListener('click', () => {
    const prompt = deferredPrompt;
    if (!prompt) {
      return;
    }
    deferredPrompt = null;
    elements.installButton.hidden = true;
    void prompt.prompt().then(() => prompt.userChoice);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    elements.installButton.hidden = true;
  });

  if (!enabled) {
    setOfflineStatus(elements.offlineStatus, 'unsupported');
    return;
  }
  if (!('serviceWorker' in navigator)) {
    setOfflineStatus(elements.offlineStatus, 'unsupported');
    return;
  }

  setOfflineStatus(elements.offlineStatus, 'preparing');

  // Once a version has ever finished installing, offline play already works.
  // A later *background* update attempt that fails (a flaky deploy, a
  // dropped connection) must not retract that: it only means no new version
  // is available yet, not that the app stopped working offline.
  let everReady = false;

  const trackInstalling = (worker: ServiceWorker | null): void => {
    if (!worker) {
      return;
    }
    if (!everReady) {
      setOfflineStatus(elements.offlineStatus, 'preparing');
    }
    worker.addEventListener('statechange', () => {
      switch (worker.state) {
        case 'installed':
          // A controller already exists: this install is a later version
          // waiting behind it, not the first-ever install (native lifecycle).
          if (navigator.serviceWorker.controller) {
            setUpdateStatus(elements.updateStatus, true);
          } else {
            everReady = true;
            setOfflineStatus(elements.offlineStatus, 'ready');
          }
          break;
        case 'activated':
          everReady = true;
          setOfflineStatus(elements.offlineStatus, 'ready');
          setUpdateStatus(elements.updateStatus, false);
          break;
        case 'redundant':
          if (!everReady) {
            setOfflineStatus(elements.offlineStatus, 'error');
          }
          break;
        default:
          break;
      }
    });
  };

  navigator.serviceWorker
    .register('./sw.js')
    .then((registration) => {
      if (registration.installing) {
        trackInstalling(registration.installing);
      } else if (registration.waiting) {
        everReady = true;
        setOfflineStatus(elements.offlineStatus, 'ready');
        setUpdateStatus(elements.updateStatus, true);
      } else if (registration.active) {
        everReady = true;
        setOfflineStatus(elements.offlineStatus, 'ready');
      }
      registration.addEventListener('updatefound', () => trackInstalling(registration.installing));
    })
    .catch(() => {
      // Worker/CacheStorage failure must leave online play functional and
      // must never falsely claim offline readiness (brief item 5).
      if (!everReady) {
        setOfflineStatus(elements.offlineStatus, 'error');
      }
    });
}
