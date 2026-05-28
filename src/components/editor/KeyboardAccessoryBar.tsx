import { useCallback, useEffect, useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import {
  CornerDownLeft,
  CornerDownRight,
  Undo2,
  Redo2,
} from 'lucide-react';
import {
  performAction,
  subscribeActiveEditor,
  type AccessoryAction,
} from '../../lib/accessoryBridge';
import { isIOS } from '../../utils/platform';
import './KeyboardAccessoryBar.css';

const KEYBOARD_VISIBLE_THRESHOLD_PX = 80;

interface CharSpec {
  label: string;
  action: AccessoryAction;
}

const CHARS: CharSpec[] = [
  { label: '#', action: 'hash' },
  { label: '[', action: 'lbracket' },
  { label: ']', action: 'rbracket' },
  { label: '-', action: 'dash' },
  { label: '*', action: 'star' },
  { label: '`', action: 'backtick' },
  { label: '>', action: 'gt' },
  { label: '_', action: 'underscore' },
  { label: '!', action: 'bang' },
  { label: '|', action: 'pipe' },
  { label: '~', action: 'tilde' },
];

export function KeyboardAccessoryBar() {
  const [editorFocused, setEditorFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!isIOS) return;
    return subscribeActiveEditor((view) => setEditorFocused(view !== null));
  }, []);

  useEffect(() => {
    if (!isIOS) return;
    const vv = window.visualViewport;
    if (!vv) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const h = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardHeight(h > 0 ? h : 0);
    };
    const schedule = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  const visible =
    isIOS && editorFocused && keyboardHeight > KEYBOARD_VISIBLE_THRESHOLD_PX;

  // WKWebView always shows its own ~44pt form-accessory bar (prev/next/Done)
  // when a contenteditable is focused, and iOS exposes no public API to hide
  // it. Position our pill to overlap that band so it visually covers the
  // system bar instead of stacking above it.
  const IOS_FORM_BAR_PX = 44;
  const pillBottom = Math.max(
    4,
    keyboardHeight - IOS_FORM_BAR_PX,
  );

  // Preserve editor focus across the tap: pointerdown.preventDefault stops
  // the browser shifting focus to the button, so the caret stays put and
  // the keyboard doesn't dismiss between rapid taps.
  const onButtonPointerDown = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
  }, []);

  const fire = useCallback(
    (action: AccessoryAction) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      performAction(action);
    },
    [],
  );

  if (!isIOS) return null;

  return (
    <div
      className="kbd-accessory-root"
      data-visible={visible ? 'true' : 'false'}
      style={{ bottom: `${pillBottom}px` }}
      aria-hidden={!visible}
    >
      <div className="kbd-accessory-pill" role="toolbar" aria-label="Editor shortcuts">
        <button
          type="button"
          className="kbd-accessory-btn"
          aria-label="Outdent"
          onPointerDown={onButtonPointerDown}
          onClick={fire('outdent')}
        >
          <CornerDownLeft size={18} />
        </button>
        <button
          type="button"
          className="kbd-accessory-btn"
          aria-label="Indent"
          onPointerDown={onButtonPointerDown}
          onClick={fire('indent')}
        >
          <CornerDownRight size={18} />
        </button>
        <span className="kbd-accessory-divider" aria-hidden="true" />
        {CHARS.map(({ label, action }) => (
          <button
            key={action}
            type="button"
            className="kbd-accessory-btn kbd-accessory-btn-char"
            aria-label={`Insert ${label}`}
            onPointerDown={onButtonPointerDown}
            onClick={fire(action)}
          >
            {label}
          </button>
        ))}
        <span className="kbd-accessory-divider" aria-hidden="true" />
        <button
          type="button"
          className="kbd-accessory-btn"
          aria-label="Undo"
          onPointerDown={onButtonPointerDown}
          onClick={fire('undo')}
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          className="kbd-accessory-btn"
          aria-label="Redo"
          onPointerDown={onButtonPointerDown}
          onClick={fire('redo')}
        >
          <Redo2 size={18} />
        </button>
      </div>
    </div>
  );
}
