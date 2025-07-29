const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');
const fetch = require('node-fetch');

class MetadataService {
  constructor() {
    this.embedArtwork = process.env.EMBED_ARTWORK === 'true';
  }

  async embedMetadata(inputFile, outputFile, track, album) {
    try {
      console.log(`Processing metadata for: ${track.title}`);
      
      // Download album artwork if available
      let artworkPath = null;
      if (this.embedArtwork && (album?.image?.large || track.album?.image?.large)) {
        artworkPath = await this.downloadArtwork(album || track.album, track.id);
      }
      
      return new Promise((resolve, reject) => {
        const command = ffmpeg(inputFile);
        
        // Add metadata
        const metadata = this.buildMetadata(track, album);
        Object.entries(metadata).forEach(([key, value]) => {
          if (value) {
            command.outputOptions('-metadata', `${key}=${value}`);
          }
        });
        
        // Add artwork if available
        if (artworkPath && await fs.pathExists(artworkPath)) {
          command.input(artworkPath);
          command.outputOptions('-map', '0:0', '-map', '1:0');
          command.outputOptions('-c', 'copy', '-id3v2_version', '3');
          command.outputOptions('-metadata:s:v', 'title=Album cover');
          command.outputOptions('-metadata:s:v', 'comment=Cover (front)');
        } else {
          command.outputOptions('-c', 'copy');
        }
        
        command
          .output(outputFile)
          .on('end', async () => {
            console.log(`Metadata processing completed: ${path.basename(outputFile)}`);
            
            // Clean up artwork file
            if (artworkPath) {
              await fs.remove(artworkPath).catch(console.error);
            }
            
            resolve();
          })
          .on('error', async (err) => {
            console.error(`FFmpeg error for ${track.title}:`, err);
            
            // Clean up artwork file
            if (artworkPath) {
              await fs.remove(artworkPath).catch(console.error);
            }
            
            // If FFmpeg fails, just copy the file without metadata
            try {
              await fs.copy(inputFile, outputFile);
              console.log(`Fallback: Copied file without metadata processing`);
              resolve();
