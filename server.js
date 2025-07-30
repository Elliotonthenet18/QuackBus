require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const WebSocket = require('ws');
const http = require('http');

const qobuzService = require('./services/qobuzService');
const downloadService = require('./services/downloadService');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 7277;

// Basic middleware
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
  console.log('Client connected');
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected');
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

// Search for music using your qobuz-dl-api
app.get('/api/search', async (req, res) => {
  try {
    const { query, type = 'albums', limit = 25 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log(`🔍 Searching for: "${query}"`);
    const results = await qobuzService.search(query, type, limit);
    console.log(`📊 Found ${results.albums?.items?.length || 0} albums`);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

// Get album details
app.get('/api/album/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📀 Getting album: ${id}`);
    const albumData = await qobuzService.getAlbum(id);
    res.json(albumData);
  } catch (error) {
    console.error('Album fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch album', details: error.message });
  }
});

// Download track
app.post('/api/download/track', async (req, res) => {
  try {
    const { trackId, quality = 7 } = req.body;
    
    console.log(`⬇️ Download track request: trackId=${trackId}, quality=${quality}`);
    
    if (!trackId) {
      return res.status(400).json({ error: 'Track ID is required' });
    }

    const downloadId = await downloadService.downloadTrack(trackId, quality, broadcast);
    res.json({ downloadId, message: 'Download started' });
  } catch (error) {
    console.error('Track download error:', error);
    res.status(500).json({ error: 'Download failed', details: error.message });
  }
});

// Download album
app.post('/api/download/album', async (req, res) => {
  try {
    const { albumId, quality = 7 } = req.body;
    
    console.log(`⬇️ Download album request: albumId=${albumId}, quality=${quality}`);
    
    if (!albumId) {
      return res.status(400).json({ error: 'Album ID is required' });
    }

    const downloadId = await downloadService.downloadAlbum(albumId, quality, broadcast);
    res.json({ downloadId, message: 'Album download started' });
  } catch (error) {
    console.error('Album download error:', error);
    res.status(500).json({ error: 'Download failed', details: error.message });
  }
});

// Get download status
app.get('/api/downloads', (req, res) => {
  const downloads = downloadService.getDownloadStatus();
  res.json(downloads);
});

// Get download history
app.get('/api/history', async (req, res) => {
  try {
    const history = await downloadService.getDownloadHistory();
    res.json(history);
  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

// Cancel download
app.delete('/api/download/:id', (req, res) => {
  try {
    const { id } = req.params;
    downloadService.cancelDownload(id);
    res.json({ message: 'Download cancelled' });
  } catch (error) {
    console.error('Cancel download error:', error);
    res.status(500).json({ error: 'Failed to cancel download', details: error.message });
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
  
  // Ensure directories exist
  fs.ensureDirSync(process.env.DOWNLOAD_PATH || '/app/music');
  fs.ensureDirSync(process.env.TEMP_PATH || '/app/temp');
});

module.exports = app;
