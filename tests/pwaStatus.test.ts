import { describe, expect, it } from 'vitest';
import {
  describeInstallHelp,
  describeOfflineStatus,
  describeUpdateStatus,
  detectInstallPlatform,
  isStandaloneDisplay,
} from '../src/app/pwaStatus.js';

describe('describeOfflineStatus', () => {
  it('gives a distinct, non-empty line for every readiness state', () => {
    const states = ['unsupported', 'preparing', 'ready', 'error'] as const;
    const lines = states.map(describeOfflineStatus);
    expect(new Set(lines).size).toBe(states.length);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('never claims offline readiness for a state other than ready', () => {
    for (const state of ['unsupported', 'preparing', 'error'] as const) {
      expect(describeOfflineStatus(state).toLowerCase()).not.toContain('ready to play offline');
    }
  });
});

describe('describeUpdateStatus', () => {
  it('is null when nothing is waiting', () => {
    expect(describeUpdateStatus(false)).toBeNull();
  });

  it('explains the native close-and-reopen path when a version is waiting', () => {
    const message = describeUpdateStatus(true);
    expect(message).toMatch(/close/i);
    expect(message).toMatch(/reopen/i);
    // Never promises a forced or automatic reload.
    expect(message?.toLowerCase()).not.toContain('automatically');
  });
});

describe('detectInstallPlatform', () => {
  it('recognises iOS user agents', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios');
    expect(detectInstallPlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('ios');
  });

  it('recognises Android user agents', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android');
  });

  it('recognises common desktop user agents', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
    expect(detectInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('desktop');
  });

  it('falls back to unknown for an unrecognised agent', () => {
    expect(detectInstallPlatform('SomeOtherBrowser/1.0')).toBe('unknown');
  });
});

describe('describeInstallHelp', () => {
  it('gives distinct help text per platform', () => {
    const platforms = ['ios', 'android', 'desktop', 'unknown'] as const;
    const texts = platforms.map(describeInstallHelp);
    expect(new Set(texts).size).toBe(platforms.length);
  });
});

describe('isStandaloneDisplay', () => {
  it('is true when the display-mode media query matches', () => {
    expect(isStandaloneDisplay(true, undefined)).toBe(true);
  });

  it('is true when iOS reports navigator.standalone', () => {
    expect(isStandaloneDisplay(false, true)).toBe(true);
  });

  it('is false when neither signal is present', () => {
    expect(isStandaloneDisplay(false, false)).toBe(false);
    expect(isStandaloneDisplay(false, undefined)).toBe(false);
  });
});
