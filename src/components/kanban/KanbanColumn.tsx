import { useDroppable } from '@dnd-kit/core';
import { KanbanCard } from './KanbanCard';
import type { KanbanColumn as ColumnType } from '../../types/kanban';
import type { Note } from '../../types/note';
import './KanbanColumn.css';

interface KanbanColumnProps {
  column: ColumnType;
  notes: Note[];
  onCardClick?: (noteId: string) => void;
}

export function KanbanColumn({ column, notes, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`kanban-column ${isOver ? 'is-over' : ''}`}
    >
      <div className="kanban-column-header">
        <div
          className="kanban-column-indicator"
          style={{ backgroundColor: column.color }}
        />
        <h3 className="kanban-column-title">{column.title}</h3>
        <span className="kanban-column-count">{notes.length}</span>
      </div>

      <div className="kanban-column-content">
        {notes.map(note => (
          <KanbanCard
            key={note.frontmatter.id}
            note={note}
            onClick={() => onCardClick?.(note.frontmatter.id)}
          />
        ))}
      </div>
    </div>
  );
}
