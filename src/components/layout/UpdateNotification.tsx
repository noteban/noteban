import { Download, X, ExternalLink, RefreshCw } from 'lucide-react';
import { useUpdater } from '../../hooks';
import './UpdateNotification.css';

export function UpdateNotification() {
  const {
    updateAvailable,
    isDownloading,
    downloadProgress,
    dismissedVersion,
    isLinux,
    downloadAndInstall,
    openReleasesPage,
    dismissUpdate,
  } = useUpdater();

  if (!updateAvailable || updateAvailable.version === dismissedVersion) {
    return null;
  }

  return (
    <div className="update-notification">
      <div className="update-notification-content">
        <div className="update-notification-icon">
          <Download size={20} />
        </div>
        <div className="update-notification-text">
          <span className="update-notification-title">
            Update Available: v{updateAvailable.version}
          </span>
          <span className="update-notification-subtitle">
            {isLinux
              ? 'Download the latest version from GitHub'
              : 'Click to download and install'}
          </span>
        </div>
      </div>

      <div className="update-notification-actions">
        {isDownloading ? (
          <div className="update-notification-progress">
            <RefreshCw size={16} className="update-notification-spinner" />
            <span>{Math.round(downloadProgress)}%</span>
          </div>
        ) : (
          <>
            {isLinux ? (
              <button
                className="update-notification-btn primary"
                onClick={openReleasesPage}
              >
                <ExternalLink size={14} />
                View Release
              </button>
            ) : (
              <button
                className="update-notification-btn primary"
                onClick={downloadAndInstall}
              >
                <Download size={14} />
                Install
              </button>
            )}
            <button
              className="update-notification-btn dismiss"
              onClick={() => dismissUpdate(updateAvailable.version)}
              title="Dismiss"
            >
              <X size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
