FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    ffmpeg \
    curl \
    bash \
    git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Create necessary directories
RUN mkdir -p /app/downloads /app/temp /app/music /app/config /app/logs

# Copy application code
COPY . .

# Build the React frontend
RUN npm run build

# Create non-root user for security
RUN addgroup -g 1001 -S quackbus && \
    adduser -S quackbus -u 1001 -G quackbus

# Set permissions
RUN chown -R quackbus:quackbus /app
USER quackbus

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
