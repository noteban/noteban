import { getCurrentWindow } from '@tauri-apps/api/window';

const APP_NAME = 'Noteban';

/**
 * Sets the window title based on the current profile.
 * Format: "ProfileName - Noteban" if multiple profiles exist
 * Format: "Noteban" if only one profile exists
 */
export async function setWindowTitle(
  profileName: string | null,
  hasMultipleProfiles: boolean
): Promise<void> {
  try {
    const appWindow = getCurrentWindow();
    const title =
      hasMultipleProfiles && profileName
        ? `${profileName} - ${APP_NAME}`
        : APP_NAME;
    await appWindow.setTitle(title);
  } catch (error) {
    console.error('Failed to set window title:', error);
  }
}
