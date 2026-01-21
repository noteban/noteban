import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { X, Tag } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { useNotesStore, useSettingsStore, useUIStore } from '../../stores';
import { useTags } from '../../hooks/useTags';
import { matchesTagFilter } from '../../utils/tagFilterMatcher';
import { hasTagFilter } from '../../utils/tagFilterParser';
import type { Note } from '../../types/note';
import './KanbanBoard.css';

export function KanbanBoard() {
  const { notes, updateNote, setActiveNote } = useNotesStore();
  const { settings } = useSettingsStore();
  const { setView, tagFilter, clearTagFilter, removeTagFromFilter, setOperatorAtIndex, searchQuery } = useUIStore();
  const { getNoteTags } = useTags();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const hasActiveFilter = hasTagFilter(tagFilter);

  // Filter notes by tag and search query
  const filteredNotes = useMemo(() => {
    let result = notes;

    if (hasActiveFilter) {
      result = result.filter((note) => {
        const noteTags = getNoteTags(note.frontmatter.id);
        return matchesTagFilter(noteTags, tagFilter);
      });
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((note) => {
        const noteTags = getNoteTags(note.frontmatter.id);
        return (
          note.frontmatter.title.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query) ||
          noteTags.some((tag) => tag.toLowerCase().includes(query))
        );
      });
    }

    return result;
  }, [notes, tagFilter, hasActiveFilter, searchQuery, getNoteTags]);

  // Group filtered notes by column
  const notesByColumn = useMemo(() => {
    const grouped: Record<string, Note[]> = {};
    settings.columns.forEach(col => {
      grouped[col.id] = filteredNotes
        .filter(note => note.frontmatter.column === col.id)
        .sort((a, b) => a.frontmatter.order - b.frontmatter.order);
    });
    return grouped;
  }, [filteredNotes, settings.columns]);

  const activeNote = useMemo(
    () => notes.find(n => n.frontmatter.id === activeId),
    [notes, activeId]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedNote = notes.find(n => n.frontmatter.id === active.id);
    if (!draggedNote) return;

    const targetColumnId = over.id as string;

    // Only update if dropped on a different column
    if (draggedNote.frontmatter.column !== targetColumnId) {
      // Verify the target is a valid column
      const targetColumn = settings.columns.find(c => c.id === targetColumnId);
      if (targetColumn) {
        await updateNote({
          file_path: draggedNote.file_path,
          column: targetColumnId,
        });
      }
    }
  };

  const handleCardClick = (noteId: string) => {
    setActiveNote(noteId);
    setView('notes');
  };

  const handleRemoveTag = (tag: string) => {
    removeTagFromFilter(tag);
  };

  const handleToggleOperator = (index: number) => {
    const currentOp = tagFilter.operators[index];
    setOperatorAtIndex(index, currentOp === 'AND' ? 'OR' : 'AND');
  };

  return (
    <div className="kanban-board">
      {hasActiveFilter && (
        <div className="kanban-filter-indicator">
          <Tag size={14} />
          <span>Filtered by:</span>
          <div className="kanban-filter-tags">
            {tagFilter.tags.map((tag, index) => (
              <span key={tag} className="kanban-filter-tag-wrapper">
                {index > 0 && (
                  <button
                    className="kanban-filter-operator"
                    onClick={() => handleToggleOperator(index - 1)}
                    title={`Click to switch to ${tagFilter.operators[index - 1] === 'AND' ? 'OR' : 'AND'}`}
                  >
                    {tagFilter.operators[index - 1] || 'AND'}
                  </button>
                )}
                <span className="kanban-filter-tag">
                  {tag}
                  {tagFilter.tags.length > 1 && (
                    <button
                      className="kanban-filter-tag-remove"
                      onClick={() => handleRemoveTag(tag)}
                      title={`Remove ${tag}`}
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              </span>
            ))}
          </div>
          <button
            className="kanban-filter-clear"
            onClick={clearTagFilter}
            title="Clear filter"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban-columns">
          {settings.columns.map(column => (
            <KanbanColumn
              key={column.id}
              column={column}
              notes={notesByColumn[column.id] || []}
              onCardClick={handleCardClick}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeNote ? (
            <KanbanCard note={activeNote} isDragging />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
