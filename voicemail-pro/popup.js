let isRecording = false;
let recognition = null;
let apiKey = '';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check for saved API key
    chrome.storage.local.get(['openrouterApiKey'], (result) => {
        if (result.openrouterApiKey) {
            apiKey = result.openrouterApiKey;
            showScreen('main');
        } else {
            showScreen('setup');
        }
    });

    // Initialize Web Speech API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = async (event) => {
            const transcript = event.results[0][0].transcript;
            document.getElementById('transcript').textContent = transcript;
            document.getElementById('transcript-container').classList.remove('hidden');
            setRecordingState(false);
            await generateEmail(transcript);
        };

        recognition.onerror = (event) => {
            showError(`Voice error: ${event.error}. Please try again.`);
            setRecordingState(false);
        };

        recognition.onend = () => {
            setRecordingState(false);
        };
    } else {
        showError('Voice recognition not supported in this browser');
    }

    // Setup event listeners
    setupEventListeners();
});

let lastFocusedElement = null;

function setupEventListeners() {
    // Setup screen
    document.getElementById('open-openrouter').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://openrouter.ai/keys' });
    });

    document.getElementById('save-key').addEventListener('click', saveApiKey);

    document.getElementById('api-key-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });

    // Main screen
    document.getElementById('record-btn').addEventListener('click', checkMicPermission);
    // Check microphone permission and open permission.html if not granted
    async function checkMicPermission() {
        if (!navigator.permissions) {
            // Fallback: try to start recording directly
            startRecording();
            return;
        }
        try {
            const permission = await navigator.permissions.query({ name: 'microphone' });
            if (permission.state !== 'granted') {
                chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
            } else {
                startRecording();
            }
        } catch (e) {
            // Fallback: try to start recording directly
            startRecording();
        }
    }
    document.getElementById('copy-btn').addEventListener('click', copyToClipboard);
    document.getElementById('paste-btn').addEventListener('click', pasteToCursor);
    // Track last focused input/textarea in the page
    window.addEventListener('focusin', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
            lastFocusedElement = e.target;
        }
    });

    function pasteToCursor() {
        const emailText = document.getElementById('email-output').textContent;
        // Try to paste into the last focused element
        if (lastFocusedElement) {
            if (typeof lastFocusedElement.selectionStart === 'number') {
                // For input/textarea
                const start = lastFocusedElement.selectionStart;
                const end = lastFocusedElement.selectionEnd;
                const value = lastFocusedElement.value;
                lastFocusedElement.value = value.slice(0, start) + emailText + value.slice(end);
                // Move cursor to end of inserted text
                lastFocusedElement.selectionStart = lastFocusedElement.selectionEnd = start + emailText.length;
                lastFocusedElement.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (lastFocusedElement.isContentEditable) {
                // For contenteditable
                document.execCommand('insertText', false, emailText);
            }
            lastFocusedElement.focus();
        } else {
            alert('No input field is focused. Please click into a text box first.');
        }
    }
    document.getElementById('clear-btn').addEventListener('click', clearAll);
    document.getElementById('settings-btn').addEventListener('click', () => {
        chrome.storage.local.remove(['openrouterApiKey']);
        apiKey = '';
        showScreen('setup');
    });
}

async function saveApiKey() {
    const keyInput = document.getElementById('api-key-input');
    const key = keyInput.value.trim();

    if (!key) {
        showSetupError('Please enter your API key');
        return;
    }

    if (!key.startsWith('sk-or')) {
        showSetupError('Invalid format. OpenRouter API keys start with "sk-or"');
        return;
    }

    // Test the API key by making a simple model list request
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${key}`,
                'HTTP-Referer': 'https://chrome-extension',
                'X-Title': 'VoiceMail Pro'
            }
        });

        if (!response.ok) {
            showSetupError('API key is invalid or expired');
            return;
        }

        // Save to Chrome storage
        chrome.storage.local.set({ openrouterApiKey: key }, () => {
            apiKey = key;
            showScreen('main');
        });
    } catch (err) {
        showSetupError('Failed to validate. Check your connection.');
    }
}

function startRecording() {
    if (!recognition || isRecording) return;

    clearAll();
    recognition.start();
    setRecordingState(true);
}

function setRecordingState(recording) {
    isRecording = recording;
    const btn = document.getElementById('record-btn');
    
    if (recording) {
        btn.classList.add('recording', 'bg-red-500');
        btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        btn.innerHTML = `
            <div class="flex flex-col items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                <span>🎤 Listening...</span>
            </div>
        `;
    } else {
        btn.classList.remove('recording', 'bg-red-500');
        btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        btn.innerHTML = `
            <div class="flex flex-col items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                <span>Click to Record</span>
            </div>
        `;
    }
}

async function generateEmail(transcript) {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('email-container').classList.add('hidden');
    document.getElementById('error-msg').classList.add('hidden');

    const tone = document.getElementById('tone-select').value;

    const prompts = {
        professional: `Convert this casual speech into a professional email. Keep it concise and clear. Add appropriate greeting and closing.\n\nCasual speech: \"${transcript}\"\n\nGenerate ONLY the email text, no explanations or extra formatting.`,
        friendly: `Convert this casual speech into a friendly but professional email. Use a warm tone. Add appropriate greeting and closing.\n\nCasual speech: \"${transcript}\"\n\nGenerate ONLY the email text, no explanations or extra formatting.`,
        formal: `Convert this casual speech into a very formal business email. Use formal language and structure. Add appropriate greeting and closing.\n\nCasual speech: \"${transcript}\"\n\nGenerate ONLY the email text, no explanations or extra formatting.`,
        casual: `Convert this speech into a casual email. Keep it relaxed but still clear. Add appropriate greeting and closing.\n\nCasual speech: \"${transcript}\"\n\nGenerate ONLY the email text, no explanations or extra formatting.`
    };

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://chrome-extension',
                'X-Title': 'VoiceMail Pro'
            },
            body: JSON.stringify({
                model: 'openai/gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'You are an expert email writer.' },
                    { role: 'user', content: prompts[tone] }
                ],
                max_tokens: 500,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            if (response.status === 429) {
                showError('⚠️ Daily limit reached or quota exceeded.');
                return;
            }
            throw new Error('API request failed');
        }

        const data = await response.json();
        const emailText = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
            ? data.choices[0].message.content.trim()
            : 'No response from model.';

        document.getElementById('email-output').textContent = emailText;
        document.getElementById('email-container').classList.remove('hidden');
        document.getElementById('action-buttons').classList.remove('hidden');
    } catch (err) {
        showError(`Error: ${err.message}`);
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

function copyToClipboard() {
    const emailText = document.getElementById('email-output').textContent;
    navigator.clipboard.writeText(emailText);
    
    const btn = document.getElementById('copy-btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Copied!</span>
    `;
    
    setTimeout(() => {
        btn.innerHTML = originalHTML;
    }, 2000);
}

function clearAll() {
    document.getElementById('transcript').textContent = '';
    document.getElementById('transcript-container').classList.add('hidden');
    document.getElementById('email-output').textContent = '';
    document.getElementById('email-container').classList.add('hidden');
    document.getElementById('action-buttons').classList.add('hidden');
    document.getElementById('error-msg').classList.add('hidden');
    document.getElementById('loading').classList.add('hidden');
}

function showError(message) {
    const errorEl = document.getElementById('error-msg');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function showSetupError(message) {
    const errorEl = document.getElementById('setup-error');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function showScreen(screen) {
    if (screen === 'setup') {
        document.getElementById('setup-screen').classList.remove('hidden');
        document.getElementById('main-screen').classList.add('hidden');
    } else {
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('main-screen').classList.remove('hidden');
    }
}