import { useCallback, useEffect, useRef, useState } from 'react';
import type { PieMenuOrigin, UsePieMenuOptions, UsePieMenuReturn } from './types';

const DEFAULT_LONG_PRESS_MS = 350;
const DEFAULT_MOVE_TOLERANCE = 8;

export function usePieMenu(options: UsePieMenuOptions = {}): UsePieMenuReturn {
  const {
    longPressMs = DEFAULT_LONG_PRESS_MS,
    movementTolerance = DEFAULT_MOVE_TOLERANCE,
    enableContextMenu = true,
    enableClick = false,
    enableLongPress = true,
    haptic = true,
  } = options;

  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<PieMenuOrigin>({ x: 0, y: 0 });

  const longPressTimer = useRef<number | null>(null);
  const longPressOpenedPointer = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const contextMenuOpenTimer = useRef<number | null>(null);
  const contextMenuReleaseHandler = useRef<(() => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const clearContextMenuOpen = useCallback(() => {
    if (contextMenuOpenTimer.current !== null) {
      window.clearTimeout(contextMenuOpenTimer.current);
      contextMenuOpenTimer.current = null;
    }
    if (contextMenuReleaseHandler.current) {
      window.removeEventListener('pointerup', contextMenuReleaseHandler.current, true);
      contextMenuReleaseHandler.current = null;
    }
  }, []);

  const openAt = useCallback(
    (next: PieMenuOrigin) => {
      setOrigin(next);
      setOpen(true);
      if (haptic && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate?.(8);
      }
    },
    [haptic],
  );

  const close = useCallback(() => {
    clearTimer();
    clearContextMenuOpen();
    setOpen(false);
  }, [clearContextMenuOpen, clearTimer]);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!enableContextMenu) return;
      e.preventDefault();
      clearTimer();
      clearContextMenuOpen();

      const nextOrigin = { x: e.clientX, y: e.clientY };
      const openAfterRelease = () => {
        clearContextMenuOpen();
        openAt(nextOrigin);
      };

      if (e.buttons !== 0) {
        contextMenuReleaseHandler.current = openAfterRelease;
        window.addEventListener('pointerup', openAfterRelease, true);
        contextMenuOpenTimer.current = window.setTimeout(openAfterRelease, 700);
        return;
      }

      contextMenuOpenTimer.current = window.setTimeout(openAfterRelease, 0);
    },
    [clearContextMenuOpen, clearTimer, enableContextMenu, openAt],
  );

  useEffect(() => {
    return () => {
      clearTimer();
      clearContextMenuOpen();
    };
  }, [clearContextMenuOpen, clearTimer]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const isPrimaryMouse = e.pointerType === 'mouse' && e.button === 0;
      const supportsLongPress =
        isPrimaryMouse || e.pointerType === 'touch' || e.pointerType === 'pen';

      if (!supportsLongPress) return;
      if (!enableLongPress && !(enableClick && isPrimaryMouse)) return;

      pointerStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      longPressOpenedPointer.current = null;
      clearTimer();
      if (!enableLongPress) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const pointerId = e.pointerId;
      longPressTimer.current = window.setTimeout(() => {
        longPressTimer.current = null;
        longPressOpenedPointer.current = pointerId;
        openAt({ x: startX, y: startY, activePointerId: pointerId });
      }, longPressMs);
    },
    [clearTimer, enableClick, enableLongPress, longPressMs, openAt],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = pointerStart.current;
      if (!start) return;
      if (start.id !== e.pointerId) return;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > movementTolerance || dy > movementTolerance) {
        pointerStart.current = null;
        longPressOpenedPointer.current = null;
        clearTimer();
      }
    },
    [clearTimer, movementTolerance],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const startedHere = pointerStart.current?.id === e.pointerId;
      const openedByLongPress = longPressOpenedPointer.current === e.pointerId;

      if (startedHere) {
        pointerStart.current = null;
      }
      if (openedByLongPress) {
        longPressOpenedPointer.current = null;
      }
      clearTimer();

      if (openedByLongPress) return;

      if (enableClick && startedHere && e.pointerType === 'mouse' && e.button === 0) {
        openAt({ x: e.clientX, y: e.clientY });
        return;
      }
    },
    [clearTimer, enableClick, openAt],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (pointerStart.current?.id === e.pointerId) {
        pointerStart.current = null;
      }
      if (longPressOpenedPointer.current === e.pointerId) {
        longPressOpenedPointer.current = null;
      }
      clearTimer();
    },
    [clearTimer],
  );

  return {
    open,
    origin,
    triggerProps: {
      onContextMenu,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    openAt,
    close,
  };
}
