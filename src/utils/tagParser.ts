// Regex pattern for valid hashtags:
// - Start with # followed by a letter
// - Followed by alphanumeric chars, underscores, or hyphens
// - Not preceded by alphanumeric (to avoid matching mid-word)
const HASHTAG_REGEX = /(?:^|[^a-zA-Z0-9])#([a-zA-Z][a-zA-Z0-9_-]*)/g;

// Pattern for validating a tag string (without the # prefix)
const TAG_VALIDATION_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Validates if a string is a valid tag (without # prefix)
 */
export function isValidTag(tag: string): boolean {
  return TAG_VALIDATION_REGEX.test(tag);
}

/**
 * Extracts all unique hashtags from markdown content.
 * Skips frontmatter and code blocks.
 */
export function extractTags(content: string): string[] {
  // Reset regex state (important for global regex reuse)
  HASHTAG_REGEX.lastIndex = 0;

  // Remove frontmatter section (between ---)
  let cleanContent = content.replace(/^---[\s\S]*?---\n?/, '');

  // Remove fenced code blocks (```)
  cleanContent = cleanContent.replace(/```[\s\S]*?```/g, '');

  // Remove inline code (`)
  cleanContent = cleanContent.replace(/`[^`\n]+`/g, '');

  const tags = new Set<string>();
  let match;

  while ((match = HASHTAG_REGEX.exec(cleanContent)) !== null) {
    tags.add(match[1].toLowerCase());
  }

  return Array.from(tags);
}

/**
 * Returns positions of hashtags in the content for CodeMirror decorations.
 * Does not skip frontmatter - that should be handled by the caller.
 */
export function getTagPositions(
  text: string,
  lineOffset: number
): Array<{ tag: string; from: number; to: number }> {
  const positions: Array<{ tag: string; from: number; to: number }> = [];
  let match;

  // Reset regex state
  HASHTAG_REGEX.lastIndex = 0;

  while ((match = HASHTAG_REGEX.exec(text)) !== null) {
    // Calculate the actual start position of the # symbol
    const prefixLength = match[0].length - match[1].length - 1; // -1 for the #
    const from = lineOffset + match.index + prefixLength;
    const to = from + match[1].length + 1; // +1 for the #

    positions.push({
      tag: match[1].toLowerCase(),
      from,
      to,
    });
  }

  return positions;
}
