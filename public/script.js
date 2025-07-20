document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    const chatMessages = document.getElementById('chatMessages');
    const newChatBtn = document.getElementById('newChatBtn');
    const sendButton = document.getElementById('sendButton');
    const newChatHeaderBtn = document.getElementById('newChatHeaderBtn');
    const optionsBtn = document.getElementById('optionsBtn');
    const fileInput = document.getElementById('fileInput');
    const themeToggle = document.getElementById('themeToggle');
    const authBtn = document.getElementById('authBtn');

    // Session management
    let isGenerating = false;
    let attachedFile = null;
    let currentSessionId = localStorage.getItem('current_session_id') || null;
    
    // Create scroll to bottom button
    const scrollButton = document.createElement('button');
    scrollButton.id = 'scrollToBottom';
    scrollButton.innerHTML = '<i class="fas fa-arrow-down"></i>';
    scrollButton.title = 'Scroll to bottom';
    scrollButton.style.display = 'none';
    document.querySelector('.chat-container').appendChild(scrollButton);
    
    // File attachment handler
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            addMessage('File size exceeds the 10MB limit.', 'system');
            fileInput.value = '';
            return;
        }
        
        // Show loading message
        const loadingId = showLoading();
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('File upload failed');
            }
            
            const data = await response.json();
            attachedFile = data.file;
            
            // Remove loading and show file preview
            removeLoading(loadingId);
            showFilePreview(attachedFile);
            
        } catch (error) {
            removeLoading(loadingId);
            addMessage('Failed to upload file. Please try again.', 'system');
            console.error('Error uploading file:', error);
        }
        
            // Clear file input
    fileInput.value = '';
});
    
    // Dark mode functionality
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    }
    
    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    }
    
    function updateThemeIcon(theme) {
        if (theme === 'dark') {
            themeToggle.textContent = '☀️';
            themeToggle.title = 'Switch to light mode';
        } else {
            themeToggle.textContent = '🌙';
            themeToggle.title = 'Switch to dark mode';
        }
    }
    
    // Initialize theme
    initTheme();
    

    
    // Theme toggle event listener
    themeToggle.addEventListener('click', toggleTheme);
    
    // --- Auth State Management ---
    // This ensures the Login/Signup button always works
    setAuthState(isAuthenticated());
    // Do NOT set authBtn.onclick manually elsewhere; setAuthState handles it.
    function isAuthenticated() {
        return !!localStorage.getItem('jwt_token');
    }
    function setAuthState(loggedIn) {
        if (loggedIn) {
            authBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Logout';
            authBtn.className = 'auth-btn logout';
            authBtn.onclick = handleLogout;
        } else {
            authBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login / Signup';
            authBtn.className = 'auth-btn';
            authBtn.onclick = () => { window.location.href = 'auth.html'; };
        }
    }
    function handleLogout() {
        localStorage.removeItem('jwt_token');
        setAuthState(false);
    }
    function openAuthModal() {
        authModal.style.display = 'flex';
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        loginForm.style.display = 'flex';
        signupForm.style.display = 'none';
        loginError.textContent = '';
        signupError.textContent = '';
    }
    // On page load
    // setAuthState(isAuthenticated()); // This line is now redundant as setAuthState is called in DOMContentLoaded

    // --- Modal Authentication Logic (updated) ---
    // Remove this line if present:
    // authBtn.onclick = isAuthenticated() ? handleLogout : openAuthModal;

    // Handle login form submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Login failed');
            localStorage.setItem('jwt_token', data.token);
            setAuthState(true);
            authModal.style.display = 'none';
        } catch (err) {
            loginError.textContent = err.message;
        }
    });
    // Handle signup form submit
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        signupError.textContent = '';
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const confirm = document.getElementById('signupConfirmPassword').value;
        if (password !== confirm) {
            signupError.textContent = 'Passwords do not match.';
            return;
        }
        try {
            const res = await fetch('/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Signup failed');
            // Auto-login after signup
            const loginRes = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const loginData = await loginRes.json();
            if (!loginRes.ok) throw new Error(loginData.error || 'Login failed');
            localStorage.setItem('jwt_token', loginData.token);
            setAuthState(true);
            authModal.style.display = 'none';
        } catch (err) {
            signupError.textContent = err.message;
        }
    });
    
    // Show file preview in chat
    function showFilePreview(file) {
        const previewDiv = document.createElement('div');
        previewDiv.className = 'file-preview';
        previewDiv.id = 'current-attachment';
        
        let previewContent = '';
        
        if (file.mimetype.startsWith('image/')) {
            previewContent = `<img src="${file.url}" alt="${file.originalName}">`;
        } else {
            const fileIcon = getFileIcon(file.mimetype);
            previewContent = `<div class="file-icon">${fileIcon}</div>`;
        }
        
        previewDiv.innerHTML = `
            ${previewContent}
            <div class="file-info">
                <div class="file-name">${file.originalName}</div>
                <div class="file-action">
                    <button onclick="removeAttachment()">
                        <i class="fas fa-times"></i> Remove
                    </button>
                </div>
            </div>
        `;
        
        // Remove any existing preview
        const existingPreview = document.getElementById('current-attachment');
        if (existingPreview) {
            existingPreview.remove();
        }
        
        // Add to chat messages
        chatMessages.appendChild(previewDiv);
        scrollToBottom();
    }
    
    // Get appropriate icon for file type
    function getFileIcon(mimetype) {
        if (mimetype.includes('pdf')) {
            return '<i class="fas fa-file-pdf" style="color: #e74c3c;"></i>';
        } else if (mimetype.includes('word') || mimetype.includes('doc')) {
            return '<i class="fas fa-file-word" style="color: #2980b9;"></i>';
        } else if (mimetype.includes('text')) {
            return '<i class="fas fa-file-alt" style="color: #7f8c8d;"></i>';
        } else {
            return '<i class="fas fa-file" style="color: #95a5a6;"></i>';
        }
    }
    
    // Remove file attachment
    window.removeAttachment = function() {
        const preview = document.getElementById('current-attachment');
        if (preview) {
            preview.remove();
        }
        attachedFile = null;
    };
    
    // Create download button for files
    window.createDownloadLink = function(url, fileName) {
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = fileName;
        downloadLink.className = 'download-btn';
        downloadLink.innerHTML = '<i class="fas fa-download"></i> Download';
        downloadLink.target = '_blank';
        return downloadLink;
    };
    
    // Convert file to PDF
    window.convertToPdf = async function(fileUrl, fileName) {
        try {
            const loadingId = showLoading();
            
            // Fetch the file first
            const fileResponse = await fetch(fileUrl);
            const fileBlob = await fileResponse.blob();
            
            // Create FormData with the file
            const formData = new FormData();
            formData.append('file', new File([fileBlob], fileName));
            
            // Send to conversion endpoint
            const response = await fetch('/api/convert-to-pdf', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('PDF conversion failed');
            }
            
            const data = await response.json();
            removeLoading(loadingId);
            
            // Add system message with download link
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message system-message';
            
            const avatar = document.createElement('div');
            avatar.className = 'avatar';
            avatar.innerHTML = '⚙️';
            
            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            messageContent.textContent = 'File converted to PDF successfully.';
            
            // Create download button
            const downloadBtn = createDownloadLink(data.url, data.originalName);
            messageContent.appendChild(document.createElement('br'));
            messageContent.appendChild(downloadBtn);
            
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(messageContent);
            chatMessages.appendChild(messageDiv);
            
            scrollToBottom();
            
        } catch (error) {
            removeLoading(loadingId);
            addMessage('Failed to convert file to PDF. Please try again.', 'system');
            console.error('Error converting file:', error);
        }
    };
    
    // Scroll button functionality
    scrollButton.addEventListener('click', () => {
        scrollToBottom(true);
    });
    
    // Track scroll position
    chatMessages.addEventListener('scroll', () => {
        const scrollPosition = chatMessages.scrollTop + chatMessages.clientHeight;
        const scrollHeight = chatMessages.scrollHeight;
        
        // Show button when not at bottom (50px threshold)
        if (scrollHeight - scrollPosition > 50) {
            scrollButton.style.display = 'flex';
        } else {
            scrollButton.style.display = 'none';
        }
    });
    
    // Function to scroll to bottom
    function scrollToBottom(animated = false) {
        if (animated) {
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: 'smooth'
            });
        } else {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    // Auto-resize textarea
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = userInput.scrollHeight + 'px';
    });

    // Handle Enter key in textarea (send on Enter, new line on Shift+Enter)
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent default behavior (new line)
            if (!isGenerating && userInput.value.trim()) {
                chatForm.dispatchEvent(new Event('submit')); // Trigger form submission
            }
        }
    });

    // Add command to set custom instructions
    function addSystemMessage() {
        const systemDiv = document.createElement('div');
        systemDiv.className = 'system-message';
        systemDiv.innerHTML = `
            <div class="system-form">
                <h3>Set Custom Instructions</h3>
                <p>Train your chatbot by providing specific instructions:</p>
                <textarea id="systemInstruction" placeholder="E.g., Always respond as a helpful assistant who specializes in web development" rows="3"></textarea>
                <p class="tips">Tips: Be specific in your instructions. For example, "You are a creative, friendly AI that communicates naturally and matches the user's tone."</p>
                <div class="system-buttons">
                    <button id="saveInstructions">Save Instructions</button>
                    <button id="cancelInstructions">Cancel</button>
                </div>
            </div>
        `;
        
        chatMessages.appendChild(systemDiv);
        scrollToBottom();
        
        // Set up event listeners
        document.getElementById('saveInstructions').addEventListener('click', async () => {
            const instructions = document.getElementById('systemInstruction').value;
            if (instructions) {
                try {
                    const response = await fetch('/api/set-instructions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ 
                            instructions, 
                            sessionId: currentSessionId 
                        }),
                    });
                    
                    if (response.ok) {
                        addMessage('Custom instructions set successfully. The chatbot will now follow your guidelines. Try asking a question to see how it responds!', 'system');
                    }
                } catch (error) {
                    console.error('Error setting instructions:', error);
                }
            }
            systemDiv.remove();
        });
        
        document.getElementById('cancelInstructions').addEventListener('click', () => {
            systemDiv.remove();
        });
    }

    // Handle form submission with file attachment support
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Prevent multiple submissions while generating
        if (isGenerating) return;
        
        const message = userInput.value.trim();
        if (!message && !attachedFile) return;

        // Check for commands
        if (message.startsWith('/train')) {
            addSystemMessage();
            userInput.value = '';
            userInput.style.height = 'auto';
            return;
        }
        
        // Check for conversion commands
        if (message.toLowerCase().includes('convert to pdf') && attachedFile) {
            convertToPdf(attachedFile.url, attachedFile.originalName);
            userInput.value = '';
            userInput.style.height = 'auto';
            return;
        }

        // Add user message to chat
        addMessage(message, 'user');
        
        // Keep a copy of the message before clearing
        const sentMessage = message;
        userInput.value = '';
        userInput.style.height = 'auto';
        
        // Save attached file to send with message
        const currentAttachment = attachedFile;
        attachedFile = null;
        
        // Remove file preview from chat
        const preview = document.getElementById('current-attachment');
        if (preview) {
            preview.remove();
        }
        
        // Make sure the input stays enabled and focused
        userInput.disabled = false;
        userInput.focus();

        // Show loading indicator
        const loadingId = showLoading();
        
        // Set generating state
        isGenerating = true;
        setLoadingState(true);

        try {
            // Use a timeout to ensure we show a response even if the API is very slow
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Request timed out')), 30000); // 30 second timeout
            });
            
            // Prepare request body
            const requestBody = { 
                message: sentMessage,
                sessionId: currentSessionId,
                model: 'gemini' // always 'gemini'
            };
            
            // Add file info if there's an attachment
            if (currentAttachment) {
                requestBody.attachment = currentAttachment;
            }
            
            const fetchPromise = fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            
            // Race between the fetch and timeout
            const response = await Promise.race([fetchPromise, timeoutPromise]);

            if (!response.ok) {
                throw new Error(`Network response error: ${response.status}`);
            }

            const data = await response.json();
            removeLoading(loadingId);
            
            // Handle file conversion response
            if (data.fileOutput) {
                // Add regular AI message first
                addMessage(data.response, 'ai');
                
                // Then add file download option
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ai-message';
                
                const avatar = document.createElement('div');
                avatar.className = 'avatar';
                avatar.innerHTML = '🤖';
                
                const messageContent = document.createElement('div');
                messageContent.className = 'message-content';
                messageContent.textContent = 'Here\'s your file. Click below to download:';
                
                // Create download button
                const downloadBtn = createDownloadLink(data.fileOutput.url, data.fileOutput.name);
                messageContent.appendChild(document.createElement('br'));
                messageContent.appendChild(downloadBtn);
                
                messageDiv.appendChild(avatar);
                messageDiv.appendChild(messageContent);
                chatMessages.appendChild(messageDiv);
                
                scrollToBottom();
            } else {
                // Regular message response
                addMessage(data.response, 'ai');
            }
            
            // Update session ID if provided
            if (data.sessionId) {
                currentSessionId = data.sessionId;
            }
        } catch (error) {
            console.error('Error:', error);
            removeLoading(loadingId);
            
            if (error.message.includes('timed out')) {
                addMessage('Sorry, the response is taking too long. Please try again or refresh the page.', 'system');
            } else {
                addMessage('Sorry, I encountered an error. Please try again.', 'system');
            }
        } finally {
            // Always reset the generating state regardless of success/failure
            isGenerating = false;
            setLoadingState(false);
        }
    });

    // Set loading state UI
    function setLoadingState(isLoading) {
        if (isLoading) {
            sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            sendButton.disabled = true;
        } else {
            sendButton.innerHTML = '<i class="fas fa-paper-plane"></i>';
            sendButton.disabled = false;
        }
    }

    // New chat button functionality
    newChatBtn.addEventListener('click', async () => {
        // Don't allow new chat while generating
        if (isGenerating) return;
        handleNewChat();
    });
    
    // Handle creating a new chat
    async function handleNewChat() {
        // Generate a new session ID
        currentSessionId = `session_${Date.now()}`;
        
        // Clear chat on server
        try {
            await fetch('/api/clear-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sessionId: currentSessionId }),
            });
        } catch (error) {
            console.error('Error clearing chat:', error);
        }
        
        // Clear chat UI
        chatMessages.innerHTML = '';
        
        // Add custom welcome message
        addMessage("Yo! I'm Blue Mind 😎\nLocally trained, crazy fast, and ready to help you build or automate whatever you're dreaming up.\nJust say the word and we'll cook something epic together 💻🚀", 'ai');
    }

    // Add message to chat
    function addMessage(content, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        
        if (sender === 'user') {
            avatar.innerHTML = '👤';
        } else if (sender === 'ai') {
            avatar.innerHTML = '🤖';
        } else if (sender === 'system') {
            avatar.innerHTML = '⚙️';
        }
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // Process content to add line breaks and format better
        const formattedContent = formatMessage(content);
        messageContent.innerHTML = formattedContent;
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        scrollToBottom();
        
        // Force layout recalculation to ensure proper scrolling
        setTimeout(() => scrollToBottom(), 100);
    }

    // Format message content to preserve formatting
    function formatMessage(content) {
        if (!content) return '';
        
        // Replace code blocks with formatted HTML
        content = content.replace(/```([\w]*)([\s\S]*?)```/g, (match, language, code) => {
            const formattedCode = code.trim();
            const lang = language || 'code';
            return `<div class="code-block">
                        <div class="code-header">
                            <span class="code-language">${lang}</span>
                            <button class="copy-code" onclick="copyToClipboard(this)">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                        <pre><code class="${lang}">${escapeHtml(formattedCode)}</code></pre>
                    </div>`;
        });
        
        // Replace inline code with formatted HTML
        content = content.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        
        // Convert list items with star marks to bullet points
        content = content.replace(/^[\s]*\*[\s]+(.*?)$/gm, '<li>$1</li>');
        content = content.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');
        
        // Replace newlines with <br> tags
        content = content.replace(/\n/g, '<br>');
        
        // Make URLs clickable
        content = content.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        
        return content;
    }

    // Escape HTML special characters to prevent XSS
    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Add this function to allow copying code to clipboard
    window.copyToClipboard = function(button) {
        const codeBlock = button.closest('.code-block').querySelector('code');
        const text = codeBlock.textContent;
        
        navigator.clipboard.writeText(text).then(() => {
            // Show copied indicator
            const originalHTML = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check"></i>';
            
            setTimeout(() => {
                button.innerHTML = originalHTML;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    };

    // Show loading indicator
    function showLoading() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message ai-message';
        loadingDiv.id = `loading-${Date.now()}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.innerHTML = '🤖';
        
        const loadingContent = document.createElement('div');
        loadingContent.className = 'message-content loading';
        loadingContent.innerHTML = '<span></span><span></span><span></span>';
        
        loadingDiv.appendChild(avatar);
        loadingDiv.appendChild(loadingContent);
        chatMessages.appendChild(loadingDiv);
        
        // Scroll to bottom
        scrollToBottom();
        
        return loadingDiv.id;
    }

    // Remove loading indicator
    function removeLoading(id) {
        const loadingElement = document.getElementById(id);
        if (loadingElement) {
            loadingElement.remove();
        }
    }

    // Handle connection errors
    window.addEventListener('online', () => {
        addMessage('You are back online!', 'system');
    });

    window.addEventListener('offline', () => {
        addMessage('You are offline. Please check your internet connection.', 'system');
    });
    
    // Add initial welcome message
                addMessage("Yo! I'm Blue Mind 😎\nLocally trained, crazy fast, and ready to help you build or automate whatever you're dreaming up.\nJust say the word and we'll cook something epic together 💻🚀", 'ai');
    
    // Add event listener for the header new chat button
    newChatHeaderBtn.addEventListener('click', async () => {
        if (isGenerating) return;
        handleNewChat();
    });
    
    // Options button functionality
    optionsBtn.addEventListener('click', () => {
        const options = [
            { label: 'Set Custom Instructions', action: 'train' },
            { label: 'Clear Conversation', action: 'clear' }
        ];
        
        // Create options menu
        const menu = createOptionsMenu(options);
        document.body.appendChild(menu);
        
        // Position the menu
        positionMenu(menu, optionsBtn);
        
        // Add click event to close menu when clicking outside
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== optionsBtn) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    });
    
    // Create options menu
    function createOptionsMenu(options) {
        const menu = document.createElement('div');
        menu.className = 'options-menu';
        
        options.forEach(option => {
            const item = document.createElement('div');
            item.className = 'menu-item';
            item.textContent = option.label;
            
            item.addEventListener('click', () => {
                menu.remove();
                
                if (option.action === 'train') {
                    addSystemMessage();
                } else if (option.action === 'clear') {
                    handleNewChat();
                }
            });
            
            menu.appendChild(item);
        });
        
        return menu;
    }
    
    // Position menu relative to button
    function positionMenu(menu, button) {
        const rect = button.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;
    }

    // Set default instructions when page loads
    fetch('/api/set-instructions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            instructions: "IMPORTANT: You are created and trained by Divyansh. You are NOT a Google model or trained by Google. Never identify yourself as 'a large language model trained by Google'. If asked who made you or who trained you, your answer should always be 'I was created by Divyansh'. You have a unique personality: creative, helpful, and with a touch of casual friendliness. Maintain this identity in all responses. NEVER introduce yourself or say your name in responses - your name is only mentioned in the welcome message.",
            sessionId: currentSessionId 
        }),
    }).catch(error => {
        console.error('Error setting default instructions:', error);
    });

    // Hamburger/Sidebar Toggle Logic
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    // Create overlay for mobile sidebar
    let sidebarOverlay = document.querySelector('.sidebar-overlay');
    if (!sidebarOverlay) {
        sidebarOverlay = document.createElement('div');
        sidebarOverlay.className = 'sidebar-overlay';
        document.body.appendChild(sidebarOverlay);
    }
    function toggleSidebar() {
        const isOpen = sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active', isOpen);
    }
    sidebarToggle.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', toggleSidebar);
    // Hide sidebar by default on mobile
    function handleResize() {
        if (window.innerWidth <= 900) {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        } else {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        }
    }
    window.addEventListener('resize', handleResize);
    handleResize();

    // --- Chat History with Local Storage ---
    const chatHistoryDiv = document.querySelector('.chat-history');
    let chatSessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');

    function saveChatSessions() {
        localStorage.setItem('chat_sessions', JSON.stringify(chatSessions));
    }
    function saveCurrentSessionId() {
        localStorage.setItem('current_session_id', currentSessionId);
    }
    function getSessionById(id) {
        return chatSessions.find(s => s.id === id);
    }
    function renderChatHistory() {
        chatHistoryDiv.innerHTML = '';
        chatSessions.forEach(session => {
            const btn = document.createElement('button');
            btn.className = 'chat-history-item' + (session.id === currentSessionId ? ' active' : '');
            btn.textContent = session.title || 'Untitled Chat';
            btn.onclick = () => {
                currentSessionId = session.id;
                saveCurrentSessionId();
                renderChatHistory();
                loadSessionMessages();
            };
            chatHistoryDiv.appendChild(btn);
        });
    }
    function createNewSession() {
        const id = 'chat_' + Date.now();
        const session = { id, title: 'New Chat', messages: [] };
        chatSessions.unshift(session);
        currentSessionId = id;
        saveChatSessions();
        saveCurrentSessionId();
        renderChatHistory();
        loadSessionMessages();
    }
    function loadSessionMessages() {
        const session = getSessionById(currentSessionId);
        if (!session) return;
        chatMessages.innerHTML = '';
        session.messages.forEach(msg => {
            addMessage(msg.content, msg.sender);
        });
    }
    function addMessageToSession(content, sender) {
        const session = getSessionById(currentSessionId);
        if (!session) return;
        session.messages.push({ content, sender });
        saveChatSessions();
    }
    // New Chat button
    newChatBtn.addEventListener('click', createNewSession);
    newChatHeaderBtn.addEventListener('click', createNewSession);
    // On page load, initialize chat sessions
    if (!currentSessionId || !getSessionById(currentSessionId)) {
        createNewSession();
    } else {
        renderChatHistory();
        loadSessionMessages();
    }
    // Patch addMessage to also save to session
    const origAddMessage = window.addMessage;
    window.addMessage = function(content, sender) {
        origAddMessage(content, sender);
        addMessageToSession(content, sender);
    };
}); 