require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const WebSocket = require('ws');
const http = require('http');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 7277;

// API base URL for the new service
const API_BASE_URL = 'https://dab.yeet.su/api';

// Active downloads tracking
const activeDownloads = new Map();

// Download history storage - use internal app directory instead of config volume
let downloadHistory = [];
const historyFilePath = path.join(__dirname, 'data', 'download_history.json');

// Load download history on startup
async function loadDownloadHistory() {
  try {
    // Check if we have enough space before trying to create directories
    try {
      await fs.ensureDir(path.dirname(historyFilePath));
    } catch (dirError) {
      if (dirError.code === 'ENOSPC') {
        console.log('No disk space to create data directory. Download history will be memory-only.');
        return;
      }
      throw dirError;
    }
    
    if (await fs.pathExists(historyFilePath)) {
      const data = await fs.readFile(historyFilePath, 'utf8');
      downloadHistory = JSON.parse(data);
      console.log(`Loaded ${downloadHistory.length} items from download history`);
    }
  } catch (error) {
    console.log('Could not load download history:', error.message);
    downloadHistory = [];
  }
}

// Save download history
async function saveDownloadHistory() {
  try {
    // Skip saving if no disk space
    try {
      await fs.ensureDir(path.dirname(historyFilePath));
    } catch (dirError) {
      if (dirError.code === 'ENOSPC') {
        console.log('No disk space to save download history. Keeping in memory only.');
        return;
      }
      throw dirError;
    }
    
    await fs.writeFile(historyFilePath, JSON.stringify(downloadHistory, null, 2));
    console.log(`Saved download history to ${historyFilePath}`);
  } catch (error) {
    console.error('Could not save download history:', error.message);
  }
}

// Add item to download history
function addToHistory(downloadInfo, track, album) {
  const historyItem = {
    id: downloadInfo.id,
    trackId: downloadInfo.trackId,
    type: downloadInfo.type || 'track',
    title: track?.title || album?.title || downloadInfo.title || 'Unknown Track',
    artist: track?.artist || track?.performer?.name || album?.artist?.name || album?.artist || downloadInfo.artist || 'Unknown Artist',
    album: album?.title || track?.albumTitle || 'Unknown Album',
    quality: getQualityName(downloadInfo.quality),
    status: downloadInfo.status,
    startTime: downloadInfo.startTime,
    endTime: downloadInfo.endTime,
    filePath: downloadInfo.filePath,
    fileSize: downloadInfo.fileSize,
    duration: downloadInfo.endTime && downloadInfo.startTime ? 
      Math.round((new Date(downloadInfo.endTime) - new Date(downloadInfo.startTime)) / 1000) : null
  };
  
  console.log(`Adding to history:`, JSON.stringify(historyItem, null, 2));
  
  // Add to beginning of array (newest first)
  downloadHistory.unshift(historyItem);
  
  // Keep only last 500 items
  if (downloadHistory.length > 500) {
    downloadHistory = downloadHistory.slice(0, 500);
  }
  
  // Save to file
  saveDownloadHistory();
  
  console.log(`Added to history: ${historyItem.title} by ${historyItem.artist}`);
}

function getQualityName(qualityId) {
  const qualityMap = {
    5: 'MP3 320k',
    6: 'CD Quality',
    7: 'Hi-Res 96kHz',
    27: 'Hi-Res 192kHz'
  };
  return qualityMap[qualityId] || 'Unknown Quality';
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
const buildPath = path.join(__dirname, 'client/build');
console.log('Serving static files from:', buildPath);

if (fs.existsSync(buildPath)) {
  console.log('Build directory exists');
  app.use(express.static(buildPath));
} else {
  console.log('Build directory missing:', buildPath);
}

// WebSocket for real-time updates
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('WebSocket client connected');
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('WebSocket client disconnected');
  });
});

function broadcast(data) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Search for music using new API
app.get('/api/search', async (req, res) => {
  try {
    const { query, type = 'album', limit = 25, offset = 0 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log(`Searching for: "${query}" (type: ${type})`);
    
    const searchUrl = `${API_BASE_URL}/search?q=${encodeURIComponent(query)}&offset=${offset}&type=${type}&limit=${limit}`;
    console.log(`API call: ${searchUrl}`);
    
    const response = await fetch(searchUrl);
    const results = await response.json();
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    console.log(`${type}s found: ${results[type + 's']?.length || 0}`);
    
    // Transform to match expected frontend format
    let searchResults;
    if (type === 'track') {
      searchResults = {
        tracks: {
          items: results.tracks || []
        },
        albums: { items: [] }
      };
    } else {
      searchResults = {
        albums: {
          items: results.albums || []
        },
        tracks: { items: [] }
      };
    }
    
    res.json(searchResults);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

// Get album details using new API
app.get('/api/album/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Getting album: ${id}`);
    
    const albumUrl = `${API_BASE_URL}/album?albumId=${id}`;
    console.log(`API call: ${albumUrl}`);
    
    const response = await fetch(albumUrl);
    
    if (!response.ok) {
      console.error(`API returned ${response.status}: ${response.statusText}`);
      return res.status(500).json({ error: `API error: ${response.status}` });
    }
    
    const albumData = await response.json();
    console.log(`Album data received for: ${albumData.album?.title || 'Unknown Album'}`);
    
    // Extract the actual album data from the nested structure
    const album = albumData.album;
    
    // Transform album data to match expected format
    const transformedAlbum = {
      album: {
        id: album.id,
        title: album.title,
        artist: {
          name: album.artist
        },
        image: {
          large: album.cover,
          medium: album.cover,
          small: album.cover
        },
        release_date_original: album.releaseDate,
        genre: {
          name: album.genre
        },
        ...(album.label && {
          label: {
            name: album.label
          }
        }),
        tracks: {
          items: (album.tracks || []).map((track, index) => ({
            id: track.id,
            title: track.title,
            performer: {
              name: track.artist
            },
            artist: track.artist,
            track_number: track.trackNumber || (index + 1),
            duration: track.duration,
            albumId: track.albumId,
            albumTitle: track.albumTitle,
            albumCover: track.albumCover
          }))
        },
        tracks_count: album.trackCount || (album.tracks ? album.tracks.length : 0),
        duration: album.duration,
        audioQuality: album.audioQuality
      }
    };
    
    res.json(transformedAlbum);
  } catch (error) {
    console.error('Album fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch album', details: error.message });
  }
});

// Download track with new API
app.post('/api/download/track', async (req, res) => {
  try {
    const { trackId, quality = 7, trackData } = req.body;
    
    console.log(`Download track request: trackId=${trackId}, quality=${quality}`);
    console.log(`Track data provided:`, !!trackData);
    
    if (!trackId) {
      return res.status(400).json({ error: 'Track ID is required' });
    }

    // Use provided track data from search results
    let track = trackData;
    let album = null;

    // If we have albumId in track data, create album object
    if (track?.albumId) {
      album = {
        title: track.albumTitle,
        artist: { name: track.artist },
        image: { large: track.albumCover },
        release_date_original: track.releaseDate
      };
    }

    console.log(`Track: "${track?.title}" by ${track?.artist}`);
    console.log(`Album: "${album?.title}" by ${album?.artist?.name}`);

    const downloadUrl = `${API_BASE_URL}/stream?trackId=${trackId}&quality=${quality}`;
    console.log(`API call: ${downloadUrl}`);
    
    const response = await fetch(downloadUrl);
    
    if (!response.ok) {
      console.error(`API returned ${response.status}: ${response.statusText}`);
      return res.status(500).json({ error: `Download failed: ${response.status}` });
    }
    
    const data = await response.json();
    console.log(`Download URL received`);
    
    if (!data.url) {
      console.error('No download URL in response');
      return res.status(500).json({ error: 'No download URL received' });
    }
    
    console.log(`Got download URL, starting file download with metadata processing`);
    
    const downloadId = 'download-' + Date.now();
    
    // Start the download with track and album data
    setImmediate(() => {
      startFileDownloadWithProcessing(downloadId, trackId, data.url, quality, track, album);
    });
    
    res.json({ 
      downloadId,
      message: 'Download started',
      trackId: trackId,
      quality: quality
    });
    
  } catch (error) {
    console.error('Track download error:', error);
    res.status(500).json({ error: 'Download failed', details: error.message });
  }
});

// Download entire album using new API
app.post('/api/download/album', async (req, res) => {
  try {
    const { albumId, quality = 7 } = req.body;
    
    console.log(`Download album request: albumId=${albumId}, quality=${quality}`);
    
    if (!albumId) {
      return res.status(400).json({ error: 'Album ID is required' });
    }

    // First get album details with all tracks
    console.log(`Getting album details for: ${albumId}`);
    const albumUrl = `${API_BASE_URL}/album?albumId=${albumId}`;
    console.log(`API call: ${albumUrl}`);
    
    const albumResponse = await fetch(albumUrl);
    
    if (!albumResponse.ok) {
      console.error(`API returned ${albumResponse.status}: ${albumResponse.statusText}`);
      return res.status(500).json({ error: `Failed to get album: ${albumResponse.status}` });
    }
    
    const albumData = await albumResponse.json();
    
    // Extract the actual album data from the nested structure
    const album = albumData.album;
    
    if (!album.tracks || album.tracks.length === 0) {
      return res.status(400).json({ error: 'No tracks found in album' });
    }
    
    console.log(`Album: "${album.title}" by ${album.artist}`);
    console.log(`Found ${album.tracks.length} tracks in album`);
    
    // Transform album data to expected format for internal processing
    const transformedAlbum = {
      id: album.id,
      title: album.title,
      artist: { name: album.artist },
      image: { large: album.cover },
      release_date_original: album.releaseDate,
      tracks: {
        items: album.tracks.map((track, index) => ({
          id: track.id,
          title: track.title,
          performer: { name: track.artist },
          artist: track.artist,
          track_number: track.trackNumber || (index + 1),
          duration: track.duration
        }))
      }
    };
    
    const downloadId = 'album-' + Date.now();
    
    // Start the album download process
    setImmediate(() => {
      startAlbumDownload(downloadId, albumId, transformedAlbum, quality);
    });
    
    res.json({ 
      downloadId,
      message: 'Album download started',
      albumId: albumId,
      trackCount: transformedAlbum.tracks.items.length,
      quality: quality
    });
    
  } catch (error) {
    console.error('Album download error:', error);
    res.status(500).json({ error: 'Album download failed', details: error.message });
  }
});

// Album download function - downloads to temp first, then moves entire album
async function startAlbumDownload(downloadId, albumId, album, quality) {
  // Define temp paths at function scope so they're available for cleanup
  const tempAlbumRoot = path.join(process.env.TEMP_PATH || '/app/temp', `album_${downloadId}`);
  let tempAlbumDir = null;
  let finalAlbumDir = null;

  try {
    console.log(`\n=== STARTING ALBUM DOWNLOAD ${downloadId} ===`);
    console.log(`Album: "${album.title}" by ${album.artist?.name}`);
    console.log(`Total tracks: ${album.tracks.items.length}`);
    
    const albumDownloadInfo = {
      id: downloadId,
      type: 'album',
      albumId,
      album,
      quality,
      status: 'downloading',
      progress: 0,
      completedTracks: 0,
      totalTracks: album.tracks.items.length,
      failedTracks: 0,
      startTime: new Date().toISOString(),
      title: album.title,
      artist: album.artist?.name || 'Unknown Artist'
    };
    
    activeDownloads.set(downloadId, albumDownloadInfo);
    broadcast({ type: 'download_update', data: albumDownloadInfo });
    
    // Create album folder in TEMP directory first
    const sanitize = (str) => {
      if (!str) return 'Unknown';
      return str
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 80);
    };
    
    const artistName = sanitize(album.artist?.name || 'Unknown Artist');
    const albumTitle = sanitize(album.title || 'Unknown Album');
    let year = '';
    if (album.release_date_original) {
      try {
        year = new Date(album.release_date_original).getFullYear();
      } catch (e) {
        console.log(`Could not parse year from: ${album.release_date_original}`);
      }
    }
    
    const albumFolderName = year ? `${artistName} - ${albumTitle} (${year})` : `${artistName} - ${albumTitle}`;
    tempAlbumDir = path.join(tempAlbumRoot, albumFolderName);
    finalAlbumDir = path.join(process.env.DOWNLOAD_PATH || '/app/music', albumFolderName);
    
    console.log(`Temp album directory: ${tempAlbumDir}`);
    console.log(`Final album directory: ${finalAlbumDir}`);
    
    // Create temp album directory
    await fs.ensureDir(tempAlbumDir);
    
    // Download album artwork to temp folder
    const albumArtworkPath = await downloadAlbumArtwork(album, tempAlbumDir);
    
    // Download each track to temp folder with retry logic
    for (let i = 0; i < album.tracks.items.length; i++) {
      const track = album.tracks.items[i];
      const maxRetries = 3;
      let attempt = 0;
      let trackCompleted = false;
      
      while (attempt < maxRetries && !trackCompleted) {
        try {
          attempt++;
          const retryText = attempt > 1 ? ` (attempt ${attempt}/${maxRetries})` : '';
          console.log(`\n[${i + 1}/${album.tracks.items.length}] Downloading: "${track.title}"${retryText}`);
          
          // Update album progress with retry info
          albumDownloadInfo.status = `downloading track ${i + 1}/${album.tracks.items.length}${retryText}`;
          albumDownloadInfo.currentTrack = track.title;
          broadcast({ type: 'download_update', data: albumDownloadInfo });
          
          // Get download URL for this track using new API
          const downloadUrl = `${API_BASE_URL}/stream?trackId=${track.id}&quality=${quality}`;
          console.log(`API call: ${downloadUrl}`);
          
          const response = await fetch(downloadUrl);
          
          if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          
          if (!data.url) {
            throw new Error(`No download URL received for track ${track.id}`);
          }
          
          // Download and process this track in temp folder
          const trackDownloadId = `${downloadId}_track_${track.id}`;
          await downloadSingleTrackForAlbumToTemp(trackDownloadId, track, album, data.url, quality, tempAlbumDir, albumArtworkPath);
          
          // Track completed successfully
          trackCompleted = true;
          albumDownloadInfo.completedTracks++;
          albumDownloadInfo.progress = Math.round((albumDownloadInfo.completedTracks / album.tracks.items.length) * 100);
          broadcast({ type: 'download_update', data: albumDownloadInfo });
          
          console.log(`[${i + 1}/${album.tracks.items.length}] Completed: "${track.title}"`);
          
          // Small delay between tracks to be nice to the server
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (trackError) {
          console.error(`Failed to download track "${track.title}" (attempt ${attempt}/${maxRetries}):`, trackError.message);
          
          if (attempt < maxRetries) {
            // Exponential backoff: wait longer between retries
            const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.log(`Retrying in ${waitTime / 1000} seconds...`);
            
            // Update status to show retry delay
            albumDownloadInfo.status = `retry in ${waitTime / 1000}s (track ${i + 1}/${album.tracks.items.length})`;
            broadcast({ type: 'download_update', data: albumDownloadInfo });
            
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            // All retries failed
            console.error(`Track "${track.title}" failed after ${maxRetries} attempts, skipping`);
            albumDownloadInfo.failedTracks++;
            trackCompleted = true; // Mark as completed to move to next track
          }
        }
      }
    }
    
    // All tracks downloaded to temp - now move the entire album folder
    albumDownloadInfo.status = 'moving files';
    broadcast({ type: 'download_update', data: albumDownloadInfo });
    
    console.log(`Moving entire album from temp to final location...`);
    console.log(`From: ${tempAlbumDir}`);
    console.log(`To: ${finalAlbumDir}`);
    
    try {
      // Ensure final music directory exists
      await fs.ensureDir(path.dirname(finalAlbumDir));
      
      // Move the entire album folder from temp to final location
      await fs.move(tempAlbumDir, finalAlbumDir, { overwrite: true });
      
      // Set final permissions on the moved album folder
      await setFinalAlbumPermissions(finalAlbumDir);
      
      console.log(`Album moved successfully to final location`);
      
    } catch (moveError) {
      console.error(`Failed to move album folder:`, moveError.message);
      // If move fails, try to copy instead
      try {
        await fs.copy(tempAlbumDir, finalAlbumDir, { overwrite: true });
        await setFinalAlbumPermissions(finalAlbumDir);
        console.log(`Album copied successfully to final location`);
        // Don't remove tempAlbumDir here - let finally block handle it
      } catch (copyError) {
        console.error(`Failed to copy album folder:`, copyError.message);
        throw copyError;
      }
    }
    
    // Album download complete
    albumDownloadInfo.status = 'completed';
    albumDownloadInfo.progress = 100;
    albumDownloadInfo.endTime = new Date().toISOString();
    
    console.log(`=== ALBUM DOWNLOAD COMPLETED ===`);
    console.log(`Completed: ${albumDownloadInfo.completedTracks}/${album.tracks.items.length} tracks`);
    console.log(`Failed: ${albumDownloadInfo.failedTracks} tracks`);
    console.log(`Final location: ${finalAlbumDir}`);
    console.log(`Duration: ${((new Date() - new Date(albumDownloadInfo.startTime)) / 1000).toFixed(1)}s\n`);
    
    // Add to history
    addToHistory(albumDownloadInfo, null, album);
    
    broadcast({ type: 'download_update', data: albumDownloadInfo });
    
    // Keep visible for 20 seconds (longer for albums)
    setTimeout(() => {
      activeDownloads.delete(downloadId);
      broadcast({ type: 'download_removed', data: { id: downloadId } });
    }, 20000);
    
  } catch (error) {
    console.error(`=== ALBUM DOWNLOAD FAILED ===`);
    console.error(`Error:`, error.message);
    
    const albumDownloadInfo = activeDownloads.get(downloadId);
    if (albumDownloadInfo) {
      albumDownloadInfo.status = 'failed';
      albumDownloadInfo.error = error.message;
      albumDownloadInfo.endTime = new Date().toISOString();
      
      // Add failed album to history
      addToHistory(albumDownloadInfo, null, album);
      
      broadcast({ type: 'download_update', data: albumDownloadInfo });
      
      setTimeout(() => {
        activeDownloads.delete(downloadId);
      }, 20000);
    }
  } finally {
    // CRITICAL: Always clean up temp directory regardless of success/failure
    if (tempAlbumRoot) {
      try {
        console.log(`FINALLY: Cleaning up temp directory: ${tempAlbumRoot}`);
        await fs.remove(tempAlbumRoot);
        console.log(`FINALLY: Successfully cleaned up temp directory`);
      } catch (cleanupError) {
        console.error(`FINALLY: Failed to clean up temp directory:`, cleanupError.message);
        // Try to clean up individual files if directory removal fails
        try {
          if (tempAlbumDir && await fs.pathExists(tempAlbumDir)) {
            const files = await fs.readdir(tempAlbumDir);
            for (const file of files) {
              try {
                await fs.remove(path.join(tempAlbumDir, file));
                console.log(`Cleaned up individual file: ${file}`);
              } catch (fileError) {
                console.error(`Failed to clean up file ${file}:`, fileError.message);
              }
            }
          }
        } catch (individualCleanupError) {
          console.error(`Individual file cleanup also failed:`, individualCleanupError.message);
        }
      }
    }
  }
}

// Download a single track as part of an album download to temp folder with retry logic
async function downloadSingleTrackForAlbumToTemp(trackDownloadId, track, album, fileUrl, quality, tempAlbumDir, albumArtworkPath) {
  let tempFilePath = null;
  const maxRetries = 3;
  
  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Step 1: Download file
        console.log(`Downloading file${attempt > 1 ? ` (attempt ${attempt}/${maxRetries})` : ''}...`);
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`File download failed: ${response.status} ${response.statusText}`);
        }
        
        const totalSize = parseInt(response.headers.get('content-length') || '0');
        console.log(`File size: ${Math.round(totalSize / 1024 / 1024)} MB`);
        
        // Step 2: Prepare file paths
        const extensions = { 5: 'mp3', 6: 'flac', 7: 'flac', 27: 'flac' };
        const extension = extensions[quality] || 'flac';
        
        // Sanitize function for filenames
        const sanitize = (str) => {
          if (!str) return 'Unknown';
          return str
            .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
            .replace(/\s+/g, ' ')         // Single spaces
            .trim()
            .substring(0, 80);            // Reasonable length
        };
        
        // Build metadata with fallbacks
        const trackTitle = sanitize(track?.title || 'Unknown Track');
        const trackNumber = String(track?.track_number || 1).padStart(2, '0');
        const fileName = `${trackNumber} - ${trackTitle}.${extension}`;
        
        // Use temp album directory for both temp file and final file
        tempFilePath = path.join(tempAlbumDir, `temp_${trackDownloadId}.${extension}`);
        const finalFilePath = path.join(tempAlbumDir, fileName);
        
        console.log(`File: ${fileName}`);
        
        // Step 3: Write to temp file in album directory
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await fs.writeFile(tempFilePath, buffer);
        console.log(`Downloaded to temp: ${buffer.length} bytes`);
        
        // Step 4: Process with FFmpeg (including album artwork embedding)
        console.log(`Processing with FFmpeg...`);
        await processWithFFmpeg(tempFilePath, finalFilePath, track, album, albumArtworkPath);
        console.log(`FFmpeg completed`);
        
        // Step 5: Set permissions for the processed file (in temp album directory)
        try {
          await fs.chmod(finalFilePath, 0o666); // rw-rw-rw-
          console.log(`Set permissions for: ${fileName}`);
        } catch (permError) {
          console.log(`Could not set permissions for ${fileName}:`, permError.message);
        }
        
        console.log(`Track completed in temp folder: ${finalFilePath}`);
        
        // Success - break out of retry loop
        return;
        
      } catch (error) {
        console.error(`Track download failed (attempt ${attempt}/${maxRetries}): ${error.message}`);
        
        // If this was the last attempt, re-throw the error
        if (attempt === maxRetries) {
          throw new Error(`Track download failed after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retrying (exponential backoff)
        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`Retrying file download in ${waitTime / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  } finally {
    // CRITICAL: Always clean up individual track temp file
    if (tempFilePath) {
      try {
        if (await fs.pathExists(tempFilePath)) {
          await fs.remove(tempFilePath);
          console.log(`FINALLY: Cleaned up individual track temp file: ${path.basename(tempFilePath)}`);
        }
      } catch (cleanupError) {
        console.error(`FINALLY: Failed to clean up individual track temp file:`, cleanupError.message);
      }
    }
  }
}

// Function to download album artwork
async function downloadAlbumArtwork(album, albumDir) {
  try {
    const coverPath = path.join(albumDir, 'Cover.jpg');
    
    // Check if cover already exists
    if (await fs.pathExists(coverPath)) {
      console.log(`Cover already exists: Cover.jpg`);
      return coverPath;
    }
    
    // Get the best quality image URL
    const imageUrl = album?.image?.large || album?.cover || album?.image?.medium || album?.image?.small;
    
    if (!imageUrl) {
      console.log(`No album artwork available`);
      return null;
    }
    
    console.log(`Downloading album artwork...`);
    
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      console.log(`Failed to download artwork: ${response.status}`);
      return null;
    }
    
    const imageBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);
    
    await fs.writeFile(coverPath, buffer);
    
    // Set user-friendly permissions for the cover image
    await fs.chmod(coverPath, 0o666);
    
    console.log(`Album artwork saved: Cover.jpg (${Math.round(buffer.length / 1024)} KB)`);
    
    return coverPath;
    
  } catch (error) {
    console.error(`Failed to download album artwork:`, error.message);
    return null;
  }
}

// Function to set final permissions on entire album folder and all contents
async function setFinalAlbumPermissions(albumDir) {
  try {
    if (!await fs.pathExists(albumDir)) return;
    
    console.log(`Setting final permissions for album folder and all contents...`);
    
    // Set folder permissions to 777 (full access)
    await fs.chmod(albumDir, 0o777);
    
    // Get all files in the folder
    const files = await fs.readdir(albumDir);
    
    // Set permissions on all files to 666 (read/write for everyone)
    for (const file of files) {
      const filePath = path.join(albumDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isFile()) {
        await fs.chmod(filePath, 0o666); // Files: rw-rw-rw-
        console.log(`Set file permissions (666): ${file}`);
      } else if (stats.isDirectory()) {
        await fs.chmod(filePath, 0o777); // Subdirectories: rwxrwxrwx
        console.log(`Set directory permissions (777): ${file}`);
      }
    }
    
    console.log(`Final permissions set for ${files.length} items - any user can now access/modify/delete`);
    
  } catch (error) {
    console.log(`Could not set final album permissions:`, error.message);
  }
}

// Main download function with FFmpeg processing
async function startFileDownloadWithProcessing(downloadId, trackId, fileUrl, quality, track, album) {
  let tempFilePath = null;
  
  try {
    console.log(`\n=== STARTING DOWNLOAD ${downloadId} ===`);
    console.log(`Track ID: ${trackId}`);
    console.log(`Track: "${track?.title || 'Unknown'}" by ${track?.artist || 'Unknown'}`);
    console.log(`Album: "${album?.title || 'Unknown'}" by ${album?.artist?.name || 'Unknown'}`);
    
    const downloadInfo = {
      id: downloadId,
      trackId,
      quality,
      status: 'downloading',
      progress: 0,
      startTime: new Date().toISOString(),
      title: track?.title || `Track ${trackId}`,
      artist: track?.artist || album?.artist?.name || 'Unknown Artist'
    };
    
    activeDownloads.set(downloadId, downloadInfo);
    broadcast({ type: 'download_update', data: downloadInfo });
    
    // Step 1: Download file
    console.log(`Downloading file...`);
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`File download failed: ${response.status}`);
    }
    
    const totalSize = parseInt(response.headers.get('content-length') || '0');
    console.log(`File size: ${Math.round(totalSize / 1024 / 1024)} MB`);
    
    // Step 2: Prepare file paths
    const extensions = { 5: 'mp3', 6: 'flac', 7: 'flac', 27: 'flac' };
    const extension = extensions[quality] || 'flac';
    
    // Sanitize function for filenames
    const sanitize = (str) => {
      if (!str) return 'Unknown';
      return str
        .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
        .replace(/\s+/g, ' ')         // Single spaces
        .trim()
        .substring(0, 80);            // Reasonable length
    };
    
    // Build metadata with fallbacks
    const trackTitle = sanitize(track?.title || 'Unknown Track');
    const artistName = sanitize(track?.artist || album?.artist?.name || 'Unknown Artist');
    const albumTitle = sanitize(album?.title || track?.albumTitle || 'Unknown Album');
    const trackNumber = String(track?.track_number || track?.trackNumber || 1).padStart(2, '0');
    
    // Get year
    let year = '';
    if (album?.release_date_original || track?.releaseDate) {
      try {
        year = new Date(album?.release_date_original || track?.releaseDate).getFullYear();
      } catch (e) {
        console.log(`Could not parse year from: ${album?.release_date_original || track?.releaseDate}`);
      }
    }
    
    // Create final paths
    const albumFolderName = year ? `${artistName} - ${albumTitle} (${year})` : `${artistName} - ${albumTitle}`;
    const fileName = `${trackNumber} - ${trackTitle}.${extension}`;
    
    const musicDir = process.env.DOWNLOAD_PATH || '/app/music';
    const tempDir = process.env.TEMP_PATH || '/app/temp';
    const albumDir = path.join(musicDir, albumFolderName);
    
    tempFilePath = path.join(tempDir, `${downloadId}.${extension}`);
    const finalFilePath = path.join(albumDir, fileName);
    
    console.log(`Album folder: ${albumFolderName}`);
    console.log(`File name: ${fileName}`);
    console.log(`Final path: ${finalFilePath}`);
    
    // Step 3: Create directories
    await fs.ensureDir(tempDir);
    await fs.ensureDir(albumDir);
    console.log(`Created directories`);
    
    // Step 4: Download album artwork
    const albumArtworkPath = await downloadAlbumArtwork(album || { image: { large: track?.albumCover } }, albumDir);
    
    // Step 5: Write to temp file
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(tempFilePath, buffer);
    console.log(`Downloaded to temp file: ${buffer.length} bytes`);
    
    // Update progress
    downloadInfo.progress = 50;
    downloadInfo.status = 'processing';
    downloadInfo.fileSize = buffer.length;
    broadcast({ type: 'download_update', data: downloadInfo });
    
    // Step 6: Process with FFmpeg
    console.log(`Starting FFmpeg processing...`);
    await processWithFFmpeg(tempFilePath, finalFilePath, track, album, albumArtworkPath);
    console.log(`FFmpeg processing completed`);
    
    // Step 7: Complete
    downloadInfo.status = 'completed';
    downloadInfo.progress = 100;
    downloadInfo.endTime = new Date().toISOString();
    downloadInfo.filePath = finalFilePath;
    
    console.log(`=== DOWNLOAD COMPLETED ===`);
    console.log(`Final location: ${finalFilePath}`);
    console.log(`Duration: ${((new Date() - new Date(downloadInfo.startTime)) / 1000).toFixed(1)}s\n`);
    
    // Add to history
    addToHistory(downloadInfo, track, album);
    
    broadcast({ type: 'download_update', data: downloadInfo });
    
    // Keep visible for 15 seconds
    setTimeout(() => {
      activeDownloads.delete(downloadId);
      broadcast({ type: 'download_removed', data: { id: downloadId } });
    }, 15000);
    
  } catch (error) {
    console.error(`=== DOWNLOAD FAILED ===`);
    console.error(`Error:`, error.message);
    
    const downloadInfo = activeDownloads.get(downloadId);
    if (downloadInfo) {
      downloadInfo.status = 'failed';
      downloadInfo.error = error.message;
      downloadInfo.endTime = new Date().toISOString();
      
      // Add failed download to history too
      addToHistory(downloadInfo, track, album);
      
      broadcast({ type: 'download_update', data: downloadInfo });
      
      setTimeout(() => {
        activeDownloads.delete(downloadId);
      }, 15000);
    }
  } finally {
    // CRITICAL: Always clean up temp file regardless of success/failure
    if (tempFilePath) {
      try {
        if (await fs.pathExists(tempFilePath)) {
          await fs.remove(tempFilePath);
          console.log(`FINALLY: Cleaned up single track temp file: ${path.basename(tempFilePath)}`);
        }
      } catch (cleanupError) {
        console.error(`FINALLY: Failed to clean up single track temp file:`, cleanupError.message);
      }
    }
  }
}

// FFmpeg processing function with proper album artwork embedding
async function processWithFFmpeg(inputFile, outputFile, track, album, albumArtworkPath) {
  return new Promise((resolve, reject) => {
    console.log(`FFmpeg: ${path.basename(inputFile)} -> ${path.basename(outputFile)}`);
    
    const command = ffmpeg(inputFile);
    
    // Add album artwork as input if available
    if (albumArtworkPath && fs.existsSync(albumArtworkPath)) {
      console.log(`Adding album artwork: ${path.basename(albumArtworkPath)}`);
      command.input(albumArtworkPath);
    }
    
    // Build metadata object
    const metadata = {};
    
    // Essential metadata with proper track number handling
    if (track?.title) {
      metadata.title = track.title;
      console.log(`Title: ${track.title}`);
    }
    
    if (track?.performer?.name || track?.artist) {
      metadata.artist = track.performer?.name || track.artist;
      console.log(`Artist: ${metadata.artist}`);
    }
    
    if (album?.title) {
      metadata.album = album.title;
      console.log(`Album: ${album.title}`);
    }
    
    if (album?.artist?.name || album?.artist) {
      metadata.albumartist = album.artist?.name || album.artist;
      console.log(`Album Artist: ${metadata.albumartist}`);
    }
    
    // Proper track number handling
    if (track?.track_number || track?.trackNumber) {
      const trackNum = track.track_number || track.trackNumber;
      metadata.track = trackNum.toString();
      console.log(`Track Number: ${metadata.track}`);
    }
    
    // Additional metadata
    if (album?.release_date_original) {
      try {
        const year = new Date(album.release_date_original).getFullYear();
        metadata.date = year.toString();
        console.log(`Year: ${year}`);
      } catch (e) {
        console.log(`Could not parse release date: ${album.release_date_original}`);
      }
    }
    
    if (album?.genre?.name || album?.genre) {
      metadata.genre = album.genre?.name || album.genre;
      console.log(`Genre: ${metadata.genre}`);
    }
    
    if (album?.label?.name || album?.label) {
      metadata.publisher = album.label?.name || album.label;
      console.log(`Label: ${metadata.publisher}`);
    }
    
    // Add metadata to FFmpeg command
    Object.entries(metadata).forEach(([key, value]) => {
      if (value && typeof value === 'string' && value.trim()) {
        command.outputOptions('-metadata', `${key}=${value.trim()}`);
      }
    });
    
    // Configure streams based on whether we have artwork
    if (albumArtworkPath && fs.existsSync(albumArtworkPath)) {
      // Map audio from first input (the music file)
      command.outputOptions('-map', '0:a');
      // Map video from second input (the artwork)
      command.outputOptions('-map', '1:0');
      // Copy audio codec to preserve quality
      command.outputOptions('-c:a', 'copy');
      // Set video codec for album art
      command.outputOptions('-c:v', 'mjpeg');
      // Set disposition for the artwork
      command.outputOptions('-disposition:v:0', 'attached_pic');
      console.log(`Embedding album artwork into file`);
    } else {
      // No artwork - just copy the audio
      command.outputOptions('-c', 'copy');
      console.log(`Processing audio only (no artwork available)`);
    }
    
    // Add timeout protection
    const timeout = setTimeout(() => {
      console.log(`FFmpeg timeout (30s), terminating...`);
      try {
        command.kill('SIGKILL');
      } catch (killError) {
        console.log(`Could not kill FFmpeg process:`, killError.message);
      }
      reject(new Error('FFmpeg processing timeout'));
    }, 30000);
    
    command
      .output(outputFile)
      .on('start', (commandLine) => {
        console.log(`FFmpeg started`);
      })
      .on('progress', (progress) => {
        if (progress.percent && progress.percent > 0) {
          console.log(`FFmpeg progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        clearTimeout(timeout);
        console.log(`FFmpeg completed successfully`);
        resolve();
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        console.error(`FFmpeg error: ${err.message}`);
        reject(err);
      })
      .run();
  });
}

// Get download status
app.get('/api/downloads', (req, res) => {
  const active = Array.from(activeDownloads.values());
  res.json({
    active,
    queue: 0
  });
});

// Download history endpoint
app.get('/api/history', (req, res) => {
  try {
    console.log(`History request - returning ${downloadHistory.length} items`);
    console.log(`Sample history item:`, downloadHistory[0] ? JSON.stringify(downloadHistory[0], null, 2) : 'No items');
    
    res.json(downloadHistory);
  } catch (error) {
    console.error('History endpoint error:', error);
    res.status(500).json({ error: 'Failed to get history', details: error.message });
  }
});

// Cancel download
app.delete('/api/download/:id', (req, res) => {
  const { id } = req.params;
  if (activeDownloads.has(id)) {
    activeDownloads.delete(id);
    console.log(`Download cancelled: ${id}`);
    broadcast({ type: 'download_removed', data: { id } });
    res.json({ message: 'Download cancelled' });
  } else {
    res.status(404).json({ error: 'Download not found' });
  }
});

// Catch-all for React routes
app.get('*', (req, res) => {
  const indexPath = path.join(buildPath, 'index.html');
  res.sendFile(indexPath);
});

// Start server
server.listen(PORT, () => {
  console.log(`QuackBus running on port ${PORT}`);
  console.log(`Build path: ${buildPath}`);
  console.log(`Music directory: ${process.env.DOWNLOAD_PATH || '/app/music'}`);
  console.log(`Data directory: ${path.join(__dirname, 'data')}`);
  console.log(`Ready for downloads with new dab.yeet.su API!`);
  
  // Ensure directories exist with error handling for low disk space
  const musicDir = process.env.DOWNLOAD_PATH || '/app/music';
  const tempDir = process.env.TEMP_PATH || '/app/temp';
  const dataDir = path.join(__dirname, 'data');
  
  try {
    fs.ensureDirSync(musicDir);
    fs.ensureDirSync(tempDir);
    
    // Try to create data directory, but don't fail if no space
    try {
      fs.ensureDirSync(dataDir);
      console.log(`Data directory created successfully`);
    } catch (dataError) {
      if (dataError.code === 'ENOSPC') {
        console.log(`WARNING: No disk space to create data directory. Download history will be memory-only.`);
      } else {
        throw dataError;
      }
    }
    
    // Set permissive permissions on music directory
    try {
      fs.chmodSync(musicDir, 0o777);
      console.log(`Set music directory permissions (777) - any user can access/modify`);
    } catch (error) {
      console.log(`Could not set music directory permissions:`, error.message);
    }
    
    // Load download history (will skip if data dir doesn't exist)
    loadDownloadHistory();
    
  } catch (error) {
    if (error.code === 'ENOSPC') {
      console.error(`CRITICAL: No disk space left on device. Please free up space on your Docker host.`);
      console.error(`Server will continue but may have limited functionality.`);
    } else {
      console.error(`Error creating directories:`, error.message);
    }
  }
});

module.exports = app;
