import { useMemo } from 'react';
import { useNotesStore } from '../stores';

export function useTags() {
  const { notes, inlineTags } = useNotesStore();

  return useMemo(() => {
    const tagCounts = new Map<string, number>();
    const tagsByNote = new Map<string, string[]>();

    notes.forEach((note) => {
      // Combine frontmatter tags with inline tags from cache
      const frontmatterTags = note.frontmatter.tags || [];
      const inline = inlineTags.get(note.frontmatter.id) || [];

      // Deduplicate and normalize to lowercase
      const allNoteTags = [
        ...new Set([
          ...frontmatterTags.map((t) => t.toLowerCase()),
          ...inline.map((t) => t.toLowerCase()),
        ]),
      ];

      tagsByNote.set(note.frontmatter.id, allNoteTags);

      allNoteTags.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    const allTags = Array.from(tagCounts.keys()).sort();
    const tagsByFrequency = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

    return {
      allTags,
      tagsByFrequency,
      tagCounts,
      tagsByNote,
      getTopTags: (n: number) => tagsByFrequency.slice(0, n),
      getNoteTags: (noteId: string) => tagsByNote.get(noteId) || [],
    };
  }, [notes, inlineTags]);
}
