import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSettingsStore } from '../../stores';
import { isMac } from '../../utils/platform';
import './DragBar.css';

const appWindow = getCurrentWindow();

export function DragBar() {
  const { root } = useSettingsStore();
  if (isMac || root.useNativeDecorations) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      e.preventDefault();
      appWindow.startDragging();
    }
  };

  return (
    <div
      className="drag-bar"
      onMouseDown={handleMouseDown}
    />
  );
}
