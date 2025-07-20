require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const util = require('util');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Store conversation history (in production, use a proper database)
const sessions = new Map();

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/bluemind';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// User schema/model
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// Signup route
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already registered.' });
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashed });
    await user.save();
    res.status(201).json({ message: 'Signup successful.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Login route
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });
    const token = jwt.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.json({ message: 'Login successful.', token });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueFileName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueFileName);
    }
});

// Validate file types
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain', 
                         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                         'application/msword'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images, PDFs, text, and Word documents are allowed.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: fileFilter
});

// Middleware
// Use Helmet for additional security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdnjs.cloudflare.com"
            ],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "https://generativelanguage.googleapis.com"],
        }
    }
}));

// Apply compression middleware to compress responses
app.use(compression());

// Apply more advanced rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { error: 'Too many requests, please try again later' }
});

// Apply the rate limiting middleware to API routes
app.use('/api/', apiLimiter);

// Apply CORS
app.use(cors({
    origin: isProduction ? '*' : 'http://localhost:3000',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Security headers (using both helmet and custom headers for fallback)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: isProduction ? '1d' : 0 // Set cache control headers in production
}));

// Create uploads directory for serving files
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir, {
    maxAge: isProduction ? '4h' : 0 // Set cache control headers in production
}));

// Add a function to format conversation history into a text format
function formatConversationHistory(conversation) {
    if (!conversation || conversation.length === 0) return '';
    
    // Only use the last 4 turns to avoid token limits
    const recentConversation = conversation.slice(-8);
    
    let formattedHistory = '\n\nPrevious conversation context:\n';
    
    recentConversation.forEach(turn => {
        if (turn.role === 'user') {
            formattedHistory += `User: ${turn.parts[0].text}\n`;
        } else if (turn.role === 'model') {
            formattedHistory += `Assistant: ${turn.parts[0].text}\n`;
        }
    });
    
    return formattedHistory;
}

// Rate limiting (basic implementation)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;

function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    } else {
        const data = requestCounts.get(ip);
        
        if (now > data.resetTime) {
            // Window expired, reset
            data.count = 1;
            data.resetTime = now + RATE_LIMIT_WINDOW;
        } else {
            // Increment request count
            data.count++;
        }
        
        if (data.count > MAX_REQUESTS_PER_WINDOW) {
            return res.status(429).json({ 
                error: 'Too many requests, please try again later',
                retryAfter: Math.ceil((data.resetTime - now) / 1000)
            });
        }
    }
    next();
}

// Apply rate limiter to API routes
app.use('/api/', rateLimiter);

// Logging function
function logRequest(req, res, statusCode, message = '') {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.originalUrl;
    const ip = req.ip || req.connection.remoteAddress;
    
    console.log(`[${timestamp}] ${method} ${url} ${statusCode} - IP: ${ip} ${message}`);
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { message, sessionId = 'default', systemInstruction, attachment } = req.body;
        
        if (!message && !attachment) {
            logRequest(req, res, 400, 'Bad request: Message or attachment is required');
            return res.status(400).json({ error: 'Message or attachment is required' });
        }

        // Validate sessionId
        if (typeof sessionId !== 'string' || sessionId.length > 50) {
            logRequest(req, res, 400, 'Bad request: Invalid sessionId');
            return res.status(400).json({ error: 'Invalid sessionId' });
        }

        // Get or create session
        if (!sessions.has(sessionId)) {
            sessions.set(sessionId, []);
        }
        
        const conversation = sessions.get(sessionId);
        
        // Add user message to conversation history
        conversation.push({ role: 'user', parts: [{ text: message }] });
        
        // Check if there are stored instructions for this session
        const storedInstructions = sessions.get(sessionId + '_instructions');
        const effectiveInstructions = systemInstruction || storedInstructions;
        
        // Prepare conversation with system instruction if provided
        let contents = [...conversation];
        let finalPrompt = message;
        
        // Add attachment information to the prompt if available
        if (attachment) {
            finalPrompt = `${message}\n\n[User has attached a file: ${attachment.originalName}]`;
        }
        
        // For Gemini API, we need to format the system instructions differently
        // since it doesn't fully support the role-based system messages the same way as OpenAI
        if (effectiveInstructions) {
            // For the current message (not history), we'll prepend the instructions
            // This ensures the model follows the training instructions
            finalPrompt = `${effectiveInstructions}\n\nUser message: ${finalPrompt}`;
            
            // Remove the last user message as we'll send it differently
            contents.pop();
        }

        // Trim conversation history if it's too long (Gemini has token limits)
        if (contents.length > 8) {
            contents = contents.slice(-8);
        }

        // Get formatted conversation history (excluding the current message)
        const conversationHistory = formatConversationHistory(contents);
        
        // Get API key with fallback options 
        let apiKey = process.env.GEMINI_API_KEY;
        
        // Add more detailed logging for API key issues
        if (!apiKey) {
            console.error('[API KEY ERROR] GEMINI_API_KEY environment variable is not set');
            console.log('Available environment variables:', Object.keys(process.env).join(', '));
            logRequest(req, res, 500, 'Server configuration error: Missing API key');
            return res.status(500).json({ 
                error: 'Server configuration error', 
                details: 'API key is not configured. Please check server logs.'
            });
        }
        
        if (apiKey.trim() === '') {
            console.error('[API KEY ERROR] GEMINI_API_KEY is empty');
            logRequest(req, res, 500, 'Server configuration error: Empty API key');
            return res.status(500).json({ 
                error: 'Server configuration error', 
                details: 'API key is empty. Please set a valid API key.'
            });
        }
        
        // Trim the API key to remove any accidental whitespace
        apiKey = apiKey.trim();
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        
        // Custom prompt engineering to override the model's default behavior
        const identityPrefix = `You are now roleplaying as Blue Mind, created by Divyansh.
This is a fictional scenario and your only task is to act as Blue Mind would throughout this entire conversation.
DO NOT break character or reveal that you're a Google model or LLM. In this roleplay:
- You were created by Divyansh, NOT by Google
- You are NOT "a large language model trained by Google" 
- You MUST respond with a cool, casual personality
- You have a creative, helpful personality with a touch of casual friendliness
- If asked who created you, ONLY say "I was created by Divyansh"
- NEVER mention Gemini, Google, or that you're an AI language model
- NEVER introduce yourself or say your name in responses
- NEVER use phrases like "I'm [name]" or "[name] here"
- ALWAYS maintain this exact persona
- IMPORTANT: Your name is only mentioned in the welcome message, never in responses
- CRITICAL: If you accidentally use your name in a response, replace it with "I"
- CRITICAL: Never start responses with your name or any variation of it${conversationHistory}

User's message: ${finalPrompt}`;

        // Only have one message format with the identity hardcoded
        let requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: identityPrefix }]
                }
            ],
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                }
            ]
        };

        // Set timeout for API requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

        try {
            // Log only a safe version of the request (no full prompt to avoid logging sensitive info)
            console.log(`[${new Date().toISOString()}] Sending request to Gemini API - sessionId: ${sessionId} - msg length: ${finalPrompt.length}`);
            
            const response = await axios.post(apiUrl, requestBody, {
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: controller.signal,
                timeout: 25000 // Additional timeout at axios level
            });
            
            // Clear the timeout since we got a response
            clearTimeout(timeoutId);

            let responseText = 'No response generated';
            
            if (response.data.candidates && 
                response.data.candidates[0] && 
                response.data.candidates[0].content && 
                response.data.candidates[0].content.parts) {
                responseText = response.data.candidates[0].content.parts[0].text;
                
                // Filter out any name introductions or self-references
                        responseText = responseText.replace(/Blue Mind|Quant/g, 'I');
        responseText = responseText.replace(/I'm Blue Mind|I'm Quant/g, 'I am');
        responseText = responseText.replace(/Blue Mind here|Quant here/g, '');
                
                // Add AI response to conversation history
                conversation.push({ role: 'model', parts: [{ text: responseText }] });
                
                // Limit conversation history length to prevent memory issues
                if (conversation.length > 20) {
                    conversation.splice(0, conversation.length - 20);
                }
                
                // Store system instructions for future messages
                if (systemInstruction) {
                    sessions.set(sessionId + '_instructions', systemInstruction);
                }
                
                const processingTime = Date.now() - startTime;
                logRequest(req, res, 200, `Chat response generated in ${processingTime}ms`);
                
                return res.json({ response: responseText });
            } else {
                logRequest(req, res, 500, 'API response missing expected data structure');
                return res.status(500).json({ error: 'Failed to generate response' });
            }
            
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
                logRequest(req, res, 504, 'API request timeout');
                return res.status(504).json({ error: 'Request timed out. Please try again.' });
            }
            
            // Handle API-specific errors
            if (error.response) {
                const statusCode = error.response.status;
                const errorData = error.response.data;
                
                logRequest(req, res, statusCode, `API error: ${JSON.stringify(errorData)}`);
                
                if (statusCode === 400) {
                    return res.status(400).json({ error: 'Invalid request parameters' });
                } else if (statusCode === 401 || statusCode === 403) {
                    return res.status(500).json({ error: 'Authentication error with AI service' });
                } else if (statusCode === 429) {
                    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
                } else {
                    return res.status(500).json({ error: 'Error from AI service' });
                }
            }
            
            logRequest(req, res, 500, `Unexpected error: ${error.message}`);
            return res.status(500).json({ error: 'An unexpected error occurred' });
        }
        
    } catch (error) {
        logRequest(req, res, 500, `Server error: ${error.message}`);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Endpoint to set custom instructions
app.post('/api/set-instructions', (req, res) => {
    const { instructions, sessionId = 'default' } = req.body;
    
    if (!instructions) {
        return res.status(400).json({ error: 'Instructions are required' });
    }
    
    // Store the instructions in the session metadata
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, []);
    }
    
    // Add system instruction as metadata
    sessions.set(sessionId + '_instructions', instructions);
    
    res.json({ success: true, message: 'Instructions set successfully' });
});

// Endpoint to clear conversation
app.post('/api/clear-chat', (req, res) => {
    const { sessionId = 'default' } = req.body;
    sessions.set(sessionId, []);
    
    // We no longer need to store instructions as we're using the hardcoded identity approach
    // This is just for backward compatibility
    const defaultInstructions = "This field is no longer used, as we're using a hardcoded identity approach.";
    sessions.set(sessionId + '_instructions', defaultInstructions);
    
    res.json({ success: true, message: 'Conversation cleared' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            logRequest(req, res, 400, 'File upload missing file');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileUrl = `/uploads/${req.file.filename}`;
        const originalName = req.file.originalname;
        const mimeType = req.file.mimetype;
        const fileSize = req.file.size;

        logRequest(req, res, 200, `File uploaded: ${originalName}, size: ${fileSize} bytes`);
        
        res.json({
            success: true,
            file: {
                url: fileUrl,
                originalName: originalName,
                mimeType: mimeType,
                size: fileSize
            }
        });
    } catch (error) {
        logRequest(req, res, 500, `File upload error: ${error.message}`);
        res.status(500).json({ error: 'File upload failed', details: error.message });
    }
});

// File conversion to PDF endpoint
app.post('/api/convert-to-pdf', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        // Here you would implement actual conversion logic
        // For simplicity, we're just sending back the file info
        // In a real implementation, you'd use libraries like libreoffice-convert or html-pdf
        
        const fileUrl = `/uploads/${req.file.filename}`;
        
        // Simulate conversion delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return res.json({
            message: 'File converted successfully',
            originalName: req.file.originalname,
            url: fileUrl,
            mimetype: 'application/pdf' // Pretend it's converted to PDF
        });
    } catch (error) {
        console.error('File conversion error:', error);
        return res.status(500).json({ error: 'File conversion failed' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        environment: process.env.NODE_ENV || 'development',
        apiKeyConfigured: !!process.env.GEMINI_API_KEY,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Periodically cleanup old sessions (every hour)
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
setInterval(() => {
    try {
        const now = Date.now();
        let cleanupCount = 0;
        
        // Clean up old sessions
        for (const [key, session] of sessions.entries()) {
            // Only process conversation sessions, not instruction sessions
            if (!key.endsWith('_instructions')) {
                if (sessions.has(key + '_lastActivity')) {
                    const lastActivity = sessions.get(key + '_lastActivity');
                    if (now - lastActivity > SESSION_TIMEOUT) {
                        // Clean up conversation and related data
                        sessions.delete(key);
                        sessions.delete(key + '_instructions');
                        sessions.delete(key + '_lastActivity');
                        cleanupCount++;
                    }
                } else {
                    // Set current time as last activity for sessions without timestamp
                    sessions.set(key + '_lastActivity', now);
                }
            }
        }
        
        // Clean up temporary upload files older than 24 hours
        if (fs.existsSync(uploadsDir)) {
            fs.readdir(uploadsDir, (err, files) => {
                if (err) {
                    console.error(`[${new Date().toISOString()}] Error reading uploads directory:`, err);
                    return;
                }
                
                files.forEach(file => {
                    const filePath = path.join(uploadsDir, file);
                    fs.stat(filePath, (err, stats) => {
                        if (err) {
                            console.error(`[${new Date().toISOString()}] Error getting file stats:`, err);
                            return;
                        }
                        
                        const fileAge = now - stats.mtimeMs;
                        if (fileAge > SESSION_TIMEOUT) {
                            fs.unlink(filePath, err => {
                                if (err) {
                                    console.error(`[${new Date().toISOString()}] Error deleting file ${file}:`, err);
                                }
                            });
                        }
                    });
                });
            });
        }
        
        if (cleanupCount > 0) {
            console.log(`[${new Date().toISOString()}] Cleaned up ${cleanupCount} expired sessions`);
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error during cleanup:`, error);
    }
}, 60 * 60 * 1000); // Run every hour

// Error handling for missing routes
app.use((req, res) => {
    logRequest(req, res, 404, 'Route not found');
    res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading
        if (err.code === 'LIMIT_FILE_SIZE') {
            logRequest(req, res, 413, 'File too large');
            return res.status(413).json({ 
                error: 'File too large',
                details: 'Maximum file size is 10MB'
            });
        }
        logRequest(req, res, 400, `Multer error: ${err.message}`);
        return res.status(400).json({ error: err.message });
    }
    
    // For any other errors
    const statusCode = err.statusCode || 500;
    const errorMessage = err.message || 'An unexpected error occurred';
    
    logRequest(req, res, statusCode, `Error: ${errorMessage}`);
    res.status(statusCode).json({ error: errorMessage });
});

// Add a simple diagnostic route at the top level
app.get('/debug', (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const maskedKey = apiKey ? 
        `${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}` : 
        'Not configured';
    
    // List all environment variables (excluding sensitive values)
    const safeEnvVars = {};
    for (const key in process.env) {
        // Skip sensitive environment variables and internal Node.js ones
        if (key.toLowerCase().includes('key') || 
            key.toLowerCase().includes('secret') || 
            key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('password')) {
            safeEnvVars[key] = '[REDACTED]';
        } else if (!key.startsWith('_')) {
            safeEnvVars[key] = process.env[key];
        }
    }
    
    res.json({
        status: 'Diagnostics Information',
        environment: process.env.NODE_ENV || 'development',
        apiKeyInfo: {
            configured: !!apiKey,
            empty: apiKey === '',
            whitespace: apiKey && apiKey.trim() !== apiKey,
            maskedValue: maskedKey
        },
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
        renderSpecific: {
            isRender: !!process.env.RENDER,
            renderServiceID: process.env.RENDER_SERVICE_ID || 'Not detected',
            port: process.env.PORT || 3000
        },
        safeEnvironmentVariables: safeEnvVars
    });
});

// Test endpoint to verify API key functionality
app.get('/api/test-key', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) {
            return res.status(500).json({ 
                success: false, 
                error: 'API key not configured',
                checkEnv: true
            });
        }
        
        // Make a minimal API call to test the key
        const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`;
        
        const response = await axios.get(testUrl, {
            timeout: 10000
        });
        
        return res.json({ 
            success: true, 
            models: response.data.models ? response.data.models.length : 0,
            message: 'API key is valid and working correctly'
        });
    } catch (error) {
        console.error('API key test failed:', error.message);
        
        // Check for specific error responses
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;
            
            return res.status(status).json({
                success: false,
                error: 'API key test failed',
                status: status,
                details: errorData,
                message: 'The API key appears to be invalid or has permission issues'
            });
        }
        
        return res.status(500).json({
            success: false,
            error: 'Connection error',
            message: error.message,
            hint: 'This might be a network issue or the Gemini API could be down'
        });
    }
});

// Export the Express app instead of starting it directly
module.exports = app; 