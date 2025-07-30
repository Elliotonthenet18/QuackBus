require('dotenv').config();
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

// Search for music using your qobuz-dl-api directly
app.get('/api/search', async (req, res) => {
  try {
    const { query, type = 'albums', limit = 25 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    console.log(`🔍 Searching for: "${query}"`);
    
    const searchUrl = `https://qobuz-proxy.authme.workers.dev/api/get-music?q=${encodeURIComponent(query)}&limit=${limit}`;
    console.log(`🌐 Calling: ${searchUrl}`);
    
    const response = await fetch(searchUrl);
    const results = await response.json();
    
    if (!response.ok) {
      throw new Error(`Qobuz proxy error: ${response.status}`);
    }
    
    console.log(`📊 Found ${results.albums?.items?.length || 0} albums`);
    res.json(results);
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

// Get album details - direct proxy call
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

// Download track - direct proxy call
app.post('/api/download/track', async (req, res) => {
  try {
    const { trackId, quality = 7 } = req.body;
    
    console.log(`⬇️ Download track request: trackId=${trackId}, quality=${quality}`);
    
    if (!trackId) {
      return res.status(400).json({ error: 'Track ID is required' });
    }

    const downloadUrl = `https://qobuz-proxy.authme.workers.dev/api/download-music?track_id=${trackId}&quality=${quality}`;
    console.log(`🌐 Calling: ${downloadUrl}`);
    
    const response = await fetch(downloadUrl);
    
    if (!response.ok) {
      console.error(`❌ Proxy returned ${response.status}: ${response.statusText}`);
      return res.status(500).json({ error: `Proxy error: ${response.status}` });
    }
    
    const data = await response.json();
    console.log(`📊 Proxy response:`, data);
    
    if (!data.url) {
      console.error('❌ No download URL in response');
      return res.status(500).json({ error: 'No download URL received from proxy' });
    }
    
    console.log(`✅ Got download URL: ${data.url}`);
    
    res.json({ 
      downloadId: 'download-' + Date.now(), 
      message: 'Download URL received successfully',
      downloadUrl: data.url,
      trackId: trackId,
      quality: quality
    });
    
  } catch (error) {
    console.error('❌ Track download error:', error);
    res.status(500).json({ error: 'Download failed', details: error.message });
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
  
  fs.ensureDirSync(process.env.DOWNLOAD_PATH || '/app/music');
  fs.ensureDirSync(process.env.TEMP_PATH || '/app/temp');
});

module.exports = app;
