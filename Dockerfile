FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    ffmpeg \
    curl \
    bash \
    git

# Set working directory
WORKDIR /app

# Copy package files for backend
COPY package*.json ./

# Install backend dependencies
RUN npm install

# Copy and install frontend dependencies
COPY client/package*.json ./client/
WORKDIR /app/client
RUN npm install

# Go back to app root
WORKDIR /app

# Copy application code
COPY . .

# Build the React frontend
WORKDIR /app/client
RUN npm run build

# Go back to app root
WORKDIR /app

# Create necessary directories with proper permissions
RUN mkdir -p /app/downloads /app/temp /app/music /app/config /app/logs && \
    chmod 755 /app/downloads /app/temp /app/music /app/config /app/logs

# Create non-root user for security
RUN addgroup -g 1001 -S quackbus && \
    adduser -S quackbus -u 1001 -G quackbus

# Set permissions for the quackbus user
RUN chown -R quackbus:quackbus /app && \
    chmod -R 755 /app/downloads /app/temp /app/music /app/config /app/logs

USER quackbus

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expose port
EXPOSE 7277

# Start the application
CMD ["npm", "start"]
