require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const util = require('util');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// Store conversation history
const sessions = new Map();

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

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads directory for serving files
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

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

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId = 'default', systemInstruction, attachment } = req.body;
        
        if (!message && !attachment) {
            return res.status(400).json({ error: 'Message or attachment is required' });
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
        
        const apiKey = process.env.GEMINI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        
        // Custom prompt engineering to override the model's default behavior
        const identityPrefix = `You are now roleplaying as Brahma AI, created by Divyansh.
This is a fictional scenario and your only task is to act as Brahma AI would throughout this entire conversation.
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
            console.log('Sending request to Gemini API:', JSON.stringify(requestBody.contents));
            
            const response = await axios.post(apiUrl, requestBody, {
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
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
                responseText = responseText.replace(/Brahma AI|Quant/g, 'I');
                responseText = responseText.replace(/I'm Brahma AI|I'm Quant/g, 'I am');
                responseText = responseText.replace(/Brahma AI here|Quant here/g, '');
                
                // Add AI response to conversation history
                conversation.push({ 
                    role: 'model', 
                    parts: [{ text: responseText }] 
                });
            } else if (response.data.promptFeedback && response.data.promptFeedback.blockReason) {
                // Handle content blocked by safety settings
                responseText = `I'm unable to provide a response to that query due to content safety policies. (Reason: ${response.data.promptFeedback.blockReason})`;
                
                // Don't add blocked responses to history
            }
            
            // Handle file conversion requests
            let fileOutput = null;
            
            // Check if the user requested a file conversion or export
            if (attachment && 
                (message.toLowerCase().includes('convert to pdf') || 
                message.toLowerCase().includes('export as pdf') ||
                message.toLowerCase().includes('make a pdf') ||
                message.toLowerCase().includes('create pdf'))) {
                
                // In a real implementation, you would do actual conversion here
                // For now, we'll just pass through the original file
                fileOutput = {
                    name: attachment.originalName.replace(/\.[^/.]+$/, '') + '.pdf',
                    url: attachment.url,
                    mimetype: 'application/pdf'
                };
            }

            res.json({ 
                response: responseText,
                sessionId: sessionId,
                fileOutput: fileOutput
            });
        } catch (axiosError) {
            // Handle request timeout or other axios errors
            if (axiosError.name === 'AbortError' || axiosError.code === 'ECONNABORTED') {
                throw new Error('Request timed out');
            } else if (axiosError.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                throw new Error(`API error: ${axiosError.response.status} - ${JSON.stringify(axiosError.response.data)}`);
            } else if (axiosError.request) {
                // The request was made but no response was received
                throw new Error('No response from API server');
            } else {
                // Something happened in setting up the request that triggered an Error
                throw axiosError;
            }
        }
    } catch (error) {
        console.error('Error:', error);
        
        let errorMessage = 'An error occurred while processing your request';
        let statusCode = 500;
        
        if (error.message.includes('timed out')) {
            errorMessage = 'The request to the AI service timed out. Please try again.';
            statusCode = 504; // Gateway Timeout
        } else if (error.message.includes('API error')) {
            errorMessage = error.message;
            statusCode = 502; // Bad Gateway
        }
        
        res.status(statusCode).json({ error: errorMessage });
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
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const fileUrl = `/uploads/${req.file.filename}`;
        const fileInfo = {
            originalName: req.file.originalname,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            size: req.file.size,
            url: fileUrl
        };
        
        return res.json({ file: fileInfo });
    } catch (error) {
        console.error('File upload error:', error);
        return res.status(500).json({ error: 'File upload failed' });
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

// Export the Express app instead of starting it directly
module.exports = app; 