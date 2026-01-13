import { useMemo } from 'react';
import { useNotesStore } from '../stores';
import { extractTags } from '../utils/tagParser';

export function useTags() {
  const { notes } = useNotesStore();

  return useMemo(() => {
    const tagCounts = new Map<string, number>();
    const tagsByNote = new Map<string, string[]>();

    notes.forEach(note => {
      const tags = extractTags(note.content);
      tagsByNote.set(note.frontmatter.id, tags);

      tags.forEach(tag => {
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
  }, [notes]);
}
