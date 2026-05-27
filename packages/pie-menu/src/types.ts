import type { CSSProperties, ReactNode } from 'react';

export interface PieMenuItem {
  /** Stable identifier; also used as the React key. */
  id: string;
  /** Visible label rendered inside the sector. */
  label: string;
  /** Optional icon node (typically a `lucide-react` icon). */
  icon?: ReactNode;
  /** Marks the item as destructive — picks up the danger accent. */
  danger?: boolean;
  /** Disables the sector; release will not fire `onSelect`. */
  disabled?: boolean;
  /** Per-item selection handler. The top-level `onSelect` runs too. */
  onSelect?: () => void;
}

export interface PieMenuOrigin {
  x: number;
  y: number;
}

export interface PieMenuProps {
  /** Whether the menu is currently open. */
  open: boolean;
  /** Screen coordinates the menu should fan out from. */
  origin: PieMenuOrigin;
  /** Items rendered as sectors, in clockwise order from 12 o'clock. */
  items: PieMenuItem[];
  /** Called when an item is selected. */
  onSelect?: (item: PieMenuItem) => void;
  /** Called when the menu should close (Esc, outside tap, dead-zone release, selection). */
  onClose: () => void;

  /** Max sectors per page. Defaults: 8 on pointer devices, 4 on touch. */
  maxPerPage?: number;
  /** Wrap Next/Prev around the ends instead of disabling them on first/last page. */
  wrapPages?: boolean;
  /** Overall diameter in pixels. Default: 220. */
  size?: number;
  /** Dead-zone radius as a fraction of outer radius (0-1). Default: 0.25. */
  deadZoneRatio?: number;
  /** Long-press / open animation duration in ms. Default: 140. */
  openDurationMs?: number;
  /** When true, applies a backdrop-filter blur behind the pie. Default: false. */
  blur?: boolean;
  /** Backdrop blur strength in px when `blur` is true. Default: 6. */
  blurStrength?: number;
  /** Extra class applied to the root portal element. */
  className?: string;
  /** Inline style overrides on the root element. Use CSS custom properties to retheme. */
  style?: CSSProperties;
  /** Portal target. Defaults to `document.body`. */
  container?: HTMLElement | null;
}

export interface UsePieMenuOptions {
  /** Long-press threshold in ms for touch. Default: 350. */
  longPressMs?: number;
  /** Allowed movement in px before a long-press is cancelled. Default: 8. */
  movementToleranceX?: number;
  /** Open the pie on right-click (contextmenu). Default: true. */
  enableContextMenu?: boolean;
  /** Open the pie on long-press for touch. Default: true. */
  enableLongPress?: boolean;
  /** Fire a haptic tick on open if `navigator.vibrate` exists. Default: true. */
  haptic?: boolean;
}

export interface UsePieMenuReturn {
  open: boolean;
  origin: PieMenuOrigin;
  /** Spread on the trigger element to wire pointer / touch / context handlers. */
  triggerProps: {
    onContextMenu: (e: React.MouseEvent) => void;
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  /** Programmatically open the menu at a given screen position. */
  openAt: (origin: PieMenuOrigin) => void;
  /** Programmatically close the menu. */
  close: () => void;
}
