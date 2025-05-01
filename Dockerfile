FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy app source
COPY . .

# Create a non-root user and switch to it
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001 && \
    mkdir -p /app/uploads && \
    chown -R nodeuser:nodejs /app

# Switch to non-root user
USER nodeuser

# Set environment variables
ENV NODE_ENV=production

# Expose the port (Render will override this)
EXPOSE 3000

# Run the application
CMD ["npm", "start"] 