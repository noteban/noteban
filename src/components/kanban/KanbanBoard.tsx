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
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { useNotesStore, useSettingsStore, useUIStore } from '../../stores';
import type { Note } from '../../types/note';
import './KanbanBoard.css';

export function KanbanBoard() {
  const { notes, updateNote, setActiveNote } = useNotesStore();
  const { settings } = useSettingsStore();
  const { setView } = useUIStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Group notes by column
  const notesByColumn = useMemo(() => {
    const grouped: Record<string, Note[]> = {};
    settings.columns.forEach(col => {
      grouped[col.id] = notes
        .filter(note => note.frontmatter.column === col.id)
        .sort((a, b) => a.frontmatter.order - b.frontmatter.order);
    });
    return grouped;
  }, [notes, settings.columns]);

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

  return (
    <div className="kanban-board">
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
