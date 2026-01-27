/**
 * Centralized platform detection utility.
 */

interface NavigatorUAData {
  platform: string;
}

declare global {
  interface Navigator {
    userAgentData?: NavigatorUAData;
  }
}

export const isMac: boolean = typeof navigator !== 'undefined' && (
  navigator.userAgentData?.platform === 'macOS' ||
  /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
);

export const isWindows: boolean = typeof navigator !== 'undefined' && (
  navigator.userAgentData?.platform === 'Windows' ||
  /Win/.test(navigator.platform)
);

export const isLinux: boolean = typeof navigator !== 'undefined' && (
  navigator.userAgentData?.platform === 'Linux' ||
  /Linux/.test(navigator.platform)
);

export const modifierKey: string = isMac ? '⌘' : 'Ctrl';

export const modifierKeyName: 'Meta' | 'Control' = isMac ? 'Meta' : 'Control';

export function isModifierPressed(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}
