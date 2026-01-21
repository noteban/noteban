import type { TagFilter, TagFilterOperator } from '../types/tagFilter';

/**
 * Parse a user input string into a TagFilter with per-tag operators.
 *
 * Examples:
 * - `#foo #bar` → { tags: ['foo', 'bar'], operators: ['AND'] }
 * - `#foo AND #bar` → { tags: ['foo', 'bar'], operators: ['AND'] }
 * - `#foo OR #bar` → { tags: ['foo', 'bar'], operators: ['OR'] }
 * - `#foo AND #bar OR #baz` → { tags: ['foo', 'bar', 'baz'], operators: ['AND', 'OR'] }
 */
export function parseTagFilterExpression(input: string): TagFilter | null {
  if (!input || !input.trim()) {
    return null;
  }

  const trimmed = input.trim();

  // Tokenize: split by tags and capture operators between them
  // Match pattern: #tag (AND|OR)? #tag (AND|OR)? #tag ...
  const tagRegex = /#([\w-]+)/g;
  const tags: string[] = [];
  const operators: TagFilterOperator[] = [];

  let match;
  let lastIndex = 0;

  while ((match = tagRegex.exec(trimmed)) !== null) {
    // Check for operator between last tag and this one
    if (tags.length > 0) {
      const between = trimmed.slice(lastIndex, match.index).toUpperCase();
      if (between.includes(' OR ') || between.trim() === 'OR') {
        operators.push('OR');
      } else {
        // Default to AND (including implicit space)
        operators.push('AND');
      }
    }

    tags.push(match[1]);
    lastIndex = match.index + match[0].length;
  }

  if (tags.length === 0) {
    return null;
  }

  // Remove duplicates while preserving order and adjusting operators
  const seen = new Set<string>();
  const uniqueTags: string[] = [];
  const uniqueOperators: TagFilterOperator[] = [];

  for (let i = 0; i < tags.length; i++) {
    if (!seen.has(tags[i])) {
      seen.add(tags[i]);
      if (uniqueTags.length > 0 && i > 0) {
        uniqueOperators.push(operators[i - 1]);
      }
      uniqueTags.push(tags[i]);
    }
  }

  return {
    tags: uniqueTags,
    operators: uniqueOperators,
  };
}

/**
 * Convert a TagFilter back to a string representation.
 */
export function tagFilterToString(filter: TagFilter): string {
  if (filter.tags.length === 0) {
    return '';
  }

  let result = `#${filter.tags[0]}`;
  for (let i = 1; i < filter.tags.length; i++) {
    const op = filter.operators[i - 1] || 'AND';
    result += ` ${op} #${filter.tags[i]}`;
  }
  return result;
}

/**
 * Create a TagFilter from a single tag.
 */
export function createSingleTagFilter(tag: string): TagFilter {
  return {
    tags: [tag],
    operators: [],
  };
}

/**
 * Create an empty TagFilter.
 */
export function createEmptyTagFilter(): TagFilter {
  return {
    tags: [],
    operators: [],
  };
}

/**
 * Check if a TagFilter has any tags.
 */
export function hasTagFilter(filter: TagFilter): boolean {
  return filter.tags.length > 0;
}

/**
 * Add a tag to an existing filter with a specified operator.
 */
export function addTagToFilter(
  filter: TagFilter,
  tag: string,
  operator: TagFilterOperator = 'AND'
): TagFilter {
  if (filter.tags.includes(tag)) {
    return filter;
  }
  return {
    tags: [...filter.tags, tag],
    operators: filter.tags.length > 0 ? [...filter.operators, operator] : [],
  };
}

/**
 * Remove a tag from an existing filter.
 */
export function removeTagFromFilter(filter: TagFilter, tag: string): TagFilter {
  const index = filter.tags.indexOf(tag);
  if (index === -1) {
    return filter;
  }

  const newTags = [...filter.tags];
  const newOperators = [...filter.operators];

  newTags.splice(index, 1);

  // Remove the appropriate operator
  if (newOperators.length > 0) {
    if (index === 0) {
      // Removing first tag: remove first operator
      newOperators.splice(0, 1);
    } else {
      // Removing other tag: remove operator before it
      newOperators.splice(index - 1, 1);
    }
  }

  return {
    tags: newTags,
    operators: newOperators,
  };
}

/**
 * Toggle a tag in the filter (add if not present, remove if present).
 */
export function toggleTagInFilter(
  filter: TagFilter,
  tag: string,
  operator: TagFilterOperator = 'AND'
): TagFilter {
  if (filter.tags.includes(tag)) {
    return removeTagFromFilter(filter, tag);
  }
  return addTagToFilter(filter, tag, operator);
}

/**
 * Set the operator at a specific index.
 */
export function setOperatorAtIndex(
  filter: TagFilter,
  index: number,
  operator: TagFilterOperator
): TagFilter {
  if (index < 0 || index >= filter.operators.length) {
    return filter;
  }
  const newOperators = [...filter.operators];
  newOperators[index] = operator;
  return {
    ...filter,
    operators: newOperators,
  };
}
