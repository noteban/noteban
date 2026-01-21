import type { TagFilter } from '../types/tagFilter';

/**
 * Check if a note's tags match the given filter.
 * Evaluates left to right with per-tag operators.
 *
 * Example: #foo AND #bar OR #baz
 * - First check: does note have foo? (result1)
 * - result1 AND (does note have bar?) = result2
 * - result2 OR (does note have baz?) = final result
 *
 * @param noteTags - Array of tags on the note
 * @param filter - The tag filter to match against
 * @returns true if the note matches the filter criteria
 */
export function matchesTagFilter(noteTags: string[], filter: TagFilter): boolean {
  if (filter.tags.length === 0) {
    return true;
  }

  // Start with the first tag
  let result = noteTags.includes(filter.tags[0]);

  // Apply each subsequent tag with its operator
  for (let i = 1; i < filter.tags.length; i++) {
    const operator = filter.operators[i - 1] || 'AND';
    const tagMatch = noteTags.includes(filter.tags[i]);

    if (operator === 'AND') {
      result = result && tagMatch;
    } else {
      result = result || tagMatch;
    }
  }

  return result;
}
