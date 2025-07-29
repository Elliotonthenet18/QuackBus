import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';

// Components
import Header from './components/Header';
import SearchPage from './components/SearchPage';
import DownloadsPage from './components/DownloadsPage';
import HistoryPage from './components/HistoryPage';
import SettingsPage from './components/SettingsPage';
import AlbumDetailPage from './components/AlbumDetailPage';
import Toast from './components/Toast';

// WebSocket connection for real-time updates
let ws = null;

function App() {
  const [downloads, setDownloads] = useState({ active: [], queue: 0 });
  const [toast, setToast] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initialize WebSocket connection
    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    connectWebSocket();

    // Fetch initial download status
    fetchDownloadStatus();

    // Cleanup on unmount
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const handleWebSocketMessage = (data) => {
    if (data.type === 'download_update') {
      setDownloads(prev => {
        const updated = { ...prev };
        const activeIndex = updated.active.findIndex(d => d.id === data.data.id);
        
        if (activeIndex !== -1) {
          updated.active[activeIndex] = { ...updated.active[activeIndex], ...data.data };
          
          // Remove completed or failed downloads after a delay
          if (data.data.status === 'completed' || data.data.status === 'failed') {
            setTimeout(() => {
              setDownloads(current => ({
                ...current,
                active: current.active.filter(d => d.id !== data.data.id)
              }));
            }, 5000);
            
            // Show completion toast
            showToast(
              data.data.status === 'completed' 
                ? 'Download completed successfully!' 
                : `Download failed: ${data.data.error}`,
              data.data.status === 'completed' ? 'success' : 'error'
            );
          }
        }
        
        return updated;
      });
    }
  };

  const fetchDownloadStatus = async () => {
    try {
      const response = await axios.get('/api/downloads');
      setDownloads(response.data);
    } catch (error) {
      console.error('Failed to fetch download status:', error);
    }
  };

  const showToast = (message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 5000);
  };

  const startDownload = async (type, id, quality = 7) => {
    try {
      const endpoint = type === 'album' ? '/api/download/album' : '/api/download/track';
      const payload = type === 'album' ? { albumId: id, quality } : { trackId: id, quality };
      
      const response = await axios.post(endpoint, payload);
      showToast(`${type === 'album' ? 'Album' : 'Track'} download started!`, 'success');
      
      return response.data.downloadId;
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Download failed';
      showToast(errorMessage, 'error');
      throw error;
    }
  };

  const cancelDownload = async (downloadId) => {
    try {
      await axios.delete(`/api/download/${downloadId}`);
      showToast('Download cancelled', 'info');
      fetchDownloadStatus();
    } catch (error) {
      showToast('Failed to cancel download', 'error');
    }
  };

  return (
    <Router>
      <div className="App">
        <Header 
          downloads={downloads} 
          isConnected={isConnected}
        />
        
        <main className="main-content">
          <Routes>
            <Route 
              path="/" 
              element={<Navigate to="/search" replace />} 
            />
            <Route 
              path="/search" 
              element={
                <SearchPage 
                  onDownload={startDownload}
                  showToast={showToast}
                />
              } 
            />
            <Route 
              path="/album/:id" 
              element={
                <AlbumDetailPage 
                  onDownload={startDownload}
                  showToast={showToast}
                />
              } 
            />
            <Route 
              path="/downloads" 
              element={
                <DownloadsPage 
                  downloads={downloads}
                  onCancel={cancelDownload}
                />
              } 
            />
            <Route 
              path="/history" 
              element={<HistoryPage />} 
            />
            <Route 
              path="/settings" 
              element={<SettingsPage />} 
            />
          </Routes>
        </main>

        {toast && (
          <Toast 
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </Router>
  );
}

export default App;
