import { getCurrentWindow } from '@tauri-apps/api/window';

const APP_NAME = 'Notes Kanban';

/**
 * Sets the window title based on the current profile.
 * Format: "ProfileName - Notes Kanban" if multiple profiles exist
 * Format: "Notes Kanban" if only one profile exists
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
