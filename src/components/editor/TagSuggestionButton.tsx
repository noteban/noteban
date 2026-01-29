import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';
import { OllamaService } from '../../services/ollamaService';
import { useSettingsStore, useNotesStore } from '../../stores';
import { useTags } from '../../hooks/useTags';
import './TagSuggestionButton.css';

const MIN_CONTENT_LENGTH = 50;

interface TagSuggestionButtonProps {
  onInsertTag: (tag: string) => void;
}

export function TagSuggestionButton({ onInsertTag }: TagSuggestionButtonProps) {
  const { settings } = useSettingsStore();
  const { notes, activeNoteId } = useNotesStore();
  const { allTags } = useTags();

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeNote = notes.find((n) => n.frontmatter.id === activeNoteId);
  const isEnabled = settings.ai.enabled && settings.ai.selectedModel;

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Close popover when AI is disabled
  useEffect(() => {
    if (!isEnabled && isOpen) {
      setIsOpen(false);
    }
  }, [isEnabled, isOpen]);

  const handleClick = useCallback(async () => {
    if (isOpen) {
      if (!isLoading) {
        setIsOpen(false);
      }
      return;
    }

    if (!activeNote) return;

    // Check minimum content length
    if (activeNote.content.trim().length < MIN_CONTENT_LENGTH) {
      setError(`Note is too short (min ${MIN_CONTENT_LENGTH} characters)`);
      setIsOpen(true);
      return;
    }

    // Abort any previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setIsOpen(true);
    setIsLoading(true);
    setError(null);

    try {
      const tags = await OllamaService.suggestTags(
        settings.ai.serverUrl,
        settings.ai.selectedModel,
        activeNote.content,
        allTags,
        abortControllerRef.current.signal
      );
      setSuggestedTags(tags);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return; // Request was cancelled, don't update state
      }
      setError(e instanceof Error ? e.message : 'Failed to get suggestions');
      setSuggestedTags([]);
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, isLoading, activeNote, settings.ai.serverUrl, settings.ai.selectedModel, allTags]);

  const handleTagClick = (tag: string) => {
    onInsertTag(tag);
    // Remove from suggestions after insertion
    setSuggestedTags((prev) => prev.filter((t) => t !== tag));
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Don't render if AI is disabled or no model selected
  if (!isEnabled) {
    return null;
  }

  return (
    <div className="tag-suggestion-container" ref={popoverRef}>
      <button
        className="tag-suggestion-btn"
        onClick={handleClick}
        title="Suggest tags with AI"
        disabled={isLoading || !activeNote}
      >
        {isLoading ? (
          <Loader2 size={16} className="spinning" />
        ) : (
          <Sparkles size={16} />
        )}
      </button>

      {isOpen && (
        <div className="tag-suggestion-popover">
          <div className="tag-suggestion-header">
            <span>AI Suggested Tags</span>
            <button onClick={() => setIsOpen(false)}>
              <X size={14} />
            </button>
          </div>

          <div className="tag-suggestion-content">
            {isLoading && (
              <div className="tag-suggestion-loading">
                <Loader2 size={20} className="spinning" />
                <span>Analyzing note...</span>
              </div>
            )}

            {error && <div className="tag-suggestion-error">{error}</div>}

            {!isLoading && !error && suggestedTags.length === 0 && (
              <div className="tag-suggestion-empty">No suggestions available</div>
            )}

            {!isLoading && suggestedTags.length > 0 && (
              <div className="tag-suggestion-list">
                {suggestedTags.map((tag) => (
                  <button
                    key={tag}
                    className="tag-suggestion-tag"
                    onClick={() => handleTagClick(tag)}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="tag-suggestion-footer">Click a tag to insert it</div>
        </div>
      )}
    </div>
  );
}
