import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import type { PieMenuItem, PieMenuProps } from './types';
import { buildSectors, clampOrigin, hitTestSector } from './geometry';
import { paginateItems } from './pagination';
import type { Slot } from './pagination';

import './PieMenu.css';

const DEFAULT_SIZE = 220;
const DEFAULT_DEAD_ZONE_RATIO = 0.25;
const DEFAULT_OPEN_DURATION = 140;
const DEFAULT_BLUR_STRENGTH = 6;
const SWIPE_THRESHOLD_PX = 60;

function isTouchPrimary(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

function ChevronUp({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ChevronDown({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function PieMenu(props: PieMenuProps) {
  if (!props.open) return null;
  return <PieMenuContent {...props} />;
}

function PieMenuContent(props: PieMenuProps) {
  const {
    origin,
    items,
    onSelect,
    onClose,
    maxPerPage,
    wrapPages = false,
    size = DEFAULT_SIZE,
    deadZoneRatio = DEFAULT_DEAD_ZONE_RATIO,
    openDurationMs = DEFAULT_OPEN_DURATION,
    blur = false,
    blurStrength = DEFAULT_BLUR_STRENGTH,
    className,
    style,
    container,
  } = props;

  const resolvedMaxPerPage = maxPerPage ?? (isTouchPrimary() ? 4 : 8);
  const surfaceRef = useRef<SVGSVGElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const [pageIndex, setPageIndex] = useState(0);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  const paginated = useMemo(
    () => paginateItems(items, resolvedMaxPerPage, wrapPages),
    [items, resolvedMaxPerPage, wrapPages],
  );

  const outerR = size / 2 - 4;
  const innerR = outerR * deadZoneRatio;
  const cx = size / 2;
  const cy = size / 2;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : size * 4;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : size * 4;
  const clamped = clampOrigin(origin.x, origin.y, size / 2, viewportW, viewportH);

  const effectivePage = Math.min(pageIndex, Math.max(0, paginated.totalPages - 1));
  const page = paginated.pages[effectivePage] ?? paginated.pages[0];
  const slotCount = page?.slots.length ?? 0;

  const sectors = useMemo(
    () => (slotCount > 0 ? buildSectors(cx, cy, innerR, outerR, slotCount, 0.012) : []),
    [cx, cy, innerR, outerR, slotCount],
  );

  const goPage = useCallback(
    (delta: number) => {
      setHoveredSlot(null);
      setActiveSlot(null);
      setPageIndex((p) => {
        const total = paginated.totalPages;
        const next = p + delta;
        if (wrapPages) {
          return ((next % total) + total) % total;
        }
        return Math.min(Math.max(next, 0), total - 1);
      });
    },
    [paginated.totalPages, wrapPages],
  );

  const handleActivate = useCallback(
    (slotIdx: number) => {
      if (!page) return;
      const slot = page.slots[slotIdx];
      if (!slot) return;
      if (slot.kind === 'item' && slot.item && !slot.item.disabled) {
        slot.item.onSelect?.();
        onSelect?.(slot.item);
        onClose();
      } else if (slot.kind === 'next') {
        goPage(1);
      } else if (slot.kind === 'prev') {
        goPage(-1);
      }
    },
    [page, onSelect, onClose, goPage],
  );

  const pointerToLocal = useCallback(
    (clientX: number, clientY: number) => {
      const surface = surfaceRef.current;
      if (!surface) return { dx: 0, dy: 0 };
      const rect = surface.getBoundingClientRect();
      const scaleX = size / rect.width;
      const scaleY = size / rect.height;
      const localX = (clientX - rect.left) * scaleX;
      const localY = (clientY - rect.top) * scaleY;
      return { dx: localX - cx, dy: localY - cy };
    },
    [cx, cy, size],
  );

  const onSurfacePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      const { dx, dy } = pointerToLocal(e.clientX, e.clientY);
      const idx = hitTestSector(dx, dy, innerR, outerR, slotCount);
      setActiveSlot(idx);
      setHoveredSlot(idx);
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [innerR, outerR, slotCount, pointerToLocal],
  );

  const onSurfacePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const { dx, dy } = pointerToLocal(e.clientX, e.clientY);
      const idx = hitTestSector(dx, dy, innerR, outerR, slotCount);
      setHoveredSlot(idx);
      if (activeSlot !== null && idx !== null) {
        setActiveSlot(idx);
      }
    },
    [activeSlot, innerR, outerR, slotCount, pointerToLocal],
  );

  const onSurfacePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      const { dx, dy } = pointerToLocal(e.clientX, e.clientY);
      const idx = hitTestSector(dx, dy, innerR, outerR, slotCount);

      if (paginated.totalPages > 1 && idx === null && start) {
        const horizDelta = e.clientX - start.x;
        const vertDelta = e.clientY - start.y;
        if (
          Math.abs(horizDelta) > SWIPE_THRESHOLD_PX &&
          Math.abs(horizDelta) > Math.abs(vertDelta) * 1.5
        ) {
          goPage(horizDelta < 0 ? 1 : -1);
          setActiveSlot(null);
          return;
        }
      }

      setActiveSlot(null);
      if (idx === null) {
        onClose();
        return;
      }
      handleActivate(idx);
    },
    [
      handleActivate,
      goPage,
      innerR,
      outerR,
      slotCount,
      onClose,
      pointerToLocal,
      paginated.totalPages,
    ],
  );

  const onSurfacePointerCancel = useCallback(() => {
    dragStartRef.current = null;
    setActiveSlot(null);
    setHoveredSlot(null);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (!page) return;
      if (e.key === 'ArrowLeft') {
        if (paginated.totalPages > 1) {
          e.preventDefault();
          goPage(-1);
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        if (paginated.totalPages > 1) {
          e.preventDefault();
          goPage(1);
        }
        return;
      }
      const n = Number(e.key);
      if (!Number.isNaN(n) && n >= 1 && n <= slotCount) {
        e.preventDefault();
        handleActivate(n - 1);
      }
    };

    const handleOutside = (e: PointerEvent) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      if (surface.contains(e.target as Node)) return;
      onClose();
    };

    document.addEventListener('keydown', handleKey);
    document.addEventListener('pointerdown', handleOutside, true);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('pointerdown', handleOutside, true);
    };
  }, [onClose, page, slotCount, handleActivate, goPage, paginated.totalPages]);

  if (slotCount === 0) return null;

  const portalTarget =
    container ?? (typeof document !== 'undefined' ? document.body : null);
  if (!portalTarget) return null;

  const rootStyle: CSSProperties = {
    '--pie-open-duration': `${openDurationMs}ms`,
    '--pie-blur': `${blurStrength}px`,
    ...style,
  } as CSSProperties;

  const surfaceStyle: CSSProperties = {
    left: clamped.x - size / 2,
    top: clamped.y - size / 2,
    width: size,
    height: size,
  };

  const rootClass = ['pie-menu-root', className].filter(Boolean).join(' ');

  return createPortal(
    <div
      className={rootClass}
      data-blur={blur ? 'true' : 'false'}
      style={rootStyle}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <svg
        ref={surfaceRef}
        className="pie-menu-surface"
        style={surfaceStyle}
        viewBox={`0 0 ${size} ${size}`}
        role="menu"
        aria-label="Pie menu"
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={onSurfacePointerUp}
        onPointerCancel={onSurfacePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <circle
          className="pie-menu-background"
          cx={cx}
          cy={cy}
          r={outerR}
        />
        {sectors.map((s) => {
          const slot = page.slots[s.index];
          return (
            <SectorShape
              key={s.index}
              slot={slot}
              path={s.path}
              hovered={hoveredSlot === s.index}
              active={activeSlot === s.index}
            />
          );
        })}
        {sectors.map((s) => {
          const slot = page.slots[s.index];
          if (!slot || slot.kind === 'empty') return null;
          return (
            <SectorLabel
              key={s.index}
              slot={slot}
              x={s.centerX}
              y={s.centerY}
              radius={(outerR - innerR) * 0.35}
            />
          );
        })}
        {paginated.totalPages > 1 && (
          <text
            className="pie-menu-page-indicator"
            x={cx}
            y={cy}
          >
            {effectivePage + 1} / {paginated.totalPages}
          </text>
        )}
      </svg>
    </div>,
    portalTarget,
  );
}

interface SectorShapeProps {
  slot: Slot | undefined;
  path: string;
  hovered: boolean;
  active: boolean;
}

function SectorShape({ slot, path, hovered, active }: SectorShapeProps) {
  if (!slot) return null;
  const isItem = slot.kind === 'item';
  const isNav = slot.kind === 'prev' || slot.kind === 'next';
  const isEmpty = slot.kind === 'empty';
  const item = slot.item;

  return (
    <path
      d={path}
      className="pie-menu-sector"
      data-kind={isNav ? 'nav' : isItem ? 'item' : 'empty'}
      data-empty={isEmpty ? 'true' : 'false'}
      data-hover={hovered ? 'true' : 'false'}
      data-active={active ? 'true' : 'false'}
      data-danger={item?.danger ? 'true' : 'false'}
      data-disabled={item?.disabled ? 'true' : 'false'}
    />
  );
}

interface SectorLabelProps {
  slot: Slot;
  x: number;
  y: number;
  radius: number;
}

function SectorLabel({ slot, x, y, radius }: SectorLabelProps) {
  const iconSize = radius * 1.4;
  const labelOffset = radius * 1.2;

  if (slot.kind === 'prev') {
    return (
      <g className="pie-menu-label-group" data-kind="nav">
        <foreignObject
          x={x - iconSize / 2}
          y={y - iconSize / 2}
          width={iconSize}
          height={iconSize}
        >
          <div className="pie-menu-icon">
            <ChevronUp size={iconSize} />
          </div>
        </foreignObject>
      </g>
    );
  }

  if (slot.kind === 'next') {
    return (
      <g className="pie-menu-label-group" data-kind="nav">
        <foreignObject
          x={x - iconSize / 2}
          y={y - iconSize / 2}
          width={iconSize}
          height={iconSize}
        >
          <div className="pie-menu-icon">
            <ChevronDown size={iconSize} />
          </div>
        </foreignObject>
      </g>
    );
  }

  const item: PieMenuItem | undefined = slot.item;
  if (!item) return null;

  return (
    <g
      className="pie-menu-label-group"
      data-kind="item"
      data-danger={item.danger ? 'true' : 'false'}
    >
      {item.icon && (
        <foreignObject
          x={x - iconSize / 2}
          y={y - iconSize / 2 - labelOffset / 3}
          width={iconSize}
          height={iconSize}
        >
          <div className="pie-menu-icon">{item.icon}</div>
        </foreignObject>
      )}
      <text className="pie-menu-label" x={x} y={y + labelOffset / 1.4}>
        {item.label}
      </text>
    </g>
  );
}
