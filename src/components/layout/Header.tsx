import { Search, Kanban, FileText, Settings } from 'lucide-react';
import { useUIStore } from '../../stores';
import './Header.css';

export function Header() {
  const { currentView, setView, searchQuery, setSearchQuery, setShowSettings } = useUIStore();

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-logo">Notes</h1>
      </div>

      <div className="header-center">
        <div className="header-search">
          <Search size={16} className="header-search-icon" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="header-search-input"
          />
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
