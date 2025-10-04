import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Search, Download, Music, Clock, Star } from 'lucide-react';

const SearchPage = ({ onDownload, showToast }) => {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('album');
  const [quality, setQuality] = useState(7);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadingTracks, setDownloadingTracks] = useState(new Set());

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
      console.log('Search results:', response.data);
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

  const handleTrackDownload = async (track) => {
    setDownloadingTracks(prev => new Set([...prev, track.id]));
    try {
      const trackData = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        albumTitle: track.albumTitle,
        albumCover: track.albumCover,
        albumId: track.albumId,
        releaseDate: track.releaseDate,
        duration: track.duration,
        trackNumber: track.trackNumber || 1
      };

      await axios.post('/api/download/track', {
        trackId: track.id,
        quality: quality,
        trackData: trackData
      });
      showToast('Track download started!', 'success');
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Download failed';
      console.error('Download error:', error);
      showToast(errorMessage, 'error');
    } finally {
      setDownloadingTracks(prev => {
        const newSet = new Set(prev);
        newSet.delete(track.id);
        return newSet;
      });
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderAlbums = () => {
    if (!results?.albums?.items || results.albums.items.length === 0) return null;

    return (
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {results.albums.items.map((album) => (
          <div key={album.id} style={{
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '1.5rem',
            display: 'flex',
            gap: '1.5rem',
            alignItems: 'center',
            transition: 'all 0.2s ease',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}>
            <img 
              src={album.cover || album.image?.large || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%23333" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" fill="%23666" font-size="60" text-anchor="middle" dy=".3em"%3E♪%3C/text%3E%3C/svg%3E'} 
              alt={album.title}
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '8px',
                objectFit: 'cover',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
              }}
              onError={(e) => {
                e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%23333" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" fill="%23666" font-size="60" text-anchor="middle" dy=".3em"%3E♪%3C/text%3E%3C/svg%3E';
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: 'bold', 
                color: '#ffffff',
                marginBottom: '0.5rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {album.title}
              </h3>
              <p style={{ 
                color: '#0ea5e9', 
                marginBottom: '0.75rem',
                fontSize: '1rem'
              }}>
                {album.artist}
              </p>
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap',
                gap: '0.5rem',
                fontSize: '0.9rem',
                color: '#888',
                alignItems: 'center'
              }}>
                {album.trackCount && <span>{album.trackCount} tracks</span>}
                {album.releaseDate && (
                  <>
                    <span>•</span>
                    <span>{new Date(album.releaseDate).getFullYear()}</span>
                  </>
                )}
                {album.genre && (
                  <>
                    <span>•</span>
                    <span>{album.genre}</span>
                  </>
                )}
                {album.audioQuality?.isHiRes && (
                  <span style={{ 
                    background: 'linear-gradient(45deg, #0ea5e9, #10b981)', 
                    color: 'white', 
                    padding: '2px 8px', 
                    borderRadius: '4px', 
                    fontSize: '0.75rem',
                    fontWeight: 'bold'
                  }}>
                    Hi-Res
                  </span>
                )}
                {album.audioQuality && (
                  <>
                    <span>•</span>
                    <span>{album.audioQuality.maximumBitDepth}bit/{album.audioQuality.maximumSamplingRate}kHz</span>
                  </>
                )}
              </div>
            </div>
            <div style={{ 
              display: 'flex', 
              gap: '0.75rem',
              flexShrink: 0
            }}>
              <Link 
                to={`/album/${album.id}`} 
                style={{
                  padding: '0.75rem 1.25rem',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  textDecoration: 'none',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                View Album
              </Link>
              <button 
                onClick={() => handleDownload('album', album.id)}
                style={{
                  padding: '0.75rem 1.25rem',
                  background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'scale(1.05)';
                  e.target.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'scale(1)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                <Download size={16} />
                Download
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderTracks = () => {
    if (!results?.tracks?.items || results.tracks.items.length === 0) return null;

    return (
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {results.tracks.items.map((track) => (
          <div key={track.id} style={{
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '1.5rem',
            display: 'flex',
            gap: '1.5rem',
            alignItems: 'center',
            transition: 'all 0.2s ease',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}>
            <img 
              src={track.albumCover || track.image?.large || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%23333" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" fill="%23666" font-size="60" text-anchor="middle" dy=".3em"%3E♪%3C/text%3E%3C/svg%3E'} 
              alt={track.title}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '8px',
                objectFit: 'cover',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
              }}
              onError={(e) => {
                e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%23333" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" fill="%23666" font-size="60" text-anchor="middle" dy=".3em"%3E♪%3C/text%3E%3C/svg%3E';
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ 
                fontSize: '1.1rem', 
                fontWeight: 'bold', 
                color: '#ffffff',
                marginBottom: '0.25rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {track.title}
              </h3>
              <p style={{ 
                color: '#0ea5e9', 
                marginBottom: '0.5rem',
                fontSize: '0.95rem'
              }}>
                {track.artist}
              </p>
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap',
                gap: '0.5rem',
                fontSize: '0.85rem',
                color: '#888',
                alignItems: 'center'
              }}>
                <span>{track.albumTitle}</span>
                {track.duration && (
                  <>
                    <span>•</span>
                    <span>{formatDuration(track.duration)}</span>
                  </>
                )}
                {track.audioQuality?.isHiRes && (
                  <span style={{ 
                    background: 'linear-gradient(45deg, #0ea5e9, #10b981)', 
                    color: 'white', 
                    padding: '2px 8px', 
                    borderRadius: '4px', 
                    fontSize: '0.7rem',
                    fontWeight: 'bold'
                  }}>
                    Hi-Res
                  </span>
                )}
                {track.audioQuality && (
                  <>
                    <span>•</span>
                    <span>{track.audioQuality.maximumBitDepth}bit/{track.audioQuality.maximumSamplingRate}kHz</span>
                  </>
                )}
                {track.releaseDate && (
                  <>
                    <span>•</span>
                    <span>{new Date(track.releaseDate).getFullYear()}</span>
                  </>
                )}
              </div>
            </div>
            <button 
              onClick={() => handleTrackDownload(track)}
              disabled={downloadingTracks.has(track.id)}
              style={{
                padding: '0.75rem 1.25rem',
                background: downloadingTracks.has(track.id) ? '#555' : 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontWeight: '600',
                cursor: downloadingTracks.has(track.id) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                if (!downloadingTracks.has(track.id)) {
                  e.target.style.transform = 'scale(1.05)';
                  e.target.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'scale(1)';
                e.target.style.boxShadow = 'none';
              }}
            >
              {downloadingTracks.has(track.id) ? (
                <>
                  <div style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTop: '2px solid white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                  Downloading...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Download
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#ffffff', marginBottom: '0.5rem' }}>
          Search Music
        </h1>
        <p style={{ color: '#888', fontSize: '1.1rem' }}>
          Search for albums and tracks from our music library
        </p>
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for artists, albums, or tracks..."
            style={{
              flex: '1',
              minWidth: '300px',
              padding: '1rem 1.5rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              color: '#ffffff',
              fontSize: '1rem',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#0ea5e9';
              e.target.style.background = 'rgba(255, 255, 255, 0.08)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.target.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
          />
          <select 
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            style={{
              padding: '1rem 1.5rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              color: '#ffffff',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            <option value="album">Albums</option>
            <option value="track">Tracks</option>
          </select>
          <button 
            type="submit" 
            disabled={loading || !query.trim()}
            style={{
              padding: '1rem 2rem',
              background: (loading || !query.trim()) ? '#555' : 'linear-gradient(135deg, #0ea5e9, #0284c7)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: (loading || !query.trim()) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease'
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ color: '#888' }}>Download Quality:</label>
          <select 
            value={quality}
            onChange={(e) => setQuality(parseInt(e.target.value))}
            style={{
              padding: '0.5rem 1rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#ffffff',
              cursor: 'pointer'
            }}
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
        <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid rgba(255, 255, 255, 0.1)',
            borderTop: '4px solid #0ea5e9',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
          Searching...
        </div>
      )}

      {results && !loading && (
        <div>
          {searchType === 'album' && results.albums?.items?.length > 0 && (
            <div>
              <h2 style={{ marginBottom: '1.5rem', color: '#ffffff', fontSize: '1.5rem' }}>
                Albums ({results.albums.items.length})
              </h2>
              {renderAlbums()}
            </div>
          )}

          {searchType === 'track' && results.tracks?.items?.length > 0 && (
            <div>
              <h2 style={{ marginBottom: '1.5rem', color: '#ffffff', fontSize: '1.5rem' }}>
                Tracks ({results.tracks.items.length})
              </h2>
              {renderTracks()}
            </div>
          )}

          {((searchType === 'album' && (!results.albums?.items || results.albums.items.length === 0)) ||
            (searchType === 'track' && (!results.tracks?.items || results.tracks.items.length === 0))) && (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>
              <Music size={48} style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.5 }} />
              <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>No results found</h3>
              <p>Try searching with different keywords or check your spelling.</p>
            </div>
          )}
        </div>
      )}

      {!results && !loading && (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>
          <Search size={48} style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.5 }} />
          <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Start your music discovery</h3>
          <p>Search for your favorite artists, albums, or tracks to begin downloading high-quality music.</p>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default SearchPage;
