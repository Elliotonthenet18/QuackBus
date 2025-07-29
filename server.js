require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs-extra');
const WebSocket = require('ws');
const http = require('http');

const qobuzService = require('./services/qobuzService');
const downloadService = require('./services/downloadService');
const metadataService = require('./services/metadataService');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 7277;
const WORKER_URL = process.env.WORKER_URL || 'https://qobuz-proxy.authme.workers.dev';

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve React app static files
app.use(express.static(path.join(__dirname, 'client/build')));

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

// Broadcast function for real-time updates
function broadcast(data) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// API Routes

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

    const results = await qobuzService.search(query, type, limit);
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
    const albumData = await qobuzService.getAlbum(id);
    res.json(albumData);
  } catch (error) {
    console.error('Album fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch album', details: error.message });
  }
});

// Get track details
app.get('/api/track/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const trackData = await qobuzService.getTrack(id);
    res.json(trackData);
  } catch (error) {
    console.error('Track fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch track', details: error.message });
  }
});

// Download track
app.post('/api/download/track', async (req, res) => {
  try {
    const { trackId, quality = 7 } = req.body;
    
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

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
server.listen(PORT, () => {
  console.log(`QuackBus server running on port ${PORT}`);
  console.log(`Using Qobuz proxy: ${WORKER_URL}`);
  
  // Ensure directories exist
  fs.ensureDirSync(process.env.DOWNLOAD_PATH || '/app/music');
  fs.ensureDirSync(process.env.TEMP_PATH || '/app/temp');
  fs.ensureDirSync('./logs');
});

module.exports = app;
