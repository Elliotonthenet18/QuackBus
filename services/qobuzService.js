// Use built-in fetch (Node 18+)
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
    this.downloadQueue = [];
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
    if (this.downloadQueue.length === 0) {
      return;
    }
    
    const downloadInfo = this.downloadQueue.shift();
    
    try {
      if (downloadInfo.type === 'track') {
        await this.processTrackDownload(downloadInfo);
      } else if (downloadInfo.type === 'album') {
        await this.processAlbumDownload(downloadInfo);
      }
    } catch (error) {
      console.error(`Download failed for ${downloadInfo.id}:`, error);
      downloadInfo.status = 'failed';
