# @noteban/pie-menu

Second Life-style radial (pie) context menu for React.

Touch-first: long-press to open, drag to a sector, release to select. Right-click works on pointer devices. Keyboard `1..n` shortcuts and arrow-key pagination included. Defaults to a black-transparent surface with optional backdrop blur; every colour is exposed as a CSS variable so you can retheme without forking.

## Install

```sh
npm install @noteban/pie-menu
```

`react` and `react-dom` are peer dependencies.

## Usage

```tsx
import { useState } from 'react';
import { Pencil, Trash2, Copy } from 'lucide-react';
import { PieMenu, usePieMenu } from '@noteban/pie-menu';
import '@noteban/pie-menu/style.css';

function FolderRow({ folder }) {
  const pie = usePieMenu();

  return (
    <div {...pie.triggerProps}>
      {folder.name}

      <PieMenu
        open={pie.open}
        origin={pie.origin}
        onClose={pie.close}
        blur
        items={[
          { id: 'rename', label: 'Rename', icon: <Pencil size={18} />, onSelect: () => rename(folder) },
          { id: 'dup',    label: 'Duplicate', icon: <Copy size={18} />, onSelect: () => duplicate(folder) },
          { id: 'del',    label: 'Delete', icon: <Trash2 size={18} />, danger: true, onSelect: () => del(folder) },
        ]}
      />
    </div>
  );
}
```

## Props

| Prop | Default | Notes |
|---|---|---|
| `open` | required | Whether the menu is rendered. |
| `origin` | required | Screen coords the menu fans out from. |
| `items` | required | Sectors, clockwise from 12 o'clock. |
| `onSelect` | — | Fires alongside the item's own `onSelect`. |
| `onClose` | required | Esc, outside tap, dead-zone release, selection. |
| `maxPerPage` | 8 desktop / 4 touch | Sectors per page; extra items paginate. |
| `wrapPages` | `false` | Wrap Next/Prev past first/last page. |
| `size` | `220` | Outer diameter in px. |
| `deadZoneRatio` | `0.25` | Inner cancel radius as fraction of outer. |
| `openDurationMs` | `140` | Scale/fade animation. |
| `blur` | `false` | Enables `backdrop-filter: blur(...)` behind the pie. |
| `blurStrength` | `6` | Blur radius when `blur` is true. |
| `className` | — | Added to the portal root. |
| `style` | — | Inline style on the portal root — use this to override CSS variables. |
| `container` | `document.body` | Portal target. |

## Interaction

| Trigger | Behaviour |
|---|---|
| Long-press (≥ `longPressMs`, default 350 ms) | Open at the press point; haptic tick if supported. |
| Right-click on a pointer device | Open at the cursor. |
| Drag while open | Highlight the sector under the pointer. |
| Release on a sector | Select it (or paginate, if it's Prev/Next). |
| Release in dead-zone or outside outer ring | Cancel. |
| Horizontal swipe past the outer ring (paginated) | Previous / next page. |
| `Esc` / outside tap | Cancel. |
| Number keys `1..n` | Activate sector `n` clockwise from 12. |
| `ArrowLeft` / `ArrowRight` (paginated) | Previous / next page. |

## Pagination

When `items.length > maxPerPage`:

- 2 pages: **Next** pinned at 6 o'clock on both pages; Next on page 2 wraps to page 1.
- 3+ pages: **Prev** at 12, **Next** at 6. First page omits Prev, last page omits Next, unless `wrapPages` is `true`.
- Nav sectors are visually distinct (chevron, muted fill) and only change page.
- Items hold a stable position within a page across re-opens.
- A page indicator (`2 / 4`) renders in the dead-zone centre.

## Theming

Override any of these on the menu root via the `style` prop or by targeting `.pie-menu-root`:

```
--pie-bg                       rgba(0,0,0,0.72)
--pie-sector-stroke            rgba(255,255,255,0.08)
--pie-sector-fill              transparent
--pie-sector-hover-fill        rgba(255,255,255,0.10)
--pie-sector-active-fill       rgba(255,255,255,0.18)
--pie-sector-danger-fill       rgba(243,139,168,0.22)
--pie-text                     rgba(255,255,255,0.92)
--pie-text-muted               rgba(255,255,255,0.55)
--pie-text-danger              #f38ba8
--pie-nav-fill                 rgba(255,255,255,0.04)
--pie-nav-icon                 rgba(255,255,255,0.55)
--pie-disabled-opacity         0.35
--pie-shadow                   0 12px 36px rgba(0,0,0,0.45)
--pie-open-duration            140ms      (set via `openDurationMs`)
--pie-blur                     0px        (set via `blurStrength`)
```

To match a light theme, set lighter values on the consumer side, e.g.:

```tsx
<PieMenu
  style={{
    ['--pie-bg' as never]: 'rgba(20, 20, 28, 0.78)',
    ['--pie-text' as never]: 'rgba(255, 255, 255, 0.95)',
  }}
  /* ... */
/>
```

## License

MIT
