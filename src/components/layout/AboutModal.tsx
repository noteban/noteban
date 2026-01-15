import { useEffect, useRef, useState } from 'react';
import { X, Github, ExternalLink } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import { useUIStore } from '../../stores';
import { useUpdater } from '../../hooks';
import appIcon from '../../../src-tauri/icons/128x128.png';
import './AboutModal.css';

const APP_NAME = 'Notes Kanban';
const GITHUB_URL = 'https://github.com/i-doll/note-kanban';

export function AboutModal() {
  const { showAbout, setShowAbout } = useUIStore();
  const { checkForUpdates, isChecking, updateAvailable } = useUpdater();
  const modalRef = useRef<HTMLDivElement>(null);
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion('Unknown'));
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAbout(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowAbout(false);
      }
    };

    if (showAbout) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAbout, setShowAbout]);

  const handleOpenGitHub = async () => {
    await open(GITHUB_URL);
  };

  if (!showAbout) return null;

  return (
    <div className="about-overlay">
      <div className="about-modal" ref={modalRef}>
        <div className="about-header">
          <h2>About</h2>
          <button
            className="about-close-btn"
            onClick={() => setShowAbout(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="about-content">
          <div className="about-app-info">
            <img src={appIcon} alt="Notes Kanban" className="about-app-icon" />
            <h3 className="about-app-name">{APP_NAME}</h3>
            <p className="about-app-version">Version {version}</p>
          </div>

          <div className="about-description">
            <p>A notes-first app with kanban organization.</p>
            <p>Built with Tauri, React, and TypeScript.</p>
          </div>

          <div className="about-update-section">
            {updateAvailable ? (
              <div className="about-update-available">
                <span>Update available: v{updateAvailable.version}</span>
              </div>
            ) : (
              <button
                className="about-check-update-btn"
                onClick={checkForUpdates}
                disabled={isChecking}
              >
                {isChecking ? 'Checking...' : 'Check for Updates'}
              </button>
            )}
          </div>

          <div className="about-links">
            <button className="about-link-btn" onClick={handleOpenGitHub}>
              <Github size={16} />
              <span>View on GitHub</span>
              <ExternalLink size={12} />
            </button>
          </div>

          <div className="about-footer">
            <p className="about-copyright">MIT License</p>
          </div>
        </div>
      </div>
    </div>
  );
}
