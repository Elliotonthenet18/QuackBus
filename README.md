# QuackBus

QuackBus is a free and open-source Docker application for downloading high-quality music. No account required - just search, find, and download!

## ✨ Features

- **Zero Configuration**: No account required - just search and download!
- **High-Quality Downloads**: FLAC, Hi-Res (96kHz/192kHz), and MP3 formats
- **Modern Web Interface**: Clean, responsive UI built with React
- **Smart Organization**: Automatically organizes downloads by Artist/Album
- **Multiple Downloads**: Download multiple tracks simultaneously with queue management
- **Real-time Progress**: Live download status and progress tracking via WebSocket
- **Metadata Embedding**: Automatically embeds track metadata and album artwork using FFmpeg
- **Download History**: Track completed downloads and manage your library
- **Quality Control**: Choose your preferred audio quality per download
- **Audio Quality Display**: See bitrate and Hi-Res status for albums and tracks

## 🚀 Quick Start

### Using Docker Compose (Recommended)

1. **Create directory and download:**
```bash
mkdir quackbus && cd quackbus
```

2. **Create docker-compose.yml:**
```yaml
services:
  quackbus:
    image: elliotonthenet18/quackbus:latest
    container_name: quackbus
    ports:
      - "7277:7277"
    volumes:
      - ./downloads:/app/downloads
      - ./config:/app/config
      - ./logs:/app/logs  # Add logs volume
      - ./temp:/app/temp  
      - /path/to/your/music/folder:/app/music  # Change this to your actual music directory
    environment:
      # Download Configuration
      - DEFAULT_QUALITY=7  # 7=Hi-Res, 6=CD Quality, 5=MP3 320k
      - DOWNLOAD_PATH=/app/music
      - TEMP_PATH=/app/temp
      
      # Metadata Configuration
      - EMBED_ARTWORK=true
      - ORGANIZE_BY_ARTIST=true
      - CREATE_ALBUM_FOLDERS=true
      
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

3. **Edit the music folder path:**
```bash
nano docker-compose.yml
# Change this line:
# - /path/to/your/music/folder:/app/music
# To your actual music folder, for example:
# - /home/username/Music:/app/music
```

4. **Start QuackBus:**
```bash
docker-compose up -d
```

5. **Access the interface:**
```
http://localhost:7277
```

### After running, you'll have:
```
quackbus/
├── docker-compose.yml
├── downloads/           # Temporary download staging
├── data/               # Application data and download history
└── logs/               # Application logs (if mapped)
```

Plus your music will be organized in your specified music folder!

## 📁 File Organization

Downloads are automatically organized as:
```
music/
├── Artist Name - Album Name (Year)/
│   ├── 01 - Track Name.flac
│   ├── 02 - Track Name.flac
│   ├── Cover.jpg
│   └── ...
```

## 🎵 Audio Quality Options

- **MP3 320k**: Standard high-quality MP3
- **CD Quality**: 16-bit/44.1kHz FLAC
- **Hi-Res 96kHz**: 24-bit/96kHz FLAC
- **Hi-Res 192kHz**: 24-bit/192kHz FLAC (Premium)

Quality information is displayed in search results and album details, including:
- Bitrate display (e.g., "24bit/44.1kHz")
- Hi-Res badge for high-resolution audio
- Audio quality indicators in search results

## 🎯 How to Use

1. **Search for Music**: Use the search bar to find artists, albums, or tracks
2. **Select Quality**: Choose your preferred audio quality (MP3 320k, CD Quality, Hi-Res)
3. **Download**: Click download on individual tracks or entire albums
4. **Monitor Progress**: Watch real-time download progress in the downloads section
5. **View History**: Check your download history in the History tab
6. **Enjoy**: Your music is automatically organized with embedded metadata and artwork

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_QUALITY` | `7` | Default audio quality (5=MP3, 6=CD, 7=Hi-Res 96k, 27=Hi-Res 192k) |
| `DOWNLOAD_PATH` | `/app/music` | Final music library location |
| `TEMP_PATH` | `/app/temp` | Temporary processing directory |
| `EMBED_ARTWORK` | `true` | Embed album artwork in files |
| `ORGANIZE_BY_ARTIST` | `true` | Create artist/album folder structure |

### Docker Compose Override

Create a `docker-compose.override.yml` file for custom settings:
```yaml
services:
  quackbus:
    environment:
      - DEFAULT_QUALITY=6  # CD Quality by default
```

## 🔧 Development

### Building from Source

```bash
git clone https://github.com/Elliotonthenet18/QuackBus.git
cd QuackBus
docker build -t elliotonthenet18/quackbus:latest .
```

### Running in Development Mode

```bash
# Backend
npm install
npm run dev

# Frontend (in another terminal)
cd client
npm install
npm start
```

## 📊 Integration

The application provides various endpoints for integration with other tools and services.

## 🛠️ Troubleshooting

### Port 7277 already in use:
```bash
# Check what's using the port
lsof -i :7277
# Stop the application and restart
docker-compose down && docker-compose up -d
```

### Container won't start:
```bash
# Check container logs
docker-compose logs quackbus
# Check container status
docker-compose ps
```

### View application logs:
```bash
docker-compose logs -f quackbus
```

### Restart the application:
```bash
docker-compose restart
```

### Download history not persisting:
Make sure the `./data` volume is properly mapped in your docker-compose.yml:
```yaml
volumes:
  - ./data:/app/data  # This persists download history
```

## 🔒 Privacy & Security

QuackBus processes all downloads locally in your Docker container. Your downloads are private, and no personal data is collected or stored externally.

## ⚖️ Legal Disclaimer

This application is for educational purposes only. Users are responsible for complying with applicable terms of service and copyright laws. Only download music you own or have permission to download.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

- 🐛 **Issues**: [GitHub Issues](https://github.com/Elliotonthenet18/QuackBus/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/Elliotonthenet18/QuackBus/discussions)

## 📝 License

This project is provided as-is for educational purposes. Please respect the terms of service of any websites you access and local copyright laws.

---

Made with ❤️ for music lovers who appreciate quality.

## ⚠️ DMCA Notice

This program does not support or endorse the downloading of copyrighted content, and is not responsible for content users choose to download. Users are solely responsible for ensuring they have the legal right to download and possess any content obtained through this software. Please respect copyright laws and only download content you own or have explicit permission to download.
