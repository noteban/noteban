import { useDraggable } from '@dnd-kit/core';
import { Calendar, Tag } from 'lucide-react';
import { format } from 'date-fns';
import type { Note } from '../../types/note';
import './KanbanCard.css';

interface KanbanCardProps {
  note: Note;
  isDragging?: boolean;
  onClick?: () => void;
}

export function KanbanCard({ note, isDragging, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging: isCurrentlyDragging,
  } = useDraggable({ id: note.frontmatter.id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isCurrentlyDragging ? 0.5 : 1,
  };

  const preview = note.content.slice(0, 100).replace(/[#*_\[\]]/g, '').trim();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`kanban-card ${isDragging ? 'is-dragging' : ''}`}
      onClick={onClick}
    >
      <h4 className="kanban-card-title">{note.frontmatter.title}</h4>

      {preview && (
        <p className="kanban-card-preview">{preview}...</p>
      )}

      <div className="kanban-card-footer">
        {note.frontmatter.date && (
          <div className="kanban-card-date">
            <Calendar size={12} />
            <span>{format(new Date(note.frontmatter.date), 'MMM d')}</span>
          </div>
        )}

        {note.frontmatter.tags.length > 0 && (
          <div className="kanban-card-tags">
            <Tag size={12} />
            <span>{note.frontmatter.tags.slice(0, 2).join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
