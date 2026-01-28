import { useState, useRef, useEffect } from 'react';
import { ChevronDown, User, Plus, Check, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../../stores';
import { debugLog } from '../../utils/debugLogger';
import './ProfileSwitcher.css';

export function ProfileSwitcher() {
  const { root, switchProfile, createProfile } = useSettingsStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProfile = root.profiles.find(p => p.id === root.activeProfileId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSwitchProfile = (id: string) => {
    switchProfile(id);
    setIsOpen(false);
  };

  const handleCreateProfile = () => {
    const name = `Profile ${root.profiles.length + 1}`;
    const newId = createProfile(name);
    switchProfile(newId);
    setIsOpen(false);
  };

  const handleOpenInNewWindow = async (e: React.MouseEvent, profileId: string) => {
    e.stopPropagation();
    try {
      await invoke('open_profile_in_new_window', { profileId });
      setIsOpen(false);
    } catch (error) {
      debugLog.error('Failed to open profile in new window:', error);
    }
  };

  return (
    <div className="profile-switcher" ref={dropdownRef}>
      <button
        className="profile-switcher-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <User size={16} className="profile-switcher-icon" />
        <span className="profile-switcher-name">
          {activeProfile?.name || 'Select Profile'}
        </span>
        <ChevronDown
          size={14}
          className={`profile-switcher-chevron ${isOpen ? 'open' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="profile-switcher-dropdown" role="listbox">
          <div className="profile-switcher-list">
            {root.profiles.map((profile) => (
              <div
                key={profile.id}
                className={`profile-switcher-item ${
                  profile.id === root.activeProfileId ? 'active' : ''
                }`}
              >
                <button
                  className="profile-switcher-item-main"
                  onClick={() => handleSwitchProfile(profile.id)}
                  role="option"
                  aria-selected={profile.id === root.activeProfileId}
                >
                  <span className="profile-switcher-item-name">{profile.name}</span>
                  {profile.id === root.activeProfileId && (
                    <Check size={14} className="profile-switcher-item-check" />
                  )}
                </button>
                {profile.id !== root.activeProfileId && (
                  <button
                    className="profile-switcher-item-external"
                    title="Open in new window"
                    onClick={(e) => handleOpenInNewWindow(e, profile.id)}
                  >
                    <ExternalLink size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="profile-switcher-divider" />

          <button
            className="profile-switcher-add"
            onClick={handleCreateProfile}
          >
            <Plus size={14} />
            <span>New Profile</span>
          </button>
        </div>
      )}
    </div>
  );
}
