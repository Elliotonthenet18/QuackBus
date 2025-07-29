const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');

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
        
        // Add artwork if available (using sync method since we're in Promise callback)
        if (artworkPath && fs.existsSync(artworkPath)) {
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
          .on('end', () => {
            console.log(`Metadata processing completed: ${path.basename(outputFile)}`);
            
            // Clean up artwork file
            if (artworkPath) {
              fs.remove(artworkPath).catch(console.error);
            }
            
            resolve();
          })
          .on('error', (err) => {
            console.error(`FFmpeg error for ${track.title}:`, err);
            
            // Clean up artwork file
            if (artworkPath) {
              fs.remove(artworkPath).catch(console.error);
            }
            
            // If FFmpeg fails, just copy the file without metadata
            fs.copy(inputFile, outputFile)
              .then(() => {
                console.log(`Fallback: Copied file without metadata processing`);
                resolve();
              })
              .catch((copyError) => {
                console.error(`Failed to copy file as fallback:`, copyError);
                reject(copyError);
              });
          })
          .run();
      });
    } catch (error) {
      console.error(`Metadata embedding failed for ${track.title}:`, error);
      // Fallback: copy without metadata
      await fs.copy(inputFile, outputFile);
    }
  }

  buildMetadata(track, album) {
    const metadata = {};
    
    // Basic track info
    if (track.title) metadata.title = track.title;
    if (track.performer?.name) metadata.artist = track.performer.name;
    if (track.composer?.name) metadata.composer = track.composer.name;
    
    // Album info
    if (album) {
      if (album.title) metadata.album = album.title;
      if (album.artist?.name) metadata.albumartist = album.artist.name;
      if (album.label?.name) metadata.publisher = album.label.name;
      if (album.copyright) metadata.copyright = album.copyright;
      if (album.upc) metadata.barcode = album.upc;
      
      // Release date
      if (album.release_date_original) {
        const releaseDate = new Date(album.release_date_original);
        metadata.date = releaseDate.getFullYear().toString();
      }
      
      // Genre
      if (album.genre?.name) metadata.genre = album.genre.name;
    }
    
    // Track number and disc info
    if (track.track_number) metadata.track = track.track_number.toString();
    if (track.media_number) metadata.disc = track.media_number.toString();
    if (album?.tracks_count) metadata.tracktotal = album.tracks_count.toString();
    
    // Duration
    if (track.duration) metadata.duration = track.duration.toString();
    
    // Technical info
    if (track.maximum_bit_depth) metadata.comment = `${track.maximum_bit_depth}-bit/${track.maximum_sampling_rate}Hz`;
    
    return metadata;
  }

  async downloadArtwork(album, trackId) {
    try {
      const imageUrl = album.image?.large || album.image?.medium || album.image?.small;
      if (!imageUrl) return null;
      
      const tempDir = process.env.TEMP_PATH || '/app/temp';
      await fs.ensureDir(tempDir);
      
      const artworkPath = path.join(tempDir, `artwork_${trackId}.jpg`);
      
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.warn(`Failed to download artwork: ${response.status}`);
        return null;
      }
      
      const buffer = await response.buffer();
      await fs.writeFile(artworkPath, buffer);
      
      return artworkPath;
    } catch (error) {
      console.error('Artwork download failed:', error);
      return null;
    }
  }
}

module.exports = new MetadataService();
