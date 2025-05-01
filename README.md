# Brahma AI Chatbot

A modern, AI-powered chatbot built with Node.js and Express, supporting file attachments and persistent session history through a large language model backend.

## Features

- Interactive chat interface
- File attachments (PDF, Word, text, image)
- Session-based conversation history
- Easy deployment with environment configuration
- Production-ready with security headers and performance optimization

## Getting Started

### Prerequisites

- Node.js v18 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/rawdiv/chatbot.git

# Navigate into the project directory
cd chatbot

# Install dependencies
npm install
```

### Configuration

Create a `.env` file in the project root and add:

```env
GEMINI_API_KEY=your_api_key_here
PORT=3000
NODE_ENV=development
```

> Replace `your_api_key_here` with your service key.

### Running the Application

```bash
# For development (auto-reloads on changes)
npm run dev

# For production
npm run start:prod
```

Open your browser at `http://localhost:3000` to start chatting.

## Production Deployment

### Security Features

This application includes the following production-ready security features:
- CORS protection
- Helmet security headers
- Content Security Policy
- Rate limiting
- File upload validation
- Input sanitization
- Request size limiting

### Performance Optimizations

- Response compression
- Static asset caching
- Session cleanup
- File upload cleanup

### Deployment Options

#### Option 1: Traditional Server

1. Set up a server with Node.js 18+
2. Clone the repository
3. Install dependencies with `npm ci` (for clean install)
4. Create `.env` file with production settings (see Configuration)
5. Start the server with `npm run start:prod`

#### Option 2: Docker Deployment

Create a Dockerfile in the project root:

```Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server-local.js"]
```

Build and run the Docker image:

```bash
docker build -t brahma-ai-chatbot .
docker run -p 3000:3000 --env-file .env brahma-ai-chatbot
```

## Project Structure

```
public/             # Front-end assets (HTML, CSS, JS)
uploads/            # File uploads storage
server.js           # Main server and chat API logic
server-local.js     # Development server entry point
package.json        # Dependencies and scripts
.gitignore          # Ignored files and folders
```

## Health Monitoring

The application includes a health check endpoint at `/health` that can be used for monitoring.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests. 