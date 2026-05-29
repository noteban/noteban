import { useCallback, useEffect, useRef } from 'react';
import type { HTMLAttributes } from 'react';

const DEFAULT_LONG_PRESS_MS = 350;
const DEFAULT_MOVE_TOLERANCE = 8;

export interface UseLongPressOptions {
  /** Fires once the long-press threshold elapses without significant movement. */
  onLongPress: (clientX: number, clientY: number) => void;
  /** When false, all handlers are no-ops. Default: true. */
  enabled?: boolean;
  /** Threshold in ms before `onLongPress` fires. Default: 350. */
  delayMs?: number;
  /** Allowed pointer drift (px, per axis) before the press is cancelled. Default: 8. */
  movementTolerance?: number;
  /** Fire a haptic tick via `navigator.vibrate` on success. Default: true. */
  haptic?: boolean;
}

export interface UseLongPressReturn {
  triggerProps: Pick<
    HTMLAttributes<HTMLElement>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onContextMenu'
  >;
}

/**
 * Detects a long press on touch / pen / primary mouse and invokes a callback.
 * Pure detection — opening / closing any resulting UI is the caller's concern.
 */
export function useLongPress(options: UseLongPressOptions): UseLongPressReturn {
  const {
    onLongPress,
    enabled = true,
    delayMs = DEFAULT_LONG_PRESS_MS,
    movementTolerance = DEFAULT_MOVE_TOLERANCE,
    haptic = true,
  } = options;

  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const fired = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      const isPrimaryMouse = e.pointerType === 'mouse' && e.button === 0;
      if (!(isPrimaryMouse || e.pointerType === 'touch' || e.pointerType === 'pen')) return;

      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      fired.current = false;
      clearTimer();

      const startX = e.clientX;
      const startY = e.clientY;
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        if (haptic && typeof navigator !== 'undefined') {
          navigator.vibrate?.(8);
        }
        onLongPress(startX, startY);
      }, delayMs);
    },
    [enabled, clearTimer, delayMs, haptic, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      if (
        Math.abs(e.clientX - s.x) > movementTolerance ||
        Math.abs(e.clientY - s.y) > movementTolerance
      ) {
        start.current = null;
        clearTimer();
      }
    },
    [clearTimer, movementTolerance],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (start.current?.id === e.pointerId) {
        start.current = null;
      }
      clearTimer();
    },
    [clearTimer],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (start.current?.id === e.pointerId) {
        start.current = null;
      }
      clearTimer();
    },
    [clearTimer],
  );

  // Suppress the synthetic contextmenu iOS fires after a long-press so the
  // OS-level callout never flashes before our sheet opens.
  const onContextMenu = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!enabled) return;
      if (fired.current) {
        e.preventDefault();
        fired.current = false;
      }
    },
    [enabled],
  );

  return {
    triggerProps: enabled
      ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu }
      : {},
  };
}
