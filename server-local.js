const app = require('./server');
const port = process.env.PORT || 3000;

// Start local server for development
app.listen(port, () => {
    console.log(`✅ Server is running on port ${port}`);
    console.log(`Visit http://localhost:${port} to access the chatbot`);
}); 