// Function to process file with FFmpeg
async function processWithFFmpeg(inputFile, outputFile, track, album) {
  return new Promise((resolve, reject) => {
    try {
      const ffmpeg = require('fluent-ffmpeg');
      
      console.log(`🔧 Starting FFmpeg processing: ${path.basename(outputFile)}`);
      
      const command = ffmpeg(inputFile);
      
      // Build metadata
      const metadata = {};
      if (track?.title) metadata.title = track.title;
      if (track?.performer?.name) metadata.artist = track.performer.name;
      if (track?.composer?.name) metadata.composer = track.composer.name;
      if (album?.title) metadata.album = album.title;
      if (album?.artist?.name) metadata.albumartist = album.artist.name;
      if (album?.label?.name) metadata.publisher = album.label.name;
      if (track?.track_number) metadata.track = track.track_number.toString();
      if (track?.media_number) metadata.disc = track.media_number.toString();
      if (album?.tracks_count) metadata.tracktotal = album.tracks_count.toString();
      if (track?.duration) metadata.duration = track.duration.toString();
      if (album?.genre?.name) metadata.genre = album.genre.name;
      
      // Add release date
      if (album?.release_date_original) {
        const releaseDate = new Date(album.release_date_original);
        metadata.date = releaseDate.getFullYear().toString();
      }
      
      // Add technical info as comment
      if (track?.maximum_bit_depth) {
        metadata.comment = `${track.maximum_bit_depth}-bit/${track.maximum_sampling_rate}Hz`;
      }
      
      console.log(`🏷️ Embedding metadata:`, metadata);
      
      // Add metadata to FFmpeg command
      Object.entries(metadata).forEach(([key, value]) => {
        if (value) {
          command.outputOptions('-metadata', `${key}=${value}`);
        }
      });
      
      // Copy without re-encoding to preserve quality
      command.outputOptions('-c', 'copy');
      
      command
        .output(outputFile)
        .on('start', (commandLine) => {
          console.log(`🔧 FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`🔧 FFmpeg progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log(`✅ FFmpeg processing completed: ${path.basename(outputFile)}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`❌ FFmpeg error:`, err.message);
          // Fallback: just copy the file without metadata
          console.log(`📋 Fallback: copying file without metadata processing`);
          fs.copy(inputFile, outputFile)
            .then(() => {
              console.log(`✅ Fallback copy completed`);
              resolve();
            })
            .catch((copyError) => {
              console.error(`❌ Fallback copy failed:`, copyError);
              reject(copyError);
            });
        })
        .run();
        
    } catch (error) {
      console.error(`❌ FFmpeg setup error:`, error.message);
      // Fallback: just copy the file
      console.log(`📋 Fallback: copying file without metadata processing`);
      fs.copy(inputFile, outputFile)
        .then(() => {
          console.log(`✅ Fallback copy completed`);
          resolve();
        })
        .catch((copyError) => {
          console.error(`❌ Fallback copy failed:`, copyError);
          reject(copyError);
        });
    }
  });
}require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 7277;

// Active downloads tracking
const activeDownloads = new Map();

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
      // Use the correct format for track searches
      searchUrl = `https://qobuz-proxy.authme.workers.dev/api/search?query=${encodeURIComponent(query)}&type=tracks&limit=${limit}`;
    } else {
      // Use the existing format for album searches
      searchUrl = `https://qobuz-proxy.authme.workers.dev/api/get-music?q=${encodeURIComponent(query)}&limit=${limit}`;
    }
    
    console.log(`🌐 Calling: ${searchUrl}`);
    
    const response = await fetch(searchUrl);
    const results = await response.json();
    
    if (!response.ok) {
      throw new Error(`Qobuz proxy error: ${response.status}`);
    }
    
    console.log(`📊 Raw results structure:`, Object.keys(results));
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
    console.log(`🌐 Calling: ${albumUrl}`);
    
    const response = await fetch(albumUrl);
    
    if (!response.ok) {
      console.error(`❌ Proxy returned ${response.status}: ${response.statusText}`);
      return res.status(500).json({ error: `Proxy error: ${response.status}` });
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
    
    if (!trackId) {
      return res.status(400).json({ error: 'Track ID is required' });
    }

    // Use provided track data from search results if available
    let track = trackData;
    let album = trackData?.album;

    // If no track data provided, try to get it (but with fallback)
    if (!track) {
      console.log(`🎵 No track data provided, trying to fetch details for: ${trackId}`);
      try {
        const trackDetailsUrl = `https://qobuz-proxy.authme.workers.dev/api/get-track?track_id=${trackId}`;
        const trackResponse = await fetch(trackDetailsUrl);
        
        if (trackResponse.ok) {
          const trackData = await trackResponse.json();
          track = trackData.track || trackData;
          console.log(`📊 Track details: ${track.title} by ${track.performer?.name}`);
        } else {
          console.log(`⚠️ Could not fetch track details (${trackResponse.status}), proceeding with basic info`);
        }
      } catch (error) {
        console.log(`⚠️ Track details fetch failed, proceeding with basic info:`, error.message);
      }
    } else {
      console.log(`📊 Using provided track data: ${track.title} by ${track.performer?.name}`);
    }

    // Get album details if available and not already provided
    if (track?.album?.id && !album?.tracks) {
      console.log(`📀 Getting album details for: ${track.album.id}`);
      try {
        const albumResponse = await fetch(`https://qobuz-proxy.authme.workers.dev/api/get-album?album_id=${track.album.id}`);
        if (albumResponse.ok) {
          const albumData = await albumResponse.json();
          album = albumData.album || albumData;
          console.log(`📊 Album details: ${album.title} by ${album.artist?.name}`);
        }
      } catch (error) {
        console.log(`⚠️ Album details fetch failed:`, error.message);
      }
    }

    const downloadUrl = `https://qobuz-proxy.authme.workers.dev/api/download-music?track_id=${trackId}&quality=${quality}`;
    console.log(`🌐 Calling: ${downloadUrl}`);
    
    const response = await fetch(downloadUrl);
    
    if (!response.ok) {
      console.error(`❌ Proxy returned ${response.status}: ${response.statusText}`);
      return res.status(500).json({ error: `Proxy error: ${response.status}` });
    }
    
    const data = await response.json();
    console.log(`📊 Proxy response received`);
    
    if (!data.url) {
      console.error('❌ No download URL in response');
      return res.status(500).json({ error: 'No download URL received from proxy' });
    }
    
    console.log(`✅ Got download URL, starting file download`);
    
    const downloadId = 'download-' + Date.now();
    
    // Start the download immediately with track and album data
    setImmediate(() => {
      startFileDownload(downloadId, trackId, data.url, quality, track, album);
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

// Function to download the actual file
async function startFileDownload(downloadId, trackId, fileUrl, quality) {
  try {
    console.log(`📥 Starting file download: ${downloadId} for track ${trackId}`);
    
    const downloadInfo = {
      id: downloadId,
      trackId,
      quality,
      status: 'downloading',
      progress: 0,
      startTime: new Date().toISOString(),
      title: `Track ${trackId}`
    };
    
    activeDownloads.set(downloadId, downloadInfo);
    broadcast({ type: 'download_update', data: downloadInfo });
    
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`File download failed: ${response.status}`);
    }
    
    const totalSize = parseInt(response.headers.get('content-length') || '0');
    console.log(`📊 File size: ${Math.round(totalSize / 1024 / 1024)} MB`);
    
    // Determine file extension based on quality
    const extensions = { 5: 'mp3', 6: 'flac', 7: 'flac', 27: 'flac' };
    const extension = extensions[quality] || 'flac';
    
    const fileName = `${trackId}.${extension}`;
    const musicDir = process.env.DOWNLOAD_PATH || '/app/music';
    const filePath = path.join(musicDir, fileName);
    
    // Ensure directory exists with proper permissions
    await fs.ensureDir(musicDir);
    await fs.chmod(musicDir, 0o755);
    
    // Convert ReadableStream to Buffer for Node 18+
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`💾 Writing ${buffer.length} bytes to ${filePath}`);
    
    // Update progress to 50% (since we have the data)
    downloadInfo.progress = 50;
    downloadInfo.status = 'writing';
    broadcast({ type: 'download_update', data: downloadInfo });
    
    // Write file with proper permissions
    await fs.writeFile(filePath, buffer);
    await fs.chmod(filePath, 0o644);
    
    // Complete
    downloadInfo.status = 'completed';
    downloadInfo.progress = 100;
    downloadInfo.endTime = new Date().toISOString();
    downloadInfo.filePath = filePath;
    
    console.log(`✅ Download completed: ${fileName}`);
    broadcast({ type: 'download_update', data: downloadInfo });
    
    // Keep the download info visible for longer so user can see it completed
    setTimeout(() => {
      activeDownloads.delete(downloadId);
      broadcast({ type: 'download_removed', data: { id: downloadId } });
    }, 15000); // Increased from 10 to 15 seconds
    
  } catch (error) {
    console.error(`❌ File download error for ${trackId}:`, error);
    const downloadInfo = activeDownloads.get(downloadId);
    if (downloadInfo) {
      downloadInfo.status = 'failed';
      downloadInfo.error = error.message;
      broadcast({ type: 'download_update', data: downloadInfo });
      
      setTimeout(() => {
        activeDownloads.delete(downloadId);
      }, 15000); // Keep failed downloads visible longer too
    }
  }
}

// Get download status
app.get('/api/downloads', (req, res) => {
  const active = Array.from(activeDownloads.values());
  res.json({
    active,
    queue: 0
  });
});

// Download history (placeholder)
app.get('/api/history', (req, res) => {
  res.json([]);
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
  console.log(`🌐 Using Qobuz proxy: https://qobuz-proxy.authme.workers.dev`);
  console.log(`📁 Build path: ${buildPath}`);
  console.log(`📥 Music directory: ${process.env.DOWNLOAD_PATH || '/app/music'}`);
  console.log(`🚀 Ready for downloads!`);
  
  // Ensure directories exist
  fs.ensureDirSync(process.env.DOWNLOAD_PATH || '/app/music');
  fs.ensureDirSync(process.env.TEMP_PATH || '/app/temp');
});

module.exports = app;
