/**
 * Pure text/classification helpers for the title-screen PWA status line,
 * install help and update notice (AC4/AC6/AC9), kept separate from
 * `pwa.ts`'s DOM and service-worker wiring so they are unit-testable.
 */

export type OfflineReadiness = 'unsupported' | 'preparing' | 'ready' | 'error';

const OFFLINE_STATUS_TEXT: Record<OfflineReadiness, string> = {
  unsupported: 'Offline play is not available in this browser.',
  preparing: 'Preparing this device for offline play…',
  ready: 'Ready to play offline after this visit.',
  error: 'Offline preparation failed; you can still play online.',
};

/** The quiet title-screen readiness line (AC5/AC9). Never claims readiness from mere registration. */
export function describeOfflineStatus(state: OfflineReadiness): string {
  return OFFLINE_STATUS_TEXT[state];
}

/**
 * The native waiting lifecycle is preferred (D020/AC6): a controlled client
 * never force-reloads. This is the passive notice shown once another,
 * complete version is waiting to take over.
 */
export function describeUpdateStatus(waiting: boolean): string | null {
  if (!waiting) {
    return null;
  }
  return 'A new version is ready. Close every Hac-Man window and reopen it to update.';
}

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'unknown';

/** Best-effort platform classification from the user agent, for fallback install instructions only. */
export function detectInstallPlatform(userAgent: string): InstallPlatform {
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return 'ios';
  }
  if (/android/i.test(userAgent)) {
    return 'android';
  }
  if (/windows|macintosh|linux/i.test(userAgent)) {
    return 'desktop';
  }
  return 'unknown';
}

const INSTALL_HELP_TEXT: Record<InstallPlatform, string> = {
  ios: 'On iPhone or iPad, open this page in Safari, tap Share, then "Add to Home Screen".',
  android: 'On Android, open the browser menu and choose "Install app" or "Add to Home screen".',
  desktop: 'On desktop Chrome or Edge, use the install icon in the address bar, or the browser menu\'s "Install Hac-Man" entry.',
  unknown: 'Look for an "Install" or "Add to Home Screen" option in this browser\'s menu.',
};

/**
 * Manual install instructions shown for the browsers `beforeinstallprompt`
 * does not fire in (notably iOS Safari), or as always-available fallback
 * help. Never invents a universal install dialog; this is descriptive text
 * only, and the caller decides whether to also show the automatic button.
 */
export function describeInstallHelp(platform: InstallPlatform): string {
  return INSTALL_HELP_TEXT[platform];
}

/** True once the app is already running as an installed/standalone window; install UI should then hide. */
export function isStandaloneDisplay(matchesStandaloneMedia: boolean, iosStandalone: boolean | undefined): boolean {
  return matchesStandaloneMedia || iosStandalone === true;
}
