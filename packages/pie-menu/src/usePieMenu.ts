import { useCallback, useRef, useState } from 'react';
import type { PieMenuOrigin, UsePieMenuOptions, UsePieMenuReturn } from './types';

const DEFAULT_LONG_PRESS_MS = 350;
const DEFAULT_MOVE_TOLERANCE = 8;

export function usePieMenu(options: UsePieMenuOptions = {}): UsePieMenuReturn {
  const {
    longPressMs = DEFAULT_LONG_PRESS_MS,
    movementToleranceX = DEFAULT_MOVE_TOLERANCE,
    enableContextMenu = true,
    enableLongPress = true,
    haptic = true,
  } = options;

  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<PieMenuOrigin>({ x: 0, y: 0 });

  const longPressTimer = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
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
    setOpen(false);
  }, [clearTimer]);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!enableContextMenu) return;
      e.preventDefault();
      openAt({ x: e.clientX, y: e.clientY });
    },
    [enableContextMenu, openAt],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enableLongPress) return;
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      pointerStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      clearTimer();
      const startX = e.clientX;
      const startY = e.clientY;
      longPressTimer.current = window.setTimeout(() => {
        longPressTimer.current = null;
        openAt({ x: startX, y: startY });
      }, longPressMs);
    },
    [enableLongPress, longPressMs, clearTimer, openAt],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = pointerStart.current;
      if (!start) return;
      if (start.id !== e.pointerId) return;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > movementToleranceX || dy > movementToleranceX) {
        clearTimer();
      }
    },
    [clearTimer, movementToleranceX],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (pointerStart.current?.id === e.pointerId) {
        pointerStart.current = null;
      }
      clearTimer();
    },
    [clearTimer],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (pointerStart.current?.id === e.pointerId) {
        pointerStart.current = null;
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
