import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Download, Play, Clock, Music, Star, Calendar, Disc } from 'lucide-react';

const AlbumDetailPage = ({ onDownload, showToast }) => {
  const { id } = useParams();
  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quality, setQuality] = useState(7);
  const [downloadingTracks, setDownloadingTracks] = useState(new Set());

  const qualityOptions = [
    { value: 5, label: 'MP3 320k' },
    { value: 6, label: 'CD Quality' },
    { value: 7, label: 'Hi-Res 96kHz' },
    { value: 27, label: 'Hi-Res 192kHz' }
  ];

  useEffect(() => {
    fetchAlbum();
  }, [id]);

  const fetchAlbum = async () => {
    try {
      const response = await axios.get(`/api/album/${id}`);
      setAlbum(response.data.album || response.data);
    } catch (error) {
      showToast('Failed to load album details', 'error');
      console.error('Album fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadAlbum = async () => {
    try {
      await onDownload('album', id, quality);
    } catch (error) {
      console.error('Album download error:', error);
    }
  };

  const handleDownloadTrack = async (track) => {
    setDownloadingTracks(prev => new Set([...prev, track.id]));
    try {
      // Transform track data to match the new API format
      const trackData = {
        id: track.id,
        title: track.title,
        artist: track.performer?.name || track.artist || album.artist?.name,
        albumTitle: album.title,
        albumCover: album.image?.large,
        albumId: album.id,
        releaseDate: album.release_date_original,
        duration: track.duration,
        trackNumber: track.track_number || track.trackNumber || 1
      };

      const response = await axios.post('/api/download/track', {
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

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getTotalDuration = () => {
    if (!album?.tracks?.items) return 0;
    return album.tracks.items.reduce((total, track) => total + (track.duration || 0), 0);
  };

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <Link to="/search" className="btn btn-secondary" style={{ marginBottom: '1rem' }}>
            <ArrowLeft size={16} />
            Back to Search
          </Link>
          <h1 className="page-title">Loading Album...</h1>
        </div>
        <div className="loading">
          <div className="spinner"></div>
          Loading album details...
        </div>
      </div>
    );
  }

  if (!album) {
    return (
      <div>
        <div className="page-header">
          <Link to="/search" className="btn btn-secondary" style={{ marginBottom: '1rem' }}>
            <ArrowLeft size={16} />
            Back to Search
          </Link>
          <h1 className="page-title">Album Not Found</h1>
          <p className="page-subtitle">The album you're looking for could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <Link to="/search" className="btn btn-secondary" style={{ marginBottom: '1rem' }}>
          <ArrowLeft size={16} />
          Back to Search
        </Link>
      </div>

      {/* Album Header */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
          <img 
            src={album.image?.large || album.cover || '/placeholder-album.png'} 
            alt={album.title}
            style={{ 
              width: '200px', 
              height: '200px', 
              borderRadius: '12px', 
              objectFit: 'cover',
              flexShrink: 0
            }}
          />
          
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#ffffff' }}>
              {album.title}
            </h1>
            
            <h2 style={{ fontSize: '1.5rem', color: '#0ea5e9', marginBottom: '1rem' }}>
              {album.artist?.name || album.artist}
            </h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              {album.release_date_original && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#888' }}>
                  <Calendar size={16} />
                  {new Date(album.release_date_original).getFullYear()}
                </div>
              )}
              
              {album.tracks?.items && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#888' }}>
                  <Music size={16} />
                  {album.tracks.items.length} tracks
                </div>
              )}
              
              {getTotalDuration() > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#888' }}>
                  <Clock size={16} />
                  {formatDuration(getTotalDuration())}
                </div>
              )}
              
              {album.genre?.name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#888' }}>
                  <Disc size={16} />
                  {album.genre.name}
                </div>
              )}

              {album.audioQuality && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#888' }}>
                  <Star size={16} />
                  {album.audioQuality.maximumBitDepth}bit/{album.audioQuality.maximumSamplingRate}kHz
                  {album.audioQuality.isHiRes && (
                    <span style={{ 
                      background: 'linear-gradient(45deg, #0ea5e9, #10b981)', 
                      color: 'white', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      fontSize: '0.7rem',
                      fontWeight: 'bold',
                      marginLeft: '0.25rem'
                    }}>
                      Hi-Res
                    </span>
                  )}
                </div>
              )}
            </div>

            {album.label?.name && (
              <p style={{ color: '#888', marginBottom: '1rem' }}>
                <strong>Label:</strong> {album.label.name}
              </p>
            )}

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button 
                onClick={() => {
                  console.log(`Downloading full album ID: ${id} with ${album.tracks?.items?.length} tracks`);
                  handleDownloadAlbum();
                }}
                className="btn btn-primary"
                style={{ padding: '1rem 2rem' }}
              >
                <Download size={18} />
                Download Album
              </button>
              
              <div className="quality-selector">
                <label style={{ color: '#888', marginRight: '0.5rem' }}>Quality:</label>
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
          </div>
        </div>
      </div>

      {/* Track List */}
      {album.tracks?.items && (
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Music size={20} />
            Tracks
          </h2>
          
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {album.tracks.items.map((track, index) => (
              <div 
                key={track.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.05)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.02)'}
              >
                <div style={{ 
                  width: '32px', 
                  height: '32px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  marginRight: '1rem',
                  color: '#888',
                  fontWeight: '600'
                }}>
                  {track.track_number || track.trackNumber || index + 1}
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: '#ffffff', marginBottom: '0.25rem' }}>
                    {track.title}
                  </div>
                  {track.performer?.name && track.performer.name !== album.artist?.name && (
                    <div style={{ color: '#0ea5e9', fontSize: '0.9rem' }}>
                      {track.performer.name}
                    </div>
                  )}
                  {track.artist && track.artist !== album.artist?.name && track.artist !== track.performer?.name && (
                    <div style={{ color: '#0ea5e9', fontSize: '0.9rem' }}>
                      {track.artist}
                    </div>
                  )}
                </div>
                
                {track.duration && (
                  <div style={{ color: '#888', marginRight: '1rem', fontSize: '0.9rem' }}>
                    {formatDuration(track.duration)}
                  </div>
                )}
                
                <button 
                  onClick={() => {
                    console.log(`Downloading track ID: ${track.id} from album ${album.id}`);
                    handleDownloadTrack(track);
                  }}
                  disabled={downloadingTracks.has(track.id)}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 1rem' }}
                >
                  {downloadingTracks.has(track.id) ? (
                    <div className="spinner" style={{ width: '14px', height: '14px', margin: 0 }}></div>
                  ) : (
                    <Download size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Additional Info */}
      {(album.copyright || album.upc) && (
        <div className="card" style={{ marginTop: '2rem' }}>
          <h3 style={{ marginBottom: '1rem', color: '#ffffff' }}>Additional Information</h3>
          <div style={{ fontSize: '0.9rem', color: '#888', lineHeight: '1.6' }}>
            {album.copyright && (
              <p><strong>Copyright:</strong> {album.copyright}</p>
            )}
            {album.upc && (
              <p><strong>UPC:</strong> {album.upc}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AlbumDetailPage;
