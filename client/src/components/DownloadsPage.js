import React from 'react';
import { Download, X, Music, Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react';

const DownloadsPage = ({ downloads, onCancel }) => {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'downloading':
        return <Loader size={16} className="spinner" />;
      case 'processing':
        return <Loader size={16} className="spinner" />;
      case 'completed':
        return <CheckCircle size={16} style={{ color: '#10b981' }} />;
      case 'failed':
        return <AlertCircle size={16} style={{ color: '#ef4444' }} />;
      case 'cancelled':
        return <X size={16} style={{ color: '#888' }} />;
      default:
        return <Clock size={16} style={{ color: '#888' }} />;
    }
  };

  const getStatusText = (download) => {
    switch (download.status) {
      case 'queued':
        return 'Queued';
      case 'downloading':
        if (download.type === 'album') {
          return `Downloading (${download.completedTracks || 0}/${download.totalTracks || 0} tracks)`;
        }
        return `Downloading (${download.progress || 0}%)`;
      case 'processing':
        return 'Processing metadata...';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  const formatElapsedTime = (startTime) => {
    const start = new Date(startTime);
    const now = new Date();
    const elapsed = Math.floor((now - start) / 1000);
    
    if (elapsed < 60) return `${elapsed}s`;
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Downloads</h1>
        <p className="page-subtitle">
          Active downloads and queue status
          {downloads.queue > 0 && (
            <span style={{ color: '#0ea5e9', marginLeft: '0.5rem' }}>
              • {downloads.queue} in queue
            </span>
          )}
        </p>
      </div>

      {downloads.active && downloads.active.length > 0 ? (
        <div>
          <h2 style={{ marginBottom: '1rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download size={20} />
            Active Downloads ({downloads.active.length})
          </h2>
          
          {downloads.active.map((download) => (
            <div key={download.id} className="card download-item">
              <div className="download-info">
                <div className="download-title">
                  {download.title || 'Unknown Title'}
                </div>
                <div className="download-status" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {getStatusIcon(download.status)}
                  <span>{getStatusText(download)}</span>
                  {download.startTime && (
                    <span style={{ color: '#666' }}>
                      • {formatElapsedTime(download.startTime)}
                    </span>
                  )}
                </div>
                
                {download.artist && (
                  <div style={{ color: '#0ea5e9', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    {download.artist}
                  </div>
                )}
                
                {(download.status === 'downloading' || download.status === 'processing') && (
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${download.progress || 0}%` }}
                    ></div>
                  </div>
                )}
                
                {download.type === 'album' && download.totalTracks && (
                  <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>
                    Track progress: {download.completedTracks || 0} / {download.totalTracks}
                  </div>
                )}
              </div>
              
              <div className="download-actions">
                {(download.status === 'queued' || download.status === 'downloading') && (
                  <button 
                    onClick={() => onCancel(download.id)}
                    className="btn btn-danger"
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    <X size={14} />
                    Cancel
                  </button>
                )}
                
                {download.status === 'failed' && (
                  <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>
                    {download.error || 'Download failed'}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {downloads.maxConcurrent && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '1rem', 
              background: 'rgba(14, 165, 233, 0.1)', 
              borderRadius: '8px',
              fontSize: '0.9rem',
              color: '#0ea5e9'
            }}>
              ℹ️ Maximum {downloads.maxConcurrent} concurrent downloads allowed
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <Download size={48} style={{ color: '#555', marginBottom: '1rem' }} />
          <h3>No active downloads</h3>
          <p>Your downloads will appear here when you start downloading music.</p>
          <p style={{ marginTop: '0.5rem' }}>
            <a href="/search" style={{ color: '#0ea5e9', textDecoration: 'none' }}>
              Go to Search →
            </a>
          </p>
        </div>
      )}
    </div>
  );
};

export default DownloadsPage;
