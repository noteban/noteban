import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Layout } from './components/layout';
import { MarkdownEditor } from './components/editor';
import { KanbanBoard } from './components/kanban';
import { useNotesStore } from './stores/notesStore';
import { useSettingsStore } from './stores/settingsStore';
import { useUIStore } from './stores/uiStore';
import './styles/globals.css';

function App() {
  const { loadNotes } = useNotesStore();
  const { settings, setNotesDirectory } = useSettingsStore();
  const { currentView } = useUIStore();
  const [isSelectingFolder, setIsSelectingFolder] = useState(false);

  useEffect(() => {
    if (settings.notesDirectory) {
      loadNotes(settings.notesDirectory);
    }
  }, [settings.notesDirectory, loadNotes]);

  const handleSelectFolder = async () => {
    setIsSelectingFolder(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Notes Folder',
      });
      if (selected && typeof selected === 'string') {
        setNotesDirectory(selected);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    } finally {
      setIsSelectingFolder(false);
    }
  };

  if (!settings.notesDirectory) {
    return (
      <div className="app-setup">
        <div className="app-setup-content">
          <h1 className="app-setup-title">Welcome to Notes</h1>
          <p className="app-setup-description">
            Select a folder where your notes will be stored as markdown files.
          </p>
          <button
            className="app-setup-button"
            onClick={handleSelectFolder}
            disabled={isSelectingFolder}
          >
            {isSelectingFolder ? 'Selecting...' : 'Choose Notes Folder'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      {currentView === 'notes' ? (
        <MarkdownEditor />
      ) : (
        <KanbanBoard />
      )}
    </Layout>
  );
}

export default App;
