
const WORKER_URL = process.env.WORKER_URL || 'https://qobuz-proxy.authme.workers.dev';

class QobuzService {
  constructor() {
    this.baseUrl = WORKER_URL;
  }

  async makeRequest(endpoint, params = {}) {
    try {
      const url = new URL(endpoint, this.baseUrl);
      
      // Add query parameters
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
          url.searchParams.append(key, params[key]);
        }
      });

      console.log(`Making request to: ${url.toString()}`);
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'QuackBus/2.0.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status && data.status !== 'success') {
        throw new Error(`Qobuz API error: ${data.message || 'Unknown error'}`);
      }

      return data;
    } catch (error) {
      console.error(`Qobuz API request failed for ${endpoint}:`, error);
      throw error;
    }
  }

  async search(query, type = 'albums', limit = 25) {
    return this.makeRequest('/catalog/search', {
      query,
      type,
      limit
    });
  }

  async getAlbum(albumId) {
    return this.makeRequest('/album/get', {
      album_id: albumId
    });
  }

  async getTrack(trackId) {
    return this.makeRequest('/track/get', {
      track_id: trackId
    });
  }

  async getTrackFileUrl(trackId, formatId = 7) {
    return this.makeRequest('/track/getFileUrl', {
      track_id: trackId,
      format_id: formatId
    });
  }

  async getFeatured() {
    return this.makeRequest('/album/getFeatured', {
      type: 'new-releases',
      genre_id: 'all',
      limit: 20
    });
  }

  async getGenres() {
    return this.makeRequest('/genre/list');
  }

  async getArtist(artistId) {
    return this.makeRequest('/artist/get', {
      artist_id: artistId
    });
  }

  async getArtistAlbums(artistId, limit = 25) {
    return this.makeRequest('/artist/get', {
      artist_id: artistId,
      extra: 'albums',
      limit
    });
  }

  // Quality format mappings
  getQualityInfo(formatId) {
    const qualityMap = {
      5: { name: 'MP3 320k', extension: 'mp3', bitrate: '320 kbps' },
      6: { name: 'CD Quality', extension: 'flac', bitrate: '16-bit/44.1kHz' },
      7: { name: 'Hi-Res 96kHz', extension: 'flac', bitrate: '24-bit/96kHz' },
      27: { name: 'Hi-Res 192kHz', extension: 'flac', bitrate: '24-bit/192kHz' }
    };
    
    return qualityMap[formatId] || qualityMap[7];
  }

  // Helper to sanitize filenames
  sanitizeFilename(filename) {
    return filename
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
  }

  // Helper to format track filename
  formatTrackFilename(track, album, formatInfo) {
    const trackNumber = String(track.track_number || 1).padStart(2, '0');
    const title = this.sanitizeFilename(track.title || 'Unknown Track');
    return `${trackNumber} - ${title}.${formatInfo.extension}`;
  }

  // Helper to format album folder name
  formatAlbumFolderName(album) {
    const artist = this.sanitizeFilename(album.artist?.name || 'Unknown Artist');
    const title = this.sanitizeFilename(album.title || 'Unknown Album');
    const year = album.release_date_original ? 
      new Date(album.release_date_original).getFullYear() : '';
    
    return year ? `${artist} - ${title} (${year})` : `${artist} - ${title}`;
  }
}

module.exports = new QobuzService();
