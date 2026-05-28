import type { PieMenuItem } from './types';

export type SlotKind = 'item' | 'prev' | 'next' | 'empty';

export interface Slot {
  kind: SlotKind;
  item?: PieMenuItem;
}

export interface PieMenuPage {
  /** Slot for each rendered sector on this page. */
  slots: Slot[];
  hasPrev: boolean;
  hasNext: boolean;
}

export interface PaginatedMenu {
  pages: PieMenuPage[];
  /** Number of sectors rendered per page; single-page menus use item count. */
  slotsPerPage: number;
  totalPages: number;
}

/**
 * Distribute `items` across one or more pages.
 *
 * - <= maxPerPage items: 1 page, no nav sectors.
 * - 2 pages: Next pinned at 6 o'clock on both pages; Next wraps page-2 -> page-1.
 * - >2 pages: Prev pinned at 12, Next pinned at 6. First page omits Prev,
 *   last page omits Next, unless `wrapPages` is true.
 *
 * Items keep stable in-page positions across reopens because slot
 * assignment is purely a function of (pageIndex, slotIndex, item ordering).
 */
export function paginateItems(
  items: PieMenuItem[],
  maxPerPage: number,
  wrapPages: boolean = false,
): PaginatedMenu {
  const n = items.length;
  const max = Math.max(3, maxPerPage);

  if (n <= max) {
    const slots = items.map((item): Slot => ({ kind: 'item', item }));
    return {
      pages: [{ slots, hasPrev: false, hasNext: false }],
      slotsPerPage: n,
      totalPages: 1,
    };
  }

  const capacity2 = 2 * (max - 1);
  let totalPages: number;
  if (n <= capacity2 && !wrapPages) {
    totalPages = 2;
  } else if (wrapPages) {
    totalPages = Math.ceil(n / (max - 2));
    if (totalPages < 2) totalPages = 2;
  } else {
    const remaining = n - 2 * (max - 1);
    const middle = Math.ceil(remaining / (max - 2));
    totalPages = 2 + Math.max(0, middle);
  }

  const pages: PieMenuPage[] = [];
  let cursor = 0;

  for (let p = 0; p < totalPages; p++) {
    const isFirst = p === 0;
    const isLast = p === totalPages - 1;

    let hasPrev: boolean;
    let hasNext: boolean;
    if (wrapPages) {
      hasPrev = totalPages > 1;
      hasNext = totalPages > 1;
    } else if (totalPages === 2) {
      hasPrev = false;
      hasNext = true;
    } else {
      hasPrev = !isFirst;
      hasNext = !isLast;
    }

    const navCount = (hasPrev ? 1 : 0) + (hasNext ? 1 : 0);
    const itemSlots = max - navCount;
    const take = Math.min(itemSlots, n - cursor);
    const pageItems = items.slice(cursor, cursor + take);
    cursor += take;

    const slots: Slot[] = new Array<Slot>(max).fill({ kind: 'empty' }).map(
      (): Slot => ({ kind: 'empty' }),
    );

    const prevSlot = 0;
    const nextSlot = Math.floor(max / 2);

    if (hasPrev) slots[prevSlot] = { kind: 'prev' };
    if (hasNext) slots[nextSlot] = { kind: 'next' };

    let itemIdx = 0;
    for (let s = 0; s < max && itemIdx < pageItems.length; s++) {
      if (slots[s].kind !== 'empty') continue;
      slots[s] = { kind: 'item', item: pageItems[itemIdx] };
      itemIdx++;
    }

    pages.push({ slots, hasPrev, hasNext });
  }

  return { pages, slotsPerPage: max, totalPages };
}
