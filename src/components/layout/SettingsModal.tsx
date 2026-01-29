import { useEffect, useRef, useState } from 'react';
import { X, FolderOpen, Trash2, Edit2, Copy, Plus, ExternalLink, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore, useUIStore } from '../../stores';
import { setWindowTitle } from '../../utils/windowTitle';
import { debugLog } from '../../utils/debugLogger';
import { isLinux } from '../../utils/platform';
import { OllamaService } from '../../services/ollamaService';
import './SettingsModal.css';

export function SettingsModal() {
  const {
    settings,
    root,
    setNotesDirectory,
    setEditorFontSize,
    setAutoSaveDelay,
    createProfile,
    renameProfile,
    deleteProfile,
    switchProfile,
    setDisableUpdateChecks,
    setEnableDebugLogging,
    setUseNativeDecorations,
    setAIEnabled,
    setAIServerUrl,
    setAISelectedModel,
  } = useSettingsStore();
  const { showSettings, setShowSettings } = useUIStore();
  const modalRef = useRef<HTMLDivElement>(null);

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // AI settings state
  const [models, setModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSettings(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings, setShowSettings]);

  // Load AI models when enabled or URL changes
  useEffect(() => {
    if (settings.ai.enabled && showSettings) {
      loadModels();
    }
  }, [settings.ai.enabled, settings.ai.serverUrl, showSettings]);

  const loadModels = async () => {
    setIsLoadingModels(true);
    try {
      const modelList = await OllamaService.listModels(settings.ai.serverUrl);
      const modelNames = modelList.map((m) => m.name);
      setModels(modelNames);
      setConnectionStatus('connected');

      // Auto-select first model if none selected
      if (!settings.ai.selectedModel && modelNames.length > 0) {
        setAISelectedModel(modelNames[0]);
      }
    } catch (error) {
      debugLog.error('Failed to load Ollama models:', error);
      setModels([]);
      setConnectionStatus('error');
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSelectFolder = async () => {
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
      debugLog.error('Failed to select folder:', error);
    }
  };

  const handleStartRename = (id: string, currentName: string) => {
    setEditingProfileId(id);
    setEditingName(currentName);
  };

  const handleSaveRename = () => {
    if (editingProfileId && editingName.trim()) {
      renameProfile(editingProfileId, editingName.trim());
      // Update window title immediately if renaming the active profile
      if (editingProfileId === root.activeProfileId) {
        setWindowTitle(editingName.trim(), root.profiles.length > 1);
      }
    }
    setEditingProfileId(null);
    setEditingName('');
  };

  const handleDeleteProfile = (id: string) => {
    deleteProfile(id);
    setShowDeleteConfirm(null);
  };

  const handleDuplicateProfile = (id: string) => {
    const source = root.profiles.find(p => p.id === id);
    if (source) {
      const newId = createProfile(`${source.name} (Copy)`, id);
      switchProfile(newId);
    }
  };

  const handleCreateProfile = () => {
    const name = `Profile ${root.profiles.length + 1}`;
    const newId = createProfile(name);
    switchProfile(newId);
    handleStartRename(newId, name);
  };

  const handleOpenInNewWindow = async (profileId: string) => {
    try {
      await invoke('open_profile_in_new_window', { profileId });
    } catch (error) {
      debugLog.error('Failed to open profile in new window:', error);
    }
  };

  if (!showSettings) return null;

  const activeProfile = root.profiles.find(p => p.id === root.activeProfileId);

  return (
    <div className="settings-overlay">
      <div className="settings-modal" ref={modalRef}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button
            className="settings-close-btn"
            onClick={() => setShowSettings(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <h3>Profiles</h3>
            <div className="settings-profiles-list">
              {root.profiles.map((profile) => (
                <div
                  key={profile.id}
                  className={`settings-profile-item ${
                    profile.id === root.activeProfileId ? 'active' : ''
                  }`}
                >
                  {editingProfileId === profile.id ? (
                    <input
                      type="text"
                      className="settings-profile-name-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={handleSaveRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename();
                        if (e.key === 'Escape') {
                          setEditingProfileId(null);
                          setEditingName('');
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      className="settings-profile-name"
                      onClick={() => switchProfile(profile.id)}
                    >
                      {profile.name}
                      {profile.id === root.activeProfileId && (
                        <span className="settings-profile-active-badge">Active</span>
                      )}
                    </button>
                  )}

                  <div className="settings-profile-actions">
                    <button
                      title="Open in new window"
                      onClick={() => handleOpenInNewWindow(profile.id)}
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button
                      title="Rename"
                      onClick={() => handleStartRename(profile.id, profile.name)}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      title="Duplicate"
                      onClick={() => handleDuplicateProfile(profile.id)}
                    >
                      <Copy size={14} />
                    </button>
                    {root.profiles.length > 1 && (
                      <button
                        title="Delete"
                        className="settings-profile-delete"
                        onClick={() => setShowDeleteConfirm(profile.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {showDeleteConfirm === profile.id && (
                    <div className="settings-profile-delete-confirm">
                      <span>Delete "{profile.name}"?</span>
                      <button onClick={() => handleDeleteProfile(profile.id)}>
                        Yes
                      </button>
                      <button onClick={() => setShowDeleteConfirm(null)}>
                        No
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              className="settings-profile-add"
              onClick={handleCreateProfile}
            >
              <Plus size={14} />
              Add Profile
            </button>
          </div>

          <div className="settings-section">
            <h3>Storage {activeProfile && root.profiles.length > 1 ? `(${activeProfile.name})` : ''}</h3>
            <div className="settings-field">
              <label>Notes Directory</label>
              <div className="settings-folder-input">
                <input
                  type="text"
                  value={settings.notesDirectory || 'Not set'}
                  readOnly
                />
                <button onClick={handleSelectFolder}>
                  <FolderOpen size={16} />
                  Browse
                </button>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>Editor</h3>
            <div className="settings-field">
              <label>Font Size</label>
              <div className="settings-range">
                <input
                  type="range"
                  min="12"
                  max="24"
                  value={settings.editorFontSize}
                  onChange={(e) => setEditorFontSize(Number(e.target.value))}
                />
                <span>{settings.editorFontSize}px</span>
              </div>
            </div>
            <div className="settings-field">
              <label>Auto-save Delay</label>
              <div className="settings-range">
                <input
                  type="range"
                  min="500"
                  max="5000"
                  step="500"
                  value={settings.autoSaveDelay}
                  onChange={(e) => setAutoSaveDelay(Number(e.target.value))}
                />
                <span>{settings.autoSaveDelay}ms</span>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>Advanced</h3>
            <div className="settings-field">
              <div className="settings-toggle-row">
                <span>Disable Update Checks</span>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={root.disableUpdateChecks}
                    onChange={(e) => setDisableUpdateChecks(e.target.checked)}
                  />
                  <span className="settings-toggle-track"></span>
                </label>
              </div>
              <p className="settings-field-hint">
                Prevent automatic checking for app updates on startup
              </p>
            </div>
            <div className="settings-field">
              <div className="settings-toggle-row">
                <span>Enable Debug Logging</span>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={root.enableDebugLogging}
                    onChange={(e) => setEnableDebugLogging(e.target.checked)}
                  />
                  <span className="settings-toggle-track"></span>
                </label>
              </div>
              <p className="settings-field-hint">
                Write verbose debug information to a log file
              </p>
            </div>
            {isLinux && (
              <div className="settings-field">
                <div className="settings-toggle-row">
                  <span>Use Native Window Decorations</span>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={root.useNativeDecorations}
                      onChange={(e) => setUseNativeDecorations(e.target.checked)}
                    />
                    <span className="settings-toggle-track"></span>
                  </label>
                </div>
                <p className="settings-field-hint">
                  Hide the drag bar and window controls when using a tiling window manager
                </p>
              </div>
            )}
          </div>

          <div className="settings-section">
            <h3>AI Tag Suggestions</h3>

            <div className="settings-field">
              <div className="settings-toggle-row">
                <span>Enable AI Tag Suggestions</span>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.ai.enabled}
                    onChange={(e) => setAIEnabled(e.target.checked)}
                  />
                  <span className="settings-toggle-track"></span>
                </label>
              </div>
              <p className="settings-field-hint">
                Use a local Ollama server to suggest tags for your notes
              </p>
            </div>

            {settings.ai.enabled && (
              <>
                <div className="settings-field">
                  <label>Ollama Server URL</label>
                  <div className="settings-ollama-url">
                    <input
                      type="text"
                      value={settings.ai.serverUrl}
                      onChange={(e) => setAIServerUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                    />
                    <button
                      onClick={loadModels}
                      disabled={isLoadingModels}
                      className="settings-refresh-btn"
                      title="Refresh models"
                    >
                      <RefreshCw size={16} className={isLoadingModels ? 'spinning' : ''} />
                    </button>
                    {connectionStatus === 'connected' && (
                      <CheckCircle2 size={16} className="settings-status-ok" />
                    )}
                    {connectionStatus === 'error' && (
                      <XCircle size={16} className="settings-status-error" />
                    )}
                  </div>
                </div>

                <div className="settings-field">
                  <label>Model</label>
                  <select
                    value={settings.ai.selectedModel}
                    onChange={(e) => setAISelectedModel(e.target.value)}
                    disabled={models.length === 0}
                    className="settings-select"
                  >
                    {models.length === 0 ? (
                      <option value="">No models available</option>
                    ) : (
                      models.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="settings-field-hint">
                    {connectionStatus === 'error'
                      ? 'Could not connect to Ollama server'
                      : 'Select a model for generating tag suggestions'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
