import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';
import type { Note } from '../../types/note';
import { useNotesStore, useUIStore } from '../../stores';
import { useTags } from '../../hooks';
import './KanbanCard.css';

interface Task {
  text: string;
  checked: boolean;
  index: number;
}

interface KanbanCardProps {
  note: Note;
  isDragging?: boolean;
  onClick?: () => void;
}

export function KanbanCard({ note, isDragging, onClick }: KanbanCardProps) {
  const { updateNote } = useNotesStore();
  const { setFilterTag } = useUIStore();
  const { tagsByFrequency, getNoteTags } = useTags();
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

  // Parse tasks from content
  const tasks = useMemo(() => {
    const taskRegex = /^[\s]*[-*]\s*\[([ xX])\]\s*(.+)$/gm;
    const found: Task[] = [];
    let match;

    while ((match = taskRegex.exec(note.content)) !== null) {
      found.push({
        checked: match[1].toLowerCase() === 'x',
        text: match[2].trim(),
        index: match.index,
      });
    }

    return found.slice(0, 5); // Show max 5 tasks
  }, [note.content]);

  // Get preview text (excluding task lines)
  const preview = useMemo(() => {
    if (tasks.length > 0) return null; // Don't show preview if we have tasks
    return note.content
      .split('\n')
      .filter(line => !line.match(/^[\s]*[-*]\s*\[[ xX]\]/))
      .join(' ')
      .slice(0, 80)
      .replace(/[#*_\[\]]/g, '')
      .trim();
  }, [note.content, tasks.length]);

  // Sort note's tags by global frequency (most common first), take top 3
  const displayTags = useMemo(() => {
    const noteTags = getNoteTags(note.frontmatter.id);
    if (noteTags.length === 0) return [];

    return [...noteTags]
      .sort((a, b) => {
        const aIndex = tagsByFrequency.indexOf(a);
        const bIndex = tagsByFrequency.indexOf(b);
        const aRank = aIndex === -1 ? Infinity : aIndex;
        const bRank = bIndex === -1 ? Infinity : bIndex;
        return aRank - bRank;
      })
      .slice(0, 3);
  }, [note.frontmatter.id, tagsByFrequency, getNoteTags]);

  const handleTagClick = (tag: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFilterTag(tag);
  };

  const handleCheckboxChange = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();

    // Find and replace the checkbox in content
    const lines = note.content.split('\n');
    let charCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (charCount <= task.index && task.index < charCount + line.length + 1) {
        // This is the line with the task
        const newLine = task.checked
          ? line.replace(/\[x\]/i, '[ ]')
          : line.replace(/\[ \]/, '[x]');
        lines[i] = newLine;
        break;
      }
      charCount += line.length + 1; // +1 for newline
    }

    const newContent = lines.join('\n');

    try {
      await updateNote({
        file_path: note.file_path,
        content: newContent,
      });
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

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

      {tasks.length > 0 ? (
        <div className="kanban-card-tasks">
          {tasks.map((task, i) => (
            <label
              key={i}
              className={`kanban-card-task ${task.checked ? 'checked' : ''}`}
              onClick={(e) => handleCheckboxChange(task, e)}
            >
              <input
                type="checkbox"
                checked={task.checked}
                readOnly
              />
              <span>{task.text}</span>
            </label>
          ))}
        </div>
      ) : preview ? (
        <p className="kanban-card-preview">{preview}...</p>
      ) : null}

      {displayTags.length > 0 && (
        <div className="kanban-card-tag-chips">
          {displayTags.map(tag => (
            <button
              key={tag}
              className="kanban-tag-chip"
              onClick={(e) => handleTagClick(tag, e)}
              title={`Filter by: ${tag}`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {note.frontmatter.date && (
        <div className="kanban-card-footer">
          <div className="kanban-card-date">
            <Calendar size={12} />
            <span>{format(new Date(note.frontmatter.date), 'MMM d')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
