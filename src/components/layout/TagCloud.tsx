import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Hash } from 'lucide-react';
import { useUIStore } from '../../stores';
import { useTags } from '../../hooks';
import './TagCloud.css';

export function TagCloud() {
  const { tagFilter, setFilterTag, addTagToFilter, removeTagFromFilter, clearTagFilter } = useUIStore();
  const { tagsByFrequency, tagCounts } = useTags();
  const [isExpanded, setIsExpanded] = useState(true);

  // Show top 20 tags
  const displayTags = useMemo(() => {
    return tagsByFrequency.slice(0, 20);
  }, [tagsByFrequency]);

  if (displayTags.length === 0) return null;

  const handleTagClick = (tag: string, event: React.MouseEvent) => {
    const isTagActive = tagFilter.tags.includes(tag);

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      // Multi-select: add/remove tag from filter
      if (isTagActive) {
        removeTagFromFilter(tag);
      } else {
        // Default to AND when shift-clicking
        addTagToFilter(tag, 'AND');
      }
    } else {
      // Single click: set single tag filter or clear if clicking active single tag
      if (isTagActive && tagFilter.tags.length === 1) {
        clearTagFilter();
      } else {
        setFilterTag(tag);
      }
    }
  };

  return (
    <div className="tag-cloud">
      <button
        className="tag-cloud-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Hash size={14} />
        <span>Tags</span>
        <span className="tag-cloud-count">{tagsByFrequency.length}</span>
      </button>

      {isExpanded && (
        <div className="tag-cloud-list">
          {displayTags.map(tag => (
            <button
              key={tag}
              className={`tag-cloud-item ${tagFilter.tags.includes(tag) ? 'active' : ''}`}
              onClick={(e) => handleTagClick(tag, e)}
              title={`${tagCounts.get(tag)} notes (Shift+click to add to filter)`}
            >
              <span className="tag-cloud-item-name">{tag}</span>
              <span className="tag-cloud-item-count">{tagCounts.get(tag)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
