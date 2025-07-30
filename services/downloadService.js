// Use built-in fetch (Node 18+)
// const fetch = require('node-fetch'); // Remove this line
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { pipeline } = require('stream/promises');

const qobuzService = require('./qobuzService');
const metadataService = require('./metadataService');

class DownloadService {
  constructor() {
    this.activeDownloads = new Map();
    this.downloadHistory = [];
    this.downloadPath = process.env.DOWNLOAD_PATH || '/app/music';
    this.tempPath = process.env.TEMP_PATH || '/app/temp';
    this.maxConcurrentDownloads = parseInt(process.env.CONCURRENT_DOWNLOADS) || 3;
    this.downloadQueue = [];
    this.activeCount = 0;
  }

  async downloadTrack(trackId, quality = 7, broadcastFn) {
    const downloadId = uuidv4();
    
    try {
      // Get track details
      const trackData = await qobuzService.getTrack(trackId);
      const track = trackData.track || trackData;
      
      // Get album details if available
      let album = null;
      if (track.album?.id) {
        const albumData = await qobuzService.getAlbum(track.album.id);
        album = albumData.album || albumData;
      }
      
      const downloadInfo = {
        id: downloadId,
        type: 'track',
        trackId,
        track,
        album,
        quality,
        status: 'queued',
        progress: 0,
        startTime: new Date().toISOString(),
        broadcastFn
      };
      
      this.activeDownloads.set(downloadId, downloadInfo);
      this.downloadQueue.push(downloadInfo);
      
      this.processQueue();
      
      return downloadId;
    } catch (error) {
      console.error(`Failed to start track download ${trackId}:`, error);
      throw error;
    }
  }

  async downloadAlbum(albumId, quality = 7, broadcastFn) {
    const downloadId = uuidv4();
    
    try {
      // Get album details with tracks
      const albumData = await qobuzService.getAlbum(albumId);
      const album = albumData.album || albumData;
      
      if (!album.tracks?.items?.length) {
        throw new Error('No tracks found in album');
      }
      
      const downloadInfo = {
        id: downloadId,
        type: 'album',
        albumId,
        album,
        tracks: album.tracks.items,
        quality,
        status: 'queued',
        progress: 0,
        completedTracks: 0,
        totalTracks: album.tracks.items.length,
        startTime: new Date().toISOString(),
        broadcastFn
      };
      
      this.activeDownloads.set(downloadId, downloadInfo);
      this.downloadQueue.push(downloadInfo);
      
      this.processQueue();
      
      return downloadId;
    } catch (error) {
      console.error(`Failed to start album download ${albumId}:`, error);
      throw error;
    }
  }

  async processQueue() {
    if (this.activeCount >= this.maxConcurrentDownloads || this.downloadQueue.length === 0) {
      return;
    }
    
    const downloadInfo = this.downloadQueue.shift();
    this.activeCount++;
    
    try {
      if (downloadInfo.type === 'track') {
        await this.processTrackDownload(downloadInfo);
      } else if (downloadInfo.type === 'album') {
        await this.processAlbumDownload(downloadInfo);
      }
    } catch (error) {
      console.error(`Download failed for ${downloadInfo.id}:`, error);
      downloadInfo.status = 'failed';
      downloadInfo.error = error.message;
    } finally {
      this.activeCount--;
      this.processQueue(); // Process next item in queue
    }
  }

  async processTrackDownload(downloadInfo) {
    const { track, album, quality, broadcastFn } = downloadInfo;
    
    try {
      downloadInfo.status = 'downloading';
      this.broadcast(downloadInfo, broadcastFn);
      
      // Get download URL using the new qobuz-dl-api format
      console.log(`Requesting download URL for track ${track.id} with quality ${quality}`);
      console.log(`Track data:`, { id: track.id, title: track.title });
      
      const fileUrlData = await qobuzService.getTrackFileUrl(track.id, quality);
      console.log(`Received download URL response:`, fileUrlData);
      
      if (!fileUrlData || !fileUrlData.url) {
        console.error('Invalid response from qobuz-dl-api:', fileUrlData);
        throw new Error('No download URL received from qobuz-dl-api');
      }
      
      console.log(`Download URL: ${fileUrlData.url}`);
      
      // Prepare file paths
      const qualityInfo = qobuzService.getQualityInfo(quality);
      const fileName = qobuzService.formatTrackFilename(track, album, qualityInfo);
      
      let finalDir = this.downloadPath;
      if (album && process.env.ORGANIZE_BY_ARTIST === 'true') {
        const albumFolder = qobuzService.formatAlbumFolderName(album);
        finalDir = path.join(this.downloadPath, albumFolder);
      }
      
      await fs.ensureDir(finalDir);
      await fs.ensureDir(this.tempPath);
      
      const tempFile = path.join(this.tempPath, `${downloadInfo.id}.${qualityInfo.extension}`);
      const finalFile = path.join(finalDir, fileName);
      
      // Download file
      await this.downloadFile(fileUrlData.url, tempFile, downloadInfo, broadcastFn);
      
      // Process metadata
      downloadInfo.status = 'processing';
      this.broadcast(downloadInfo, broadcastFn);
      
      await metadataService.embedMetadata(tempFile, finalFile, track, album);
      
      // Clean up temp file
      await fs.remove(tempFile);
      
      downloadInfo.status = 'completed';
      downloadInfo.filePath = finalFile;
      downloadInfo.endTime = new Date().toISOString();
      
      // Add to history
      this.addToHistory(downloadInfo);
      
      this.broadcast(downloadInfo, broadcastFn);
      
    } catch (error) {
      downloadInfo.status = 'failed';
      downloadInfo.error = error.message;
      this.broadcast(downloadInfo, broadcastFn);
      throw error;
    }
  }

  async processAlbumDownload(downloadInfo) {
    const { album, tracks, quality, broadcastFn } = downloadInfo;
    
    try {
      downloadInfo.status = 'downloading';
      this.broadcast(downloadInfo, broadcastFn);
      
      // Create album directory
      const albumFolder = qobuzService.formatAlbumFolderName(album);
      const albumDir = path.join(this.downloadPath, albumFolder);
      await fs.ensureDir(albumDir);
      
      // Download tracks sequentially to avoid overwhelming the server
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        
        try {
          // Get download URL using the new qobuz-dl-api format
          console.log(`Requesting download URL for track ${track.id} with quality ${quality}`);
          const fileUrlData = await qobuzService.getTrackFileUrl(track.id, quality);
          console.log(`Received download URL response for track ${track.id}:`, fileUrlData);
          
          if (!fileUrlData.url) {
            console.warn(`No download URL for track ${track.id}, skipping`);
            continue;
          }
          
          // Prepare file paths
          const qualityInfo = qobuzService.getQualityInfo(quality);
          const fileName = qobuzService.formatTrackFilename(track, album, qualityInfo);
          const tempFile = path.join(this.tempPath, `${downloadInfo.id}_${track.id}.${qualityInfo.extension}`);
          const finalFile = path.join(albumDir, fileName);
          
          // Download file
          await this.downloadFile(fileUrlData.url, tempFile, downloadInfo, broadcastFn, i, tracks.length);
          
          // Process metadata
          await metadataService.embedMetadata(tempFile, finalFile, track, album);
          
          // Clean up temp file
          await fs.remove(tempFile);
          
          downloadInfo.completedTracks++;
          downloadInfo.progress = Math.round((downloadInfo.completedTracks / tracks.length) * 100);
          
          this.broadcast(downloadInfo, broadcastFn);
          
        } catch (trackError) {
          console.error(`Failed to download track ${track.id}:`, trackError);
          // Continue with next track
        }
      }
      
      downloadInfo.status = 'completed';
      downloadInfo.endTime = new Date().toISOString();
      
      // Add to history
      this.addToHistory(downloadInfo);
      
      this.broadcast(downloadInfo, broadcastFn);
      
    } catch (error) {
      downloadInfo.status = 'failed';
      downloadInfo.error = error.message;
      this.broadcast(downloadInfo, broadcastFn);
      throw error;
    }
  }

  async downloadFile(url, filePath, downloadInfo, broadcastFn, trackIndex = 0, totalTracks = 1) {
    console.log(`Starting download from URL: ${url}`);
    console.log(`Saving to: ${filePath}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }
    
    const totalSize = parseInt(response.headers.get('content-length') || '0');
    let downloadedSize = 0;
    
    console.log(`File size: ${totalSize} bytes (${Math.round(totalSize / 1024 / 1024)} MB)`);
    
    const writeStream = fs.createWriteStream(filePath);
    
    response.body.on('data', (chunk) => {
      downloadedSize += chunk.length;
      
      if (totalSize > 0) {
        const fileProgress = Math.round((downloadedSize / totalSize) * 100);
        
        if (downloadInfo.type === 'album') {
          const overallProgress = Math.round(((trackIndex + (downloadedSize / totalSize)) / totalTracks) * 100);
          downloadInfo.progress = overallProgress;
        } else {
          downloadInfo.progress = fileProgress;
        }
        
        // Broadcast progress update every 5% to avoid spam
        if (downloadInfo.progress % 5 === 0) {
          this.broadcast(downloadInfo, broadcastFn);
        }
      }
    });
    
    await pipeline(response.body, writeStream);
    console.log(`Download completed: ${filePath}`);
  }

  broadcast(downloadInfo, broadcastFn) {
    if (broadcastFn) {
      broadcastFn({
        type: 'download_update',
        data: {
          id: downloadInfo.id,
          status: downloadInfo.status,
          progress: downloadInfo.progress,
          completedTracks: downloadInfo.completedTracks,
          totalTracks: downloadInfo.totalTracks,
          error: downloadInfo.error
        }
      });
    }
  }

  addToHistory(downloadInfo) {
    this.downloadHistory.unshift({
      id: downloadInfo.id,
      type: downloadInfo.type,
      title: downloadInfo.type === 'album' ? downloadInfo.album.title : downloadInfo.track.title,
      artist: downloadInfo.type === 'album' ? downloadInfo.album.artist.name : downloadInfo.track.performer?.name,
      quality: qobuzService.getQualityInfo(downloadInfo.quality).name,
      startTime: downloadInfo.startTime,
      endTime: downloadInfo.endTime,
      status: downloadInfo.status,
      filePath: downloadInfo.filePath
    });
    
    // Keep only last 100 entries
    if (this.downloadHistory.length > 100) {
      this.downloadHistory = this.downloadHistory.slice(0, 100);
    }
  }

  getDownloadStatus() {
    const active = Array.from(this.activeDownloads.values()).map(download => ({
      id: download.id,
      type: download.type,
      status: download.status,
      progress: download.progress,
      title: download.type === 'album' ? download.album?.title : download.track?.title,
      artist: download.type === 'album' ? download.album?.artist?.name : download.track?.performer?.name,
      completedTracks: download.completedTracks,
      totalTracks: download.totalTracks,
      startTime: download.startTime
    }));
    
    return {
      active,
      queue: this.downloadQueue.length,
      maxConcurrent: this.maxConcurrentDownloads
    };
  }

  getDownloadHistory() {
    return this.downloadHistory;
  }

  cancelDownload(downloadId) {
    const download = this.activeDownloads.get(downloadId);
    if (download) {
      download.status = 'cancelled';
      this.activeDownloads.delete(downloadId);
      
      // Remove from queue if it's there
      const queueIndex = this.downloadQueue.findIndex(d => d.id === downloadId);
      if (queueIndex !== -1) {
        this.downloadQueue.splice(queueIndex, 1);
      }
    }
  }
}

module.exports = new DownloadService();
