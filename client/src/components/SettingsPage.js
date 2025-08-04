import React, { useState } from 'react';
import { Settings, Download, Folder, Music, Info, Server } from 'lucide-react';

const SettingsPage = () => {
  const [settings, setSettings] = useState({
    defaultQuality: 7,
    embedArtwork: true,
    organizeByArtist: true,
    createAlbumFolders: true
  });

  const qualityOptions = [
    { value: 5, label: 'MP3 320k', description: 'High quality MP3 format' },
    { value: 6, label: 'CD Quality', description: '16-bit/44.1kHz FLAC' },
    { value: 7, label: 'Hi-Res 96kHz', description: '24-bit/96kHz FLAC' },
    { value: 27, label: 'Hi-Res 192kHz', description: '24-bit/192kHz FLAC (Premium)' }
  ];

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    // In a real app, this would save to backend
    console.log('Saving settings:', settings);
    // Show success toast
    alert('Settings saved! Restart the container to apply all changes.');
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure your QuackBus preferences</p>
      </div>

      <div style={{ display: 'grid', gap: '2rem', maxWidth: '800px' }}>
        
        {/* Download Settings */}
        <div className="card">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: '#ffffff' }}>
            <Download size={20} />
            Download Settings
          </h2>
          
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', color: '#ccc', marginBottom: '0.5rem', fontWeight: '600' }}>
                Default Audio Quality
              </label>
              <select 
                value={settings.defaultQuality}
                onChange={(e) => handleSettingChange('defaultQuality', parseInt(e.target.value))}
                className="quality-select"
                style={{ width: '100%', padding: '0.75rem' }}
              >
                {qualityOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p style={{ color: '#888', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                {qualityOptions.find(q => q.value === settings.defaultQuality)?.description}
              </p>
            </div>
          </div>
        </div>

        {/* File Organization Settings */}
        <div className="card">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: '#ffffff' }}>
            <Folder size={20} />
            File Organization
          </h2>
          
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <label style={{ color: '#ccc', fontWeight: '600', display: 'block' }}>
                  Organize by Artist/Album
                </label>
                <p style={{ color: '#888', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  Create folders like "Artist - Album (Year)/"
                </p>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '24px' }}>
                <input
                  type="checkbox"
                  checked={settings.organizeByArtist}
                  onChange={(e) => handleSettingChange('organizeByArtist', e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: settings.organizeByArtist ? '#0ea5e9' : '#ccc',
                  borderRadius: '24px',
                  transition: '0.3s'
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '',
                    height: '18px',
                    width: '18px',
                    left: settings.organizeByArtist ? '29px' : '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.3s'
                  }}></span>
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <label style={{ color: '#ccc', fontWeight: '600', display: 'block' }}>
                  Create Album Folders
                </label>
                <p style={{ color: '#888', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  Group tracks into album-specific folders
                </p>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '24px' }}>
                <input
                  type="checkbox"
                  checked={settings.createAlbumFolders}
                  onChange={(e) => handleSettingChange('createAlbumFolders', e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: settings.createAlbumFolders ? '#0ea5e9' : '#ccc',
                  borderRadius: '24px',
                  transition: '0.3s'
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '',
                    height: '18px',
                    width: '18px',
                    left: settings.createAlbumFolders ? '29px' : '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.3s'
                  }}></span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Metadata Settings */}
        <div className="card">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: '#ffffff' }}>
            <Music size={20} />
            Metadata & Artwork
          </h2>
          
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <label style={{ color: '#ccc', fontWeight: '600', display: 'block' }}>
                  Embed Album Artwork
                </label>
                <p style={{ color: '#888', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  Automatically download and embed cover art in music files
                </p>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '24px' }}>
                <input
                  type="checkbox"
                  checked={settings.embedArtwork}
                  onChange={(e) => handleSettingChange('embedArtwork', e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: settings.embedArtwork ? '#0ea5e9' : '#ccc',
                  borderRadius: '24px',
                  transition: '0.3s'
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '',
                    height: '18px',
                    width: '18px',
                    left: settings.embedArtwork ? '29px' : '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    transition: '0.3s'
                  }}></span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* System Information */}
        <div className="card">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: '#ffffff' }}>
            <Info size={20} />
            System Information
          </h2>
          
          <div style={{ display: 'grid', gap: '1rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>QuackBus Version:</span>
              <span style={{ color: '#ffffff' }}>2.0.0</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Music Directory:</span>
              <span style={{ color: '#ffffff', fontFamily: 'monospace' }}>/app/music</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Temp Directory:</span>
              <span style={{ color: '#ffffff', fontFamily: 'monospace' }}>/app/temp</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Container Status:</span>
              <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                Running
              </span>
            </div>
          </div>
        </div>

        {/* Server Status */}
        <div className="card">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: '#ffffff' }}>
            <Server size={20} />
            System Status
          </h2>
          
          <div style={{ display: 'grid', gap: '1rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Music Service:</span>
              <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                Connected
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>WebSocket:</span>
              <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                Connected
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>FFmpeg:</span>
              <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                Available
              </span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <button 
          onClick={handleSave}
          className="btn btn-primary"
          style={{ padding: '1rem 2rem', fontSize: '1rem' }}
        >
          <Settings size={18} />
          Save Settings
        </button>

        {/* Note */}
        <div style={{ 
          padding: '1rem', 
          background: 'rgba(234, 179, 8, 0.1)', 
          border: '1px solid rgba(234, 179, 8, 0.3)',
          borderRadius: '8px',
          fontSize: '0.9rem',
          color: '#eab308'
        }}>
          <strong>Note:</strong> Some settings require restarting the Docker container to take effect. 
          Changes to file organization will only apply to new downloads.
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
