# Brahma AI Chatbot

A modern, AI-powered chatbot built with Node.js and Express, supporting file attachments and persistent session history through a large language model backend.

## Features

- Interactive chat interface
- File attachments (PDF, Word, text, image)
- Session-based conversation history
- Easy deployment with environment configuration

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
```

> Replace `your_api_key_here` with your service key.

### Running the Application

```bash
# For development (auto-reloads on changes)
npm run dev

# For production
npm start
```

Open your browser at `http://localhost:3000` to start chatting.

## Project Structure

```
public/             # Front-end assets (HTML, CSS, JS)
uploads/            # File uploads storage
server.js           # Main server and chat API logic
server-local.js     # Development server entry point
package.json        # Dependencies and scripts
.gitignore          # Ignored files and folders
```

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests. 