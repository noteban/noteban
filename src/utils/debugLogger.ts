// Debug logger that writes to a log file when enabled
import { appDataDir, join } from '@tauri-apps/api/path';
import { mkdir, writeTextFile } from '@tauri-apps/plugin-fs';
import { useSettingsStore } from '../stores/settingsStore';

type LogLevel = 'LOG' | 'WARN' | 'ERROR' | 'DEBUG';

let logFilePath: string | null = null;
let initPromise: Promise<void> | null = null;
let hasWrittenStartupLog = false;

async function initLogFile(): Promise<void> {
  if (logFilePath) return;

  try {
    const dataDir = await appDataDir();
    const logsDir = await join(dataDir, 'logs');

    // Ensure logs directory exists
    try {
      await mkdir(logsDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    // Create log file with date-based name
    const date = new Date().toISOString().split('T')[0];
    logFilePath = await join(logsDir, `debug-${date}.log`);
  } catch (error) {
    console.error('Failed to initialize log file:', error);
  }
}

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = initLogFile();
  }
  return initPromise;
}

function isDebugEnabled(): boolean {
  try {
    return useSettingsStore.getState().root.enableDebugLogging;
  } catch {
    return false;
  }
}

async function writeToLog(level: LogLevel, args: unknown[]): Promise<void> {
  if (!isDebugEnabled()) return;

  await ensureInit();
  if (!logFilePath) return;

  try {
    const timestamp = new Date().toISOString();
    const message = args
      .map((arg) =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      )
      .join(' ');

    const logLine = `[${timestamp}] [${level}] ${message}\n`;

    await writeTextFile(logFilePath, logLine, { append: true });
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

export const debugLog = {
  log: (...args: unknown[]) => {
    writeToLog('LOG', args);
  },
  warn: (...args: unknown[]) => {
    writeToLog('WARN', args);
  },
  error: (...args: unknown[]) => {
    // Errors always go to console, but also to file if enabled
    console.error(...args);
    writeToLog('ERROR', args);
  },
  debug: (...args: unknown[]) => {
    writeToLog('DEBUG', args);
  },
};

// Export function to get the current log file path (for UI display)
export async function getLogFilePath(): Promise<string | null> {
  await ensureInit();
  return logFilePath;
}

// Initialize logging when debug is enabled - writes startup entry
export async function initDebugLogging(): Promise<void> {
  if (!isDebugEnabled() || hasWrittenStartupLog) return;

  hasWrittenStartupLog = true;
  await ensureInit();

  if (logFilePath) {
    const timestamp = new Date().toISOString();
    const startupMessage = `[${timestamp}] [LOG] === Debug logging started ===\n`;
    try {
      await writeTextFile(logFilePath, startupMessage, { append: true });
    } catch (error) {
      console.error('Failed to write startup log:', error);
    }
  }
}
