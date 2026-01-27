import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Search, Kanban, FileText, Settings, X, Hash, Info, Minus, Square, Copy } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useUIStore, useSettingsStore } from '../../stores';
import { useTags } from '../../hooks';
import { parseTagFilterExpression, hasTagFilter } from '../../utils/tagFilterParser';
import type { TagFilterOperator } from '../../types/tagFilter';
import { ProfileSwitcher } from './ProfileSwitcher';
import { isMac, modifierKey } from '../../utils/platform';
import './Header.css';

const appWindow = getCurrentWindow();

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
  const { root } = useSettingsStore();
  const { allTags, tagCounts } = useTags();
  const inputRef = useRef<HTMLInputElement>(null);
  const badgesRef = useRef<HTMLDivElement>(null);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusedTagIndex, setFocusedTagIndex] = useState<number | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  // Track window maximized state
  useEffect(() => {
    const checkMaximized = async () => {
      setIsMaximized(await appWindow.isMaximized());
    };
    checkMaximized();
    const unlisten = appWindow.onResized(checkMaximized);
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const handleMinimize = () => appWindow.minimize();
  const handleToggleMaximize = () => appWindow.toggleMaximize();
  const handleClose = () => appWindow.close();

  const hasActiveFilter = hasTagFilter(tagFilter);

  // Reset focused tag when filter changes - derived during render
  const [prevTagsLength, setPrevTagsLength] = useState(tagFilter.tags.length);
  if (tagFilter.tags.length !== prevTagsLength) {
    setPrevTagsLength(tagFilter.tags.length);
    if (focusedTagIndex !== null && focusedTagIndex >= tagFilter.tags.length) {
      setFocusedTagIndex(tagFilter.tags.length > 0 ? tagFilter.tags.length - 1 : null);
    }
  }

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

  // Track previous values to derive dropdown state during render (React-recommended pattern)
  const [prevDropdownDeps, setPrevDropdownDeps] = useState({ query: searchQuery, tagsLen: filteredTags.length });
  
  // Show dropdown when typing # and there are matching tags - derived during render
  const hasHash = searchQuery.includes('#');
  if (searchQuery !== prevDropdownDeps.query || filteredTags.length !== prevDropdownDeps.tagsLen) {
    setPrevDropdownDeps({ query: searchQuery, tagsLen: filteredTags.length });
    setShowTagDropdown(hasHash && filteredTags.length > 0);
    if (hasHash && searchQuery !== prevDropdownDeps.query) {
      setSelectedIndex(0);
    }
  }

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
    // Handle dropdown navigation
    if (showTagDropdown) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, filteredTags.length - 1));
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          return;
        case 'Enter':
          e.preventDefault();
          if (filteredTags[selectedIndex]) {
            selectTag(filteredTags[selectedIndex]);
          }
          return;
        case 'Escape':
          setShowTagDropdown(false);
          return;
      }
    }

    const input = inputRef.current;
    const isAtStart = input?.selectionStart === 0 && input?.selectionEnd === 0;
    const tagsCount = tagFilter.tags.length;

    // Handle navigation when a tag is focused
    if (focusedTagIndex !== null) {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (focusedTagIndex > 0) {
            setFocusedTagIndex(focusedTagIndex - 1);
            scrollTagIntoView(focusedTagIndex - 1);
          }
          return;
        case 'ArrowRight':
          e.preventDefault();
          if (focusedTagIndex < tagsCount - 1) {
            setFocusedTagIndex(focusedTagIndex + 1);
            scrollTagIntoView(focusedTagIndex + 1);
          } else {
            // Move to input
            setFocusedTagIndex(null);
            inputRef.current?.focus();
          }
          return;
        case 'Backspace':
        case 'Delete':
          {
            e.preventDefault();
            const tagToRemove = tagFilter.tags[focusedTagIndex];
            const newIndex = focusedTagIndex > 0 ? focusedTagIndex - 1 : (tagsCount > 1 ? 0 : null);
            removeTagFromFilter(tagToRemove);
            setFocusedTagIndex(newIndex);
            if (newIndex === null) {
              inputRef.current?.focus();
            }
            return;
          }
        default:
          // Any other key returns focus to input
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            setFocusedTagIndex(null);
            inputRef.current?.focus();
          }
          return;
      }
    }

    // Handle navigation from input to tags
    if (e.key === 'ArrowLeft' && isAtStart && hasActiveFilter && tagsCount > 0) {
      e.preventDefault();
      setFocusedTagIndex(tagsCount - 1);
      scrollTagIntoView(tagsCount - 1);
      return;
    }

    // Backspace at start of input with tags - focus last tag
    if (e.key === 'Backspace' && searchQuery === '' && hasActiveFilter && tagsCount > 0) {
      e.preventDefault();
      setFocusedTagIndex(tagsCount - 1);
      scrollTagIntoView(tagsCount - 1);
      return;
    }

    // Enter to add tag
    if (e.key === 'Enter') {
      const parsed = parseTagFilterExpression(searchQuery);
      if (parsed && parsed.tags.length === 1) {
        if (hasActiveFilter) {
          addTagToFilter(parsed.tags[0], detectOperator());
        } else {
          setTagFilter(parsed);
        }
        setSearchQuery('');
      }
    }
  };

  const scrollTagIntoView = (index: number) => {
    if (badgesRef.current) {
      const badges = badgesRef.current.querySelectorAll('.header-filter-badge');
      if (badges[index]) {
        badges[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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
    <header className="header" {...(!isMac && !root.useNativeDecorations && { 'data-tauri-drag-region': true })}>
      <div className="header-left">
        <h1 className="header-logo">Notes</h1>
      </div>

      <div className="header-center">
        <div className="header-search" onClick={() => inputRef.current?.focus()}>
          <Search size={16} className="header-search-icon" />
          <div className="header-search-field" ref={badgesRef}>
            {hasActiveFilter && tagFilter.tags.map((tag, index) => (
              <span key={tag} className="header-filter-badge-wrapper">
                {index > 0 && (
                  <button
                    className="header-filter-operator"
                    onClick={(e) => { e.stopPropagation(); handleToggleOperator(index - 1); }}
                    title={`Click to switch to ${tagFilter.operators[index - 1] === 'AND' ? 'OR' : 'AND'}`}
                  >
                    {tagFilter.operators[index - 1] || 'AND'}
                  </button>
                )}
                <span
                  className={`header-filter-badge ${focusedTagIndex === index ? 'focused' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFocusedTagIndex(index);
                    inputRef.current?.focus();
                  }}
                >
                  <Hash size={12} />
                  <span title={tag}>{tag}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag); }} title={`Remove ${tag}`}>
                    <X size={12} />
                  </button>
                </span>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              placeholder={hasActiveFilter ? "Add more tags..." : "Search notes or type #tag..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocusedTagIndex(null)}
              onClick={(e) => { e.stopPropagation(); setFocusedTagIndex(null); }}
              onBlur={() => {
                setTimeout(() => {
                  setShowTagDropdown(false);
                  setFocusedTagIndex(null);
                }, 150);
              }}
              className="header-search-input"
            />
          </div>
          {(searchQuery || hasActiveFilter) && (
            <button
              className="header-search-clear"
              onClick={(e) => { e.stopPropagation(); handleClearFilter(); }}
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
        {!isMac && !root.useNativeDecorations && (
          <div className="window-controls">
            <button
              className="window-control-btn"
              onClick={handleMinimize}
              title="Minimize"
            >
              <Minus size={16} />
            </button>
            <button
              className="window-control-btn"
              onClick={handleToggleMaximize}
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Copy size={14} /> : <Square size={14} />}
            </button>
            <button
              className="window-control-btn close"
              onClick={handleClose}
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
