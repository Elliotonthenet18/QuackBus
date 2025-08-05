// Service for interacting with the new dab.yeet.su API
const fs = require('fs-extra');
const path = require('path');

const API_BASE_URL = 'https://dab.yeet.su/api';

class QobuzService {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  // Search for albums or tracks
  async search(query, type = 'album', limit = 25, offset = 0) {
    try {
      const searchUrl = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&offset=${offset}&type=${type}&limit=${limit}`;
      console.log(`🌐 Searching: ${searchUrl}`);
      
      const response = await fetch(searchUrl);
      
      if (!response.ok) {
        throw new Error(`Search API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ Search error:', error);
      throw error;
    }
  }

  // Get album details with tracks
  async getAlbum(albumId) {
    try {
      const albumUrl = `${this.baseUrl}/album?albumId=${albumId}`;
      console.log(`🌐 Getting album: ${albumUrl}`);
      
      const response = await fetch(albumUrl);
      
      if (!response.ok) {
        throw new Error(`Album API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ Album fetch error:', error);
      throw error;
    }
  }

  // Get track details (if needed)
  async getTrack(trackId) {
    try {
      // The new API doesn't seem to have a specific track endpoint
      // We'll return the trackId for now, and rely on search results for track data
      return { id: trackId };
    } catch (error) {
      console.error('❌ Track fetch error:', error);
      throw error;
    }
  }

  // Get stream URL for a track
  async getTrackFileUrl(trackId, quality = 7) {
    try {
      const streamUrl = `${this.baseUrl}/stream?trackId=${trackId}&quality=${quality}`;
      console.log(`🌐 Getting stream URL: ${streamUrl}`);
      
      const response = await fetch(streamUrl);
      
      if (!response.ok) {
        throw new Error(`Stream API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ Stream URL error:', error);
      throw error;
    }
  }

  // Get quality information
  getQualityInfo(qualityId) {
    const qualityMap = {
      5: { 
        name: 'MP3 320k', 
        extension: 'mp3',
        bitrate: 320,
        format: 'MP3'
      },
      6: { 
        name: 'CD Quality', 
        extension: 'flac',
        bitrate: 1411,
        format: 'FLAC',
        sampleRate: 44100,
        bitDepth: 16
      },
      7: { 
        name: 'Hi-Res 96kHz', 
        extension: 'flac',
        bitrate: 2304,
        format: 'FLAC',
        sampleRate: 96000,
        bitDepth: 24
      },
      27: { 
        name: 'Hi-Res 192kHz', 
        extension: 'flac',
        bitrate: 4608,
        format: 'FLAC',
        sampleRate: 192000,
        bitDepth: 24
      }
    };
    
    return qualityMap[qualityId] || qualityMap[7]; // Default to Hi-Res 96kHz
  }

  // Format track filename
  formatTrackFilename(track, album, qualityInfo) {
    const sanitize = (str) => {
      if (!str) return 'Unknown';
      return str
        .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
        .replace(/\s+/g, ' ')         // Single spaces
        .trim()
        .substring(0, 80);            // Reasonable length
    };

    const trackNumber = String(track?.track_number || track?.trackNumber || 1).padStart(2, '0');
    const title = sanitize(track?.title || 'Unknown Track');
    const extension = qualityInfo?.extension || 'flac';
    
    return `${trackNumber} - ${title}.${extension}`;
  }

  // Format album folder name
  formatAlbumFolderName(album) {
    const sanitize = (str) => {
      if (!str) return 'Unknown';
      return str
        .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
        .replace(/\s+/g, ' ')         // Single spaces
        .trim()
        .substring(0, 80);            // Reasonable length
    };

    const artist = sanitize(album?.artist?.name || album?.artist || 'Unknown Artist');
    const title = sanitize(album?.title || 'Unknown Album');
    
    let year = '';
    if (album?.release_date_original || album?.releaseDate) {
      try {
        year = new Date(album.release_date_original || album.releaseDate).getFullYear();
      } catch (e) {
        // Ignore date parsing errors
      }
    }
    
    return year ? `${artist} - ${title} (${year})` : `${artist} - ${title}`;
  }

  // Transform search results to match expected frontend format
  transformSearchResults(results, type) {
    if (type === 'track') {
      return {
        tracks: {
          items: results.tracks || []
        },
        albums: { items: [] }
      };
    } else {
      return {
        albums: {
          items: results.albums || []
        },
        tracks: { items: [] }
      };
    }
  }

  // Transform album data to match expected format
  transformAlbumData(albumData) {
    return {
      album: {
        id: albumData.id,
        title: albumData.title,
        artist: {
          name: albumData.artist
        },
        image: {
          large: albumData.cover,
          medium: albumData.cover,
          small: albumData.cover
        },
        release_date_original: albumData.releaseDate,
        genre: {
          name: albumData.genre
        },
        label: {
          name: albumData.label
        },
        tracks: {
          items: albumData.tracks || []
        },
        tracks_count: albumData.trackCount
      }
    };
  }

  // Transform track data for downloads
  transformTrackData(track, album = null) {
    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      albumTitle: track.albumTitle || album?.title,
      albumCover: track.albumCover || album?.cover,
      albumId: track.albumId || album?.id,
      releaseDate: track.releaseDate || album?.releaseDate,
      duration: track.duration,
      trackNumber: track.trackNumber || 1,
      performer: {
        name: track.artist
      },
      track_number: track.trackNumber || 1
    };
  }

  // Download and save album artwork
  async downloadArtwork(imageUrl, outputPath) {
    try {
      if (!imageUrl) {
        console.log('⚠️ No artwork URL provided');
        return null;
      }

      console.log(`🖼️ Downloading artwork: ${imageUrl}`);
      
      const response = await fetch(imageUrl);
      
      if (!response.ok) {
        console.log(`⚠️ Failed to download artwork: ${response.status}`);
        return null;
      }
      
      const imageBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(imageBuffer);
      
      // Ensure directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      // Write file
      await fs.writeFile(outputPath, buffer);
      
      console.log(`✅ Artwork saved: ${path.basename(outputPath)} (${Math.round(buffer.length / 1024)} KB)`);
      
      return outputPath;
    } catch (error) {
      console.error('❌ Artwork download failed:', error);
      return null;
    }
  }
}

module.exports = new QobuzService();
