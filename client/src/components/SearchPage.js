import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Search, Download, Music, Clock, Star } from 'lucide-react';

const SearchPage = ({ onDownload, showToast }) => {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('albums');
  const [quality, setQuality] = useState(7);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const qualityOptions = [
    { value: 5, label: 'MP3 320k' },
    { value: 6, label: 'CD Quality' },
    { value: 7, label: 'Hi-Res 96kHz' },
    { value: 27, label: 'Hi-Res 192kHz' }
  ];

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await axios.get('/api/search', {
        params: {
          query: query.trim(),
          type: searchType,
          limit: 25
        }
      });
      setResults(response.data);
    } catch (error) {
      showToast('Search failed. Please try again.', 'error');
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (type, id) => {
    try {
      await onDownload(type, id, quality);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderAlbums = () => {
    if (!results?.albums?.items) return null;

    return results.albums.items.map((album) => (
      <div key={album.id} className="card album-card">
        <img 
          src={album.image?.large || album.image?.medium || '/placeholder-album.png'} 
          alt={album.title}
          className="album-artwork"
        />
        <div className="album-info">
          <h3 className="album-title">{album.title}</h3>
          <p className="album-artist">{album.artist?.name}</p>
          <div className="album-meta">
            <span>{album.tracks_count} tracks</span>
            {album.release_date_original && (
              <span> • {new Date(album.release_date_original).getFullYear()}</span>
            )}
            {album.genre?.name && (
              <span> • {album.genre.name}</span>
            )}
          </div>
        </div>
        <div className="download-actions">
          <Link to={`/album/${album.id}`} className="btn btn-secondary">
            View Album
          </Link>
          <button 
            onClick={() => {
              console.log(`Downloading album ID: ${album.id} from search results`);
              handleDownload('album', album.id);
            }}
            className="btn btn-primary"
          >
            <Download size={16} />
            Download
          </button>
        </div>
      </div>
    ));
  };

  const renderTracks = () => {
    if (!results?.tracks?.items) return null;

    return results.tracks.items.map((track) => (
      <div key={track.id} className="card album-card">
        <img 
          src={track.album?.image?.large || track.album?.image?.medium || '/placeholder-album.png'} 
          alt={track.title}
          className="album-artwork"
        />
        <div className="album-info">
          <h3 className="album-title">{track.title}</h3>
          <p className="album-artist">{track.performer?.name}</p>
          <div className="album-meta">
            <span>{track.album?.title}</span>
            {track.duration && (
              <span> • {formatDuration(track.duration)}</span>
            )}
          </div>
        </div>
        <div className="download-actions">
          <button 
            onClick={() => {
              console.log(`Downloading track ID: ${track.id} from search results`);
              handleDownload('track', track.id);
            }}
            className="btn btn-primary"
          >
            <Download size={16} />
            Download
          </button>
        </div>
      </div>
    ));
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Search Music</h1>
        <p className="page-subtitle">Search for albums and tracks on Qobuz</p>
      </div>

      <div className="search-container">
        <form onSubmit={handleSearch} className="search-bar">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for artists, albums, or tracks..."
            className="search-input"
          />
          <select 
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            className="quality-select"
          >
            <option value="albums">Albums</option>
            <option value="tracks">Tracks</option>
          </select>
          <button 
            type="submit" 
            disabled={loading || !query.trim()}
            className="search-button"
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: '16px', height: '16px', margin: 0, marginRight: '0.5rem' }}></div>
                Searching...
              </>
            ) : (
              <>
                <Search size={16} />
                Search
              </>
            )}
          </button>
        </form>

        <div className="quality-selector">
          <label style={{ color: '#888', marginRight: '0.5rem' }}>Download Quality:</label>
          <select 
            value={quality}
            onChange={(e) => setQuality(parseInt(e.target.value))}
            className="quality-select"
          >
            {qualityOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          Searching...
        </div>
      )}

      {results && !loading && (
        <div>
          {searchType === 'albums' && results.albums?.items?.length > 0 && (
            <div>
              <h2 style={{ marginBottom: '1rem', color: '#ffffff' }}>
                Albums ({results.albums.items.length})
              </h2>
              {renderAlbums()}
            </div>
          )}

          {searchType === 'tracks' && results.tracks?.items?.length > 0 && (
            <div>
              <h2 style={{ marginBottom: '1rem', color: '#ffffff' }}>
                Tracks ({results.tracks.items.length})
              </h2>
              {renderTracks()}
            </div>
          )}

          {((searchType === 'albums' && (!results.albums?.items || results.albums.items.length === 0)) ||
            (searchType === 'tracks' && (!results.tracks?.items || results.tracks.items.length === 0))) && (
            <div className="empty-state">
              <Music size={48} style={{ color: '#555', marginBottom: '1rem' }} />
              <h3>No results found</h3>
              <p>Try searching with different keywords or check your spelling.</p>
            </div>
          )}
        </div>
      )}

      {!results && !loading && (
        <div className="empty-state">
          <Search size={48} style={{ color: '#555', marginBottom: '1rem' }} />
          <h3>Start your music discovery</h3>
          <p>Search for your favorite artists, albums, or tracks to begin downloading high-quality music.</p>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
