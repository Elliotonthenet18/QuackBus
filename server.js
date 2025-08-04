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

// Active downloads tracking
const activeDownloads = new Map();

// Download history storage
let downloadHistory = [];
const historyFilePath = path.join(process.env.CONFIG_PATH || '/app/config', 'download_history.json');

// Load download history on startup
async function loadDownloadHistory() {
  try {
    if (await fs.pathExists(historyFilePath)) {
      const data = await fs.readFile(historyFilePath, 'utf8');
      downloadHistory = JSON.parse(data);
      console.log(`📚 Loaded ${downloadHistory.length} items from download history`);
    }
  } catch (error) {
    console.log('⚠️ Could not load download history:', error.message);
    downloadHistory = [];
  }
}

// Save download history
async function saveDownloadHistory() {
  try {
    await fs.ensureDir(path.dirname(historyFilePath));
    await fs.writeFile(historyFilePath, JSON.stringify(downloadHistory, null, 2));
  } catch (error) {
    console.error('❌ Could not save download history:', error.message);
  }
}

// Add item to download history
function addToHistory(downloadInfo, track, album) {
  const historyItem = {
    id: downloadInfo.id,
    trackId: downloadInfo.trackId,
    title: track?.title || 'Unknown Track',
    artist: track?.performer?.name || album?.artist?.name || 'Unknown Artist',
    album: album?.title || 'Unknown Album',
    quality: getQualityName(downloadInfo.quality),
    status: downloadInfo.status,
    startTime: downloadInfo.startTime,
    endTime: downloadInfo.endTime,
    filePath: downloadInfo.filePath,
    fileSize: downloadInfo.fileSize,
    duration: downloadInfo.endTime && downloadInfo.startTime ? 
      Math.round((new Date(downloadInfo.endTime) - new Date(downloadInfo.startTime)) / 1000) : null
  };
  
  // Add to beginning of array (newest first)
  downloadHistory.unshift(historyItem);
  
  // Keep only last 500 items
  if (downloadHistory.length > 500) {
    downloadHistory = downloadHistory.slice(0, 500);
  }
  
  // Save to file
  saveDownloadHistory();
  
  console.log(`📚 Added to history: ${historyItem.title} by ${historyItem.artist}`);
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
  console.log('✅ Build directory exists');
  app.use(express.static(buildPath));
} else {
  console.log('❌ Build directory missing:', buildPath);
}

// WebSocket for real-time updates
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('✅ WebSocket client connected');
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('❌ WebSocket client disconnected');
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

// Search for music
app.get('/api/search', async (req, res) => {
  try {
    const { query, type = 'albums', limit = 25 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log(`🔍 Searching for: "${query}" (type: ${type})`);
    
    // Use different endpoints based on search type
    let searchUrl;
    if (type === 'tracks') {
      searchUrl = `https://qobuz-proxy.authme.workers.dev/api/search?query=${encodeURIComponent(query)}&type=tracks&limit=${limit}`;
    } else {
      searchUrl = `https://qobuz-proxy.authme.workers.dev/api/get-music?q=${encodeURIComponent(query)}&limit=${limit}`;
    }
    
    console.log(`🌐 API call: ${searchUrl}`);
    
    const response = await fetch(searchUrl);
    const results = await response.json();
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    console.log(`📊 Albums found: ${results.albums?.items?.length || 0}`);
    console.log(`📊 Tracks found: ${results.tracks?.items?.length || 0}`);
    
    // Ensure proper response format based on type requested
    let searchResults;
    if (type === 'tracks') {
      searchResults = {
        tracks: results.tracks || { items: [] },
        albums: { items: [] }
      };
    } else {
      searchResults = {
        albums: results.albums || { items: [] },
        tracks: results.tracks || { items: [] }
      };
    }
    
    res.json(searchResults);
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

// Get album details
app.get('/api/album/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📀 Getting album: ${id}`);
    
    const albumUrl = `https://qobuz-proxy.authme.workers.dev/api/get-album?album_id=${id}`;
    console.log(`🌐 API call: ${albumUrl}`);
    
    const response = await fetch(albumUrl);
    
    if (!response.ok) {
      console.error(`❌ API returned ${response.status}: ${response.statusText}`);
      return res.status(500).json({ error: `API error: ${response.status}` });
    }
    
    const albumData = await response.json();
    console.log(`📊 Album data received for: ${albumData.title || 'Unknown Album'}`);
    
    res.json(albumData);
  } catch (error) {
    console.error('❌ Album fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch album', details: error.message });
  }
});

// Download track with real file download and progress
app.post('/api/download/track', async (req, res) => {
  try {
    const { trackId, quality = 7, trackData } = req.body;
    
    console.log(`⬇️ Download track request: trackId=${trackId}, quality=${quality}`);
    console.log(`📊 Track data provided:`, !!trackData);
    
    if (!trackId) {
      return res.status(400).json({ error: 'Track ID is required' });
    }

    // Use provided track data from search results
    let track = trackData;
    let album = trackData?.album;

    console.log(`🎵 Track: "${track?.title}" by ${track?.performer?.name}`);
    console.log(`💿 Album: "${album?.title}" by ${album?.artist?.name}`);

    const downloadUrl = `https://qobuz-proxy.authme.workers.dev/api/download-music?track_id=${trackId}&quality=${quality}`;
    console.log(`🌐 API call: ${downloadUrl}`);
    
    const response = await fetch(downloadUrl);
    
    if (!response.ok) {
      console.error(`❌ API returned ${response.status}: ${response.statusText}`);
      return res.status(500).json({ error: `Download failed: ${response.status}` });
    }
    
    const data = await response.json();
    console.log(`📊 Download URL received`);
    
    if (!data.url) {
      console.error('❌ No download URL in response');
      return res.status(500).json({ error: 'No download URL received' });
    }
    
    console.log(`✅ Got download URL, starting file download with metadata processing`);
    
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
    console.error('❌ Track download error:', error);
    res.status(500).json({ error: 'Download failed', details: error.message });
  }
});

// Main download function with FFmpeg processing
async function startFileDownloadWithProcessing(downloadId, trackId, fileUrl, quality, track, album) {
  let tempFilePath = null;
  
  try {
    console.log(`\n🚀 === STARTING DOWNLOAD ${downloadId} ===`);
    console.log(`📥 Track ID: ${trackId}`);
    console.log(`🎵 Track: "${track?.title || 'Unknown'}" by ${track?.performer?.name || 'Unknown'}`);
    console.log(`💿 Album: "${album?.title || 'Unknown'}" by ${album?.artist?.name || 'Unknown'}`);
    
    const downloadInfo = {
      id: downloadId,
      trackId,
      quality,
      status: 'downloading',
      progress: 0,
      startTime: new Date().toISOString(),
      title: track?.title || `Track ${trackId}`,
      artist: track?.performer?.name || album?.artist?.name || 'Unknown Artist'
    };
    
    activeDownloads.set(downloadId, downloadInfo);
    broadcast({ type: 'download_update', data: downloadInfo });
    
    // Step 1: Download file
    console.log(`📡 Downloading file...`);
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`File download failed: ${response.status}`);
    }
    
    const totalSize = parseInt(response.headers.get('content-length') || '0');
    console.log(`📊 File size: ${Math.round(totalSize / 1024 / 1024)} MB`);
    
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
    const artistName = sanitize(track?.performer?.name || album?.artist?.name || 'Unknown Artist');
    const albumTitle = sanitize(album?.title || 'Unknown Album');
    const trackNumber = String(track?.track_number || 1).padStart(2, '0');
    
    // Get year
    let year = '';
    if (album?.release_date_original) {
      try {
        year = new Date(album.release_date_original).getFullYear();
      } catch (e) {
        console.log(`⚠️ Could not parse year from: ${album.release_date_original}`);
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
    
    console.log(`📁 Album folder: ${albumFolderName}`);
    console.log(`📄 File name: ${fileName}`);
    console.log(`🎯 Final path: ${finalFilePath}`);
    
    // Step 3: Create directories
    await fs.ensureDir(tempDir);
    await fs.ensureDir(albumDir);
    console.log(`✅ Created directories`);
    
    // Step 4: Write to temp file
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(tempFilePath, buffer);
    console.log(`✅ Downloaded to temp file: ${buffer.length} bytes`);
    
    // Update progress
    downloadInfo.progress = 50;
    downloadInfo.status = 'processing';
    downloadInfo.fileSize = buffer.length;
    broadcast({ type: 'download_update', data: downloadInfo });
    
    // Step 5: Process with FFmpeg
    console.log(`🔧 Starting FFmpeg processing...`);
    await processWithFFmpeg(tempFilePath, finalFilePath, track, album);
    console.log(`✅ FFmpeg processing completed`);
    
    // Step 6: Clean up temp file
    if (tempFilePath && await fs.pathExists(tempFilePath)) {
      await fs.remove(tempFilePath);
      console.log(`🧹 Cleaned up temp file`);
    }
    
    // Step 7: Complete
    downloadInfo.status = 'completed';
    downloadInfo.progress = 100;
    downloadInfo.endTime = new Date().toISOString();
    downloadInfo.filePath = finalFilePath;
    
    console.log(`✅ === DOWNLOAD COMPLETED ===`);
    console.log(`📂 Final location: ${finalFilePath}`);
    console.log(`⏱️ Duration: ${((new Date() - new Date(downloadInfo.startTime)) / 1000).toFixed(1)}s\n`);
    
    // Add to history
    addToHistory(downloadInfo, track, album);
    
    broadcast({ type: 'download_update', data: downloadInfo });
    
    // Keep visible for 15 seconds
    setTimeout(() => {
      activeDownloads.delete(downloadId);
      broadcast({ type: 'download_removed', data: { id: downloadId } });
    }, 15000);
    
  } catch (error) {
    console.error(`❌ === DOWNLOAD FAILED ===`);
    console.error(`❌ Error:`, error.message);
    console.error(`❌ Stack:`, error.stack);
    
    // Clean up temp file on error
    if (tempFilePath) {
      try {
        if (await fs.pathExists(tempFilePath)) {
          await fs.remove(tempFilePath);
          console.log(`🧹 Cleaned up temp file after error`);
        }
      } catch (cleanupError) {
        console.error(`❌ Failed to clean up temp file:`, cleanupError.message);
      }
    }
    
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
  }
}

// FFmpeg processing function
async function processWithFFmpeg(inputFile, outputFile, track, album) {
  return new Promise((resolve, reject) => {
    console.log(`🔧 FFmpeg: ${path.basename(inputFile)} -> ${path.basename(outputFile)}`);
    
    const command = ffmpeg(inputFile);
    
    // Build metadata object
    const metadata = {};
    
    // Essential metadata
    if (track?.title) {
      metadata.title = track.title;
      console.log(`🏷️ Title: ${track.title}`);
    }
    
    if (track?.performer?.name) {
      metadata.artist = track.performer.name;
      console.log(`🏷️ Artist: ${track.performer.name}`);
    }
    
    if (album?.title) {
      metadata.album = album.title;
      console.log(`🏷️ Album: ${album.title}`);
    }
    
    if (album?.artist?.name) {
      metadata.albumartist = album.artist.name;
      console.log(`🏷️ Album Artist: ${album.artist.name}`);
    }
    
    if (track?.track_number) {
      metadata.track = track.track_number.toString();
      console.log(`🏷️ Track Number: ${track.track_number}`);
    }
    
    // Additional metadata
    if (album?.release_date_original) {
      try {
        const year = new Date(album.release_date_original).getFullYear();
        metadata.date = year.toString();
        console.log(`🏷️ Year: ${year}`);
      } catch (e) {
        console.log(`⚠️ Could not parse release date: ${album.release_date_original}`);
      }
    }
    
    if (album?.genre?.name) {
      metadata.genre = album.genre.name;
      console.log(`🏷️ Genre: ${album.genre.name}`);
    }
    
    if (album?.label?.name) {
      metadata.publisher = album.label.name;
      console.log(`🏷️ Label: ${album.label.name}`);
    }
    
    // Add metadata to FFmpeg command
    Object.entries(metadata).forEach(([key, value]) => {
      if (value && typeof value === 'string' && value.trim()) {
        command.outputOptions('-metadata', `${key}=${value.trim()}`);
      }
    });
    
    // Use copy codec to preserve quality
    command.outputOptions('-c', 'copy');
    
    // Add timeout protection
    const timeout = setTimeout(() => {
      console.log(`⏰ FFmpeg timeout (30s), terminating...`);
      try {
        command.kill('SIGKILL');
      } catch (killError) {
        console.log(`⚠️ Could not kill FFmpeg process:`, killError.message);
      }
      reject(new Error('FFmpeg processing timeout'));
    }, 30000);
    
    command
      .output(outputFile)
      .on('start', (commandLine) => {
        console.log(`🔧 FFmpeg started`);
      })
      .on('progress', (progress) => {
        if (progress.percent && progress.percent > 0) {
          console.log(`🔧 FFmpeg progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        clearTimeout(timeout);
        console.log(`✅ FFmpeg completed successfully`);
        resolve();
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        console.error(`❌ FFmpeg error: ${err.message}`);
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
  res.json(downloadHistory);
});

// Cancel download
app.delete('/api/download/:id', (req, res) => {
  const { id } = req.params;
  if (activeDownloads.has(id)) {
    activeDownloads.delete(id);
    console.log(`🚫 Download cancelled: ${id}`);
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
  console.log(`🦆 QuackBus running on port ${PORT}`);
  console.log(`📁 Build path: ${buildPath}`);
  console.log(`📥 Music directory: ${process.env.DOWNLOAD_PATH || '/app/music'}`);
  console.log(`🚀 Ready for downloads with FFmpeg processing!`);
  
  // Ensure directories exist
  fs.ensureDirSync(process.env.DOWNLOAD_PATH || '/app/music');
  fs.ensureDirSync(process.env.TEMP_PATH || '/app/temp');
  fs.ensureDirSync(process.env.CONFIG_PATH || '/app/config');
  
  // Load download history
  loadDownloadHistory();
});

module.exports = app;
