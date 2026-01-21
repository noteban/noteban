import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Search, Kanban, FileText, Settings, X, Hash, Info } from 'lucide-react';
import { useUIStore } from '../../stores';
import { useTags } from '../../hooks';
import { parseTagFilterExpression, hasTagFilter } from '../../utils/tagFilterParser';
import type { TagFilterOperator } from '../../types/tagFilter';
import { ProfileSwitcher } from './ProfileSwitcher';
import './Header.css';

export function Header() {
  const {
    currentView,
    setView,
    searchQuery,
    setSearchQuery,
    setShowSettings,
    setShowAbout,
    tagFilter,
    setTagFilter,
    setFilterTag,
    addTagToFilter,
    removeTagFromFilter,
    setOperatorAtIndex,
    clearTagFilter,
  } = useUIStore();
  const { allTags, tagCounts } = useTags();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifierKey = isMac ? '⌘' : 'Ctrl';

  const hasActiveFilter = hasTagFilter(tagFilter);

  // Global keyboard shortcut for Ctrl/Cmd+K
  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  // Filter tags based on what's typed after #
  const filteredTags = useMemo(() => {
    if (!searchQuery.includes('#')) return [];
    const hashIndex = searchQuery.lastIndexOf('#');
    const tagQuery = searchQuery.slice(hashIndex + 1).toLowerCase();
    // Filter out tags that are already in the filter
    return allTags
      .filter(tag => tag.toLowerCase().includes(tagQuery))
      .filter(tag => !tagFilter.tags.includes(tag));
  }, [searchQuery, allTags, tagFilter.tags]);

  // Show dropdown when typing # and there are matching tags
  useEffect(() => {
    const hasHash = searchQuery.includes('#');
    setShowTagDropdown(hasHash && filteredTags.length > 0);
    if (hasHash) {
      setSelectedIndex(0);
    }
  }, [searchQuery, filteredTags.length]);

  // Auto-apply multi-tag filter expressions as user types
  useEffect(() => {
    const parsed = parseTagFilterExpression(searchQuery);
    // Only auto-apply if we have 2+ tags (multi-tag expression)
    if (parsed && parsed.tags.length >= 2) {
      setTagFilter(parsed);
      setSearchQuery('');
    }
  }, [searchQuery, setTagFilter, setSearchQuery]);

  // Detect operator from search query
  const detectOperator = (): TagFilterOperator => {
    const upperQuery = searchQuery.toUpperCase();
    if (upperQuery.includes(' OR ') || upperQuery.startsWith('OR ')) {
      return 'OR';
    }
    return 'AND';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showTagDropdown) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, filteredTags.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredTags[selectedIndex]) {
            selectTag(filteredTags[selectedIndex]);
          }
          break;
        case 'Escape':
          setShowTagDropdown(false);
          break;
      }
    } else if (e.key === 'Backspace' && searchQuery === '' && hasActiveFilter) {
      // Remove the last tag when backspacing with empty input
      e.preventDefault();
      const lastTag = tagFilter.tags[tagFilter.tags.length - 1];
      if (lastTag) {
        removeTagFromFilter(lastTag);
      }
    } else if (e.key === 'Enter') {
      // Parse single tag expression on Enter (multi-tag auto-applies)
      const parsed = parseTagFilterExpression(searchQuery);
      if (parsed && parsed.tags.length === 1) {
        if (hasActiveFilter) {
          // Add to existing filter with detected operator
          addTagToFilter(parsed.tags[0], detectOperator());
        } else {
          setTagFilter(parsed);
        }
        setSearchQuery('');
      }
    }
  };

  const selectTag = (tag: string) => {
    if (hasActiveFilter) {
      // Add to existing filter with detected operator
      addTagToFilter(tag, detectOperator());
    } else {
      setFilterTag(tag);
    }
    setSearchQuery('');
    setShowTagDropdown(false);
  };

  const handleClearFilter = () => {
    clearTagFilter();
    setSearchQuery('');
  };

  const handleRemoveTag = (tag: string) => {
    removeTagFromFilter(tag);
  };

  const handleToggleOperator = (index: number) => {
    const currentOp = tagFilter.operators[index];
    setOperatorAtIndex(index, currentOp === 'AND' ? 'OR' : 'AND');
  };

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-logo">Notes</h1>
      </div>

      <div className="header-center">
        <div className="header-search">
          <Search size={16} className="header-search-icon" />
          {hasActiveFilter && (
            <div className="header-filter-badges">
              {tagFilter.tags.map((tag, index) => (
                <span key={tag} className="header-filter-badge-wrapper">
                  {index > 0 && (
                    <button
                      className="header-filter-operator"
                      onClick={() => handleToggleOperator(index - 1)}
                      title={`Click to switch to ${tagFilter.operators[index - 1] === 'AND' ? 'OR' : 'AND'}`}
                    >
                      {tagFilter.operators[index - 1] || 'AND'}
                    </button>
                  )}
                  <span className="header-filter-badge">
                    <Hash size={12} />
                    <span>{tag}</span>
                    <button onClick={() => handleRemoveTag(tag)} title={`Remove ${tag}`}>
                      <X size={12} />
                    </button>
                  </span>
                </span>
              ))}
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            placeholder={hasActiveFilter ? "" : "Search notes or type #tag..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowTagDropdown(false), 150)}
            className="header-search-input"
          />
          {(searchQuery || hasActiveFilter) && (
            <button
              className="header-search-clear"
              onClick={handleClearFilter}
              title="Clear search"
            >
              <X size={16} className="header-search-clear-icon" />
            </button>
          )}
          {!searchQuery && !hasActiveFilter && (
            <kbd className="header-search-shortcut">{modifierKey} K</kbd>
          )}

          {showTagDropdown && (
            <div className="header-search-dropdown">
              {filteredTags.map((tag, index) => (
                <button
                  key={tag}
                  className={`header-search-dropdown-item ${index === selectedIndex ? 'selected' : ''}`}
                  onClick={() => selectTag(tag)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <Hash size={14} />
                  <span className="header-search-dropdown-tag">{tag}</span>
                  <span className="header-search-dropdown-count">{tagCounts.get(tag)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="header-right">
        <ProfileSwitcher />
        <button
          className={`header-view-btn ${currentView === 'notes' ? 'active' : ''}`}
          onClick={() => setView('notes')}
          title="Notes View"
        >
          <FileText size={18} />
        </button>
        <button
          className={`header-view-btn ${currentView === 'kanban' ? 'active' : ''}`}
          onClick={() => setView('kanban')}
          title="Kanban View"
        >
          <Kanban size={18} />
        </button>
        <button
          className="header-settings-btn"
          title="About"
          onClick={() => setShowAbout(true)}
        >
          <Info size={18} />
        </button>
        <button
          className="header-settings-btn"
          title="Settings"
          onClick={() => setShowSettings(true)}
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
