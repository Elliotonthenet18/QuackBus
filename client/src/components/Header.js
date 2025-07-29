import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Download, History, Settings, Music } from 'lucide-react';

const Header = ({ downloads, isConnected }) => {
  const location = useLocation();
  
  const isActive = (path) => location.pathname === path;
  
  const activeDownloads = downloads?.active?.length || 0;
  
  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo">
          <Music size={24} style={{ marginRight: '0.5rem' }} />
          QuackBus
        </Link>
        
        <nav className="nav">
          <Link 
            to="/search" 
            className={`nav-link ${isActive('/search') ? 'active' : ''}`}
          >
            <Search size={18} />
            Search
          </Link>
          
          <Link 
            to="/downloads" 
            className={`nav-link ${isActive('/downloads') ? 'active' : ''}`}
          >
            <Download size={18} />
            Downloads
            {activeDownloads > 0 && (
              <span style={{ 
                background: '#0ea5e9', 
                borderRadius: '50%', 
                padding: '2px 6px', 
                fontSize: '0.8rem',
                marginLeft: '0.25rem'
              }}>
                {activeDownloads}
              </span>
            )}
          </Link>
          
          <Link 
            to="/history" 
            className={`nav-link ${isActive('/history') ? 'active' : ''}`}
          >
            <History size={18} />
            History
          </Link>
          
          <Link 
            to="/settings" 
            className={`nav-link ${isActive('/settings') ? 'active' : ''}`}
          >
            <Settings size={18} />
            Settings
          </Link>
          
          <div className="status-indicator">
            <div className={`status-dot ${isConnected ? 'connected' : ''}`}></div>
            <span style={{ fontSize: '0.9rem', color: '#888' }}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;
