import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { History, Music, Download, CheckCircle, AlertCircle, Folder, Clock } from 'lucide-react';

const HistoryPage = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, completed, failed
  const [sortBy, setSortBy] = useState('newest'); // newest, oldest, title

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await axios.get('/api/history');
      setHistory(response.data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const formatDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return null;
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = Math.abs(end - start) / 1000; // seconds
    
    if (duration < 60) return `${Math.round(duration)}s`;
    const minutes = Math.floor(duration / 60);
    const seconds = Math.round(duration % 60);
    return `${minutes}m ${seconds}s`;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} style={{ color: '#10b981' }} />;
      case 'failed':
        return <AlertCircle size={16} style={{ color: '#ef4444' }} />;
      default:
        return <Clock size={16} style={{ color: '#888' }} />;
    }
  };

  const filteredHistory = history.filter(item => {
    if (filter === 'completed') return item.status === 'completed';
    if (filter === 'failed') return item.status === 'failed';
    return true;
  });

  const sortedHistory = [...filteredHistory].sort((a, b) => {
    switch (sortBy) {
      case 'oldest':
        return new Date(a.startTime) - new Date(b.startTime);
      case 'title':
        return (a.title || '').localeCompare(b.title || '');
      case 'newest':
      default:
        return new Date(b.startTime) - new Date(a.startTime);
    }
  });

  const groupedHistory = sortedHistory.reduce((groups, item) => {
    const date = formatDate(item.startTime);
    if (!groups[date]) groups[date] = [];
    groups[date].push(item);
    return groups;
  }, {});

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Download History</h1>
          <p className="page-subtitle">Your download history and statistics</p>
        </div>
        <div className="loading">
          <div className="spinner"></div>
          Loading history...
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Download History</h1>
        <p className="page-subtitle">
          Your download history and statistics • {history.length} total downloads
        </p>
      </div>

      {history.length > 0 && (
        <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="quality-selector">
            <label style={{ color: '#888', marginRight: '0.5rem' }}>Filter:</label>
            <select 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="quality-select"
            >
              <option value="all">All Downloads</option>
              <option value="completed">Completed Only</option>
              <option value="failed">Failed Only</option>
            </select>
          </div>

          <div className="quality-selector">
            <label style={{ color: '#888', marginRight: '0.5rem' }}>Sort by:</label>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="quality-select"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="title">Title A-Z</option>
            </select>
          </div>
        </div>
      )}

      {Object.keys(groupedHistory).length > 0 ? (
        <div>
          {Object.entries(groupedHistory).map(([date, items]) => (
            <div key={date} style={{ marginBottom: '2rem' }}>
              <h3 style={{ 
                color: '#0ea5e9', 
                marginBottom: '1rem',
                fontSize: '1.1rem',
                fontWeight: '600'
              }}>
                {date} ({items.length})
              </h3>
              
              {items.map((item) => (
                <div key={item.id} className="card download-item">
                  <div className="download-info">
                    <div className="download-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {item.type === 'album' ? <Music size={16} /> : <Download size={16} />}
                      {item.title || 'Unknown Title'}
                    </div>
                    
                    {item.artist && (
                      <div style={{ color: '#0ea5e9', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                        {item.artist}
                      </div>
                    )}
                    
                    <div className="download-status" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {getStatusIcon(item.status)}
                        {item.status === 'completed' ? 'Completed' : 'Failed'}
                      </span>
                      
                      {item.quality && (
                        <span style={{ color: '#888', fontSize: '0.9rem' }}>
                          {item.quality}
                        </span>
                      )}
                      
                      {formatDuration(item.startTime, item.endTime) && (
                        <span style={{ color: '#888', fontSize: '0.9rem' }}>
                          {formatDuration(item.startTime, item.endTime)}
                        </span>
                      )}
                      
                      <span style={{ color: '#666', fontSize: '0.8rem' }}>
                        {new Date(item.startTime).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                  
                  <div className="download-actions">
                    {item.status === 'completed' && item.filePath && (
                      <button 
                        className="btn btn-secondary"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                        title="File location"
                      >
                        <Folder size={14} />
                        Saved
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <History size={48} style={{ color: '#555', marginBottom: '1rem' }} />
          <h3>No download history</h3>
          <p>Your completed and failed downloads will appear here.</p>
          <p style={{ marginTop: '0.5rem' }}>
            <a href="/search" style={{ color: '#0ea5e9', textDecoration: 'none' }}>
              Start downloading music →
            </a>
          </p>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ 
          marginTop: '2rem', 
          padding: '1rem', 
          background: 'rgba(255, 255, 255, 0.05)', 
          borderRadius: '8px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          fontSize: '0.9rem'
        }}>
          <div>
            <strong style={{ color: '#0ea5e9' }}>Total Downloads:</strong>
            <div>{history.length}</div>
          </div>
          <div>
            <strong style={{ color: '#10b981' }}>Completed:</strong>
            <div>{history.filter(h => h.status === 'completed').length}</div>
          </div>
          <div>
            <strong style={{ color: '#ef4444' }}>Failed:</strong>
            <div>{history.filter(h => h.status === 'failed').length}</div>
          </div>
          <div>
            <strong style={{ color: '#888' }}>Success Rate:</strong>
            <div>
              {history.length > 0 
                ? Math.round((history.filter(h => h.status === 'completed').length / history.length) * 100)
                : 0
              }%
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
