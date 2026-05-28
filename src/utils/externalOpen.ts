import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function parseExternalUrl(url: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid external URL');
  }

  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`External URL protocol is not allowed: ${parsed.protocol}`);
  }

  return parsed;
}

export async function openExternalUrl(url: string): Promise<void> {
  const parsed = parseExternalUrl(url);
  const normalizedUrl = parsed.toString();

  if (isTauri()) {
    await openUrl(normalizedUrl);
    return;
  }

  const opened = window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    throw new Error('Unable to open external URL');
  }
}
