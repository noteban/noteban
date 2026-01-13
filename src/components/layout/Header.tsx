import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Search, Kanban, FileText, Settings, X, Hash } from 'lucide-react';
import { useUIStore } from '../../stores';
import { useTags } from '../../hooks';
import './Header.css';

export function Header() {
  const { currentView, setView, searchQuery, setSearchQuery, setShowSettings, filterTag, setFilterTag, clearTagFilter } = useUIStore();
  const { allTags, tagCounts } = useTags();
  const inputRef = useRef<HTMLInputElement>(null);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

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
    return allTags.filter(tag => tag.toLowerCase().includes(tagQuery));
  }, [searchQuery, allTags]);

  // Show dropdown when typing # and there are matching tags
  useEffect(() => {
    const hasHash = searchQuery.includes('#');
    setShowTagDropdown(hasHash && filteredTags.length > 0);
    if (hasHash) {
      setSelectedIndex(0);
    }
  }, [searchQuery, filteredTags.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showTagDropdown) return;

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
  };

  const selectTag = (tag: string) => {
    setFilterTag(tag);
    setSearchQuery('');
    setShowTagDropdown(false);
  };

  const handleClearFilter = () => {
    clearTagFilter();
    setSearchQuery('');
  };

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-logo">Notes</h1>
      </div>

      <div className="header-center">
        <div className="header-search">
          <Search size={16} className="header-search-icon" />
          {filterTag && (
            <div className="header-filter-badge">
              <Hash size={12} />
              <span>{filterTag}</span>
              <button onClick={handleClearFilter} title="Clear filter">
                <X size={12} />
              </button>
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            placeholder={filterTag ? "Search within filter..." : "Search notes... (Ctrl+K)"}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowTagDropdown(false), 150)}
            className="header-search-input"
          />
          {(searchQuery || filterTag) && (
            <button
              className="header-search-clear"
              onClick={handleClearFilter}
              title="Clear search"
            >
              <X size={16} className="header-search-clear-icon" />
            </button>
          )}
          {!searchQuery && !filterTag && (
            <kbd className="header-search-shortcut">Ctrl K</kbd>
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
          title="Settings"
          onClick={() => setShowSettings(true)}
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
