require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 7277;

// Basic middleware
app.use(cors());
app.use(express.json());

// Serve static files with NO HELMET (for testing)
const buildPath = path.join(__dirname, 'client/build');
console.log('Serving static files from:', buildPath);

// Check if build exists
if (fs.existsSync(buildPath)) {
  console.log('✅ Build directory exists');
  app.use(express.static(buildPath));
} else {
  console.log('❌ Build directory missing:', buildPath);
}

// Simple test endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Test search endpoint
app.get('/api/search', async (req, res) => {
  try {
    console.log('Search request:', req.query);
    // Just return test data for now
    res.json({
      albums: {
        items: [
          {
            id: 'test123',
            title: 'Test Album',
            artist: { name: 'Test Artist' },
            image: { large: '/placeholder.jpg' },
            tracks_count: 10
          }
        ]
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Catch-all for React routes
app.get('*', (req, res) => {
  const indexPath = path.join(buildPath, 'index.html');
  console.log('Serving index.html from:', indexPath);
  res.sendFile(indexPath);
});

// Start server
app.listen(PORT, () => {
  console.log(`🦆 QuackBus running on port ${PORT}`);
  console.log(`📁 Build path: ${buildPath}`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
});

module.exports = app;
