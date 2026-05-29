import { useEffect, useRef, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { useUIStore } from '../../stores';
import { useUpdater } from '../../hooks';
import { openExternalUrl } from '../../utils/externalOpen';
import appIcon from '../../../src-tauri/icons/128x128.png';
import './AboutModal.css';

// Official GitHub mark from Octicons (primer/octicons, MIT licensed)
function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
    </svg>
  );
}

const APP_NAME = 'Noteban';
const GITHUB_URL = 'https://github.com/noteban/noteban';

export function AboutModal() {
  const { showAbout, setShowAbout } = useUIStore();
  const { checkForUpdates, isChecking, updateAvailable, isUpdateSupported } = useUpdater();
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
    await openExternalUrl(GITHUB_URL);
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
            <img src={appIcon} alt="Noteban" className="about-app-icon" />
            <h3 className="about-app-name">{APP_NAME}</h3>
            <p className="about-app-version">Version {version}</p>
          </div>

          <div className="about-description">
            <p>A notes-first app with kanban organization.</p>
            <p>Built with Tauri, React, and TypeScript.</p>
          </div>

          {isUpdateSupported && (
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
          )}

          <div className="about-links">
            <button className="about-link-btn" onClick={handleOpenGitHub}>
              <GitHubIcon size={16} />
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
