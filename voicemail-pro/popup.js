let isRecording = false;
let recognition = null;

// Presets for models per provider
const modelPresets = {
    gemini: [
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Fast/Free)' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Powerful)' }
    ],
    openrouter: [
        { id: 'google/gemini-flash-1.5', name: 'Gemini 1.5 Flash (Free)' },
        { id: 'meta-llama/llama-3-8b-instruct:free', name: 'Llama 3 8B Instruct (Free)' },
        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ],
    openai: [
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Recommended)' },
        { id: 'gpt-4o', name: 'GPT-4o (Powerful)' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ],
    anthropic: [
        { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet (Best)' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Fast)' }
    ]
};

// Instructions per provider
const instructionsHTML = {
    gemini: `
        <p>Step 1: Get free Gemini API Key</p>
        <ol>
            <li>Go to <a href="https://aistudio.google.com/" target="_blank" style="color: #93c5fd; font-weight: 600;">Google AI Studio</a></li>
            <li>Click <b>Create API Key</b></li>
            <li>Copy the key and paste it below</li>
        </ol>
    `,
    openrouter: `
        <p>Step 1: Get OpenRouter API Key</p>
        <ol>
            <li>Go to <a href="https://openrouter.ai/keys" target="_blank" style="color: #93c5fd; font-weight: 600;">OpenRouter API Keys</a></li>
            <li>Log in and click <b>+ Create Key</b></li>
            <li>Copy the key (starts with <code>sk-or</code>) and paste it below</li>
        </ol>
    `,
    openai: `
        <p>Step 1: Get OpenAI API Key</p>
        <ol>
            <li>Go to <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #93c5fd; font-weight: 600;">OpenAI API Keys</a></li>
            <li>Click <b>+ Create new secret key</b></li>
            <li>Copy the key (starts with <code>sk-</code>) and paste it below</li>
        </ol>
    `,
    anthropic: `
        <p>Step 1: Get Anthropic API Key</p>
        <ol>
            <li>Go to <a href="https://console.anthropic.com/" target="_blank" style="color: #93c5fd; font-weight: 600;">Anthropic Console</a></li>
            <li>Go to API keys section</li>
            <li>Create key (starts with <code>sk-ant-</code>) and paste it below</li>
        </ol>
    `
};

// App state
let state = {
    activeProvider: 'gemini',
    apiKeys: {},
    models: {}
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load config from local storage
    chrome.storage.local.get(['activeProvider', 'apiKeys', 'models'], (result) => {
        state.activeProvider = result.activeProvider || 'gemini';
        state.apiKeys = result.apiKeys || {};
        state.models = result.models || {};

        const activeKey = state.apiKeys[state.activeProvider];
        
        // Populate inputs and dropdown values
        populateModelDropdown('setup-model-select', state.activeProvider);
        populateModelDropdown('settings-model-select', state.activeProvider);
        
        // Synchronize provider selects
        document.getElementById('setup-provider-select').value = state.activeProvider;
        document.getElementById('settings-provider-select').value = state.activeProvider;
        document.getElementById('active-provider-select').value = state.activeProvider;

        updateInstructions('setup');
        updateInstructions('settings');

        // Check if key is available for current provider
        if (activeKey) {
            showScreen('main');
            updateDisplayConfig();
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

    setupEventListeners();
});

let lastFocusedElement = null;

function setupEventListeners() {
    // -------------------------------------------------------------
    // Setup Onboarding Screen Actions
    // -------------------------------------------------------------
    const setupProviderSelect = document.getElementById('setup-provider-select');
    setupProviderSelect.addEventListener('change', () => {
        const provider = setupProviderSelect.value;
        populateModelDropdown('setup-model-select', provider);
        updateInstructions('setup');
    });

    document.getElementById('setup-save-btn').addEventListener('click', () => {
        saveApiKeyAndModel('setup');
    });

    // -------------------------------------------------------------
    // Main Screen Settings & Controls
    // -------------------------------------------------------------
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    
    settingsBtn.addEventListener('click', () => {
        settingsBtn.classList.toggle('active');
        settingsPanel.classList.toggle('hidden');
        if (!settingsPanel.classList.contains('hidden')) {
            // Fill current settings values into the settings inputs
            const provider = state.activeProvider;
            document.getElementById('settings-provider-select').value = provider;
            populateModelDropdown('settings-model-select', provider);
            
            const currentModel = state.models[provider] || modelPresets[provider][0].id;
            document.getElementById('settings-model-select').value = currentModel;
            
            document.getElementById('settings-api-key-input').value = state.apiKeys[provider] || '';
            document.getElementById('settings-error').classList.add('hidden');
        }
    });

    const settingsProviderSelect = document.getElementById('settings-provider-select');
    settingsProviderSelect.addEventListener('change', () => {
        const provider = settingsProviderSelect.value;
        populateModelDropdown('settings-model-select', provider);
        document.getElementById('settings-api-key-input').value = state.apiKeys[provider] || '';
    });

    document.getElementById('settings-save-btn').addEventListener('click', () => {
        saveApiKeyAndModel('settings');
    });

    document.getElementById('settings-reset-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to reset and clear all stored API keys?')) {
            chrome.storage.local.clear(() => {
                state.activeProvider = 'gemini';
                state.apiKeys = {};
                state.models = {};
                
                document.getElementById('setup-api-key-input').value = '';
                setupProviderSelect.value = 'gemini';
                populateModelDropdown('setup-model-select', 'gemini');
                updateInstructions('setup');
                
                settingsBtn.classList.remove('active');
                settingsPanel.classList.add('hidden');
                showScreen('setup');
                clearAll();
            });
        }
    });

    // Active Provider Selector (fast-switch in main view)
    const activeProviderSelect = document.getElementById('active-provider-select');
    activeProviderSelect.addEventListener('change', () => {
        const targetProvider = activeProviderSelect.value;
        const keyForProvider = state.apiKeys[targetProvider];

        if (keyForProvider) {
            state.activeProvider = targetProvider;
            chrome.storage.local.set({ activeProvider: targetProvider }, () => {
                updateDisplayConfig();
                // Close settings panel if it was open
                settingsBtn.classList.remove('active');
                settingsPanel.classList.add('hidden');
            });
        } else {
            // Prompt to enter key in settings
            alert(`No API key saved for ${targetProvider.toUpperCase()}. Please configure it in Settings first.`);
            activeProviderSelect.value = state.activeProvider; // Revert
            
            // Open settings panel and auto-focus target provider
            settingsBtn.classList.add('active');
            settingsPanel.classList.remove('hidden');
            settingsProviderSelect.value = targetProvider;
            populateModelDropdown('settings-model-select', targetProvider);
            document.getElementById('settings-api-key-input').value = '';
            document.getElementById('settings-api-key-input').focus();
        }
    });

    // Recording and Action Button Bindings
    document.getElementById('record-btn').addEventListener('click', checkMicPermission);
    document.getElementById('copy-btn').addEventListener('click', copyToClipboard);
    document.getElementById('paste-btn').addEventListener('click', pasteToCursor);
    document.getElementById('clear-btn').addEventListener('click', clearAll);

    // Track active textbox in parent browser page (if any)
    window.addEventListener('focusin', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
            lastFocusedElement = e.target;
        }
    });
}

// Populate model select dropdown lists
function populateModelDropdown(elementId, provider) {
    const select = document.getElementById(elementId);
    select.innerHTML = '';
    
    if (modelPresets[provider]) {
        modelPresets[provider].forEach(model => {
            const opt = document.createElement('option');
            opt.value = model.id;
            opt.textContent = model.name;
            select.appendChild(opt);
        });
    }
}

// Update instruction box guide depending on selected provider
function updateInstructions(screen) {
    if (screen === 'setup') {
        const provider = document.getElementById('setup-provider-select').value;
        document.getElementById('setup-instructions').innerHTML = instructionsHTML[provider] || '';
    }
}

// Displays metadata details on footer
function updateDisplayConfig() {
    const provider = state.activeProvider;
    const model = state.models[provider] || (modelPresets[provider] ? modelPresets[provider][0].id : '');
    document.getElementById('active-provider-select').value = provider;
    document.getElementById('active-model-display').textContent = `Active Profile: ${provider.toUpperCase()} (${model})`;
}

// Validates the API key before saving
async function validateApiKey(provider, key, model) {
    let response;
    
    if (provider === 'gemini') {
        // Check model list
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (!response.ok) throw new Error('API key is invalid for Google Gemini.');
    } 
    else if (provider === 'openrouter') {
        response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` }
        });
        if (!response.ok) throw new Error('API key is invalid for OpenRouter.');
    } 
    else if (provider === 'openai') {
        response = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` }
        });
        if (!response.ok) throw new Error('API key is invalid for OpenAI.');
    } 
    else if (provider === 'anthropic') {
        // Send a request to messages endpoint with dummy data
        // 401 status = invalid key, 400 status = valid key (complaining about empty body)
        response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({})
        });
        if (response.status === 401) {
            throw new Error('API key is invalid for Anthropic.');
        }
    }
}

// Saves API configuration from either Setup or Settings Panel
async function saveApiKeyAndModel(screen) {
    const isSetup = (screen === 'setup');
    const provider = document.getElementById(isSetup ? 'setup-provider-select' : 'settings-provider-select').value;
    const keyInput = document.getElementById(isSetup ? 'setup-api-key-input' : 'settings-api-key-input');
    const model = document.getElementById(isSetup ? 'setup-model-select' : 'settings-model-select').value;
    
    const key = keyInput.value.trim();
    const errorEl = document.getElementById(isSetup ? 'setup-error' : 'settings-error');
    const saveBtn = document.getElementById(isSetup ? 'setup-save-btn' : 'settings-save-btn');

    if (!key) {
        showValidationFeedback(errorEl, 'Please enter an API key.');
        return;
    }

    // OpenRouter keys verification check helper
    if (provider === 'openrouter' && !key.startsWith('sk-or')) {
        showValidationFeedback(errorEl, 'OpenRouter keys typically start with "sk-or".');
        return;
    }

    try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Validating key...';
        errorEl.classList.add('hidden');

        await validateApiKey(provider, key, model);

        // Update state and save
        state.apiKeys[provider] = key;
        state.models[provider] = model;
        state.activeProvider = provider;

        chrome.storage.local.set({
            activeProvider: state.activeProvider,
            apiKeys: state.apiKeys,
            models: state.models
        }, () => {
            saveBtn.disabled = false;
            saveBtn.textContent = isSetup ? 'Save & Start' : 'Save Settings';
            
            // Clean fields
            keyInput.value = '';
            
            if (isSetup) {
                showScreen('main');
            } else {
                document.getElementById('settings-btn').classList.remove('active');
                document.getElementById('settings-panel').classList.add('hidden');
            }
            updateDisplayConfig();
            clearAll();
        });

    } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = isSetup ? 'Save & Start' : 'Save Settings';
        showValidationFeedback(errorEl, err.message || 'Connection failed during validation.');
    }
}

function showValidationFeedback(element, msg) {
    element.textContent = msg;
    element.classList.remove('hidden');
}

// Request microphone access using permission.html fallback
async function checkMicPermission() {
    if (!navigator.permissions) {
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
        startRecording();
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
        btn.classList.add('recording');
        btn.innerHTML = `
            <div class="button-content">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="6"/>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                </svg>
                <span>🎤 Listening...</span>
            </div>
        `;
    } else {
        btn.classList.remove('recording');
        btn.innerHTML = `
            <div class="button-content">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                </svg>
                <span>Click to Record</span>
            </div>
        `;
    }
}

// Triggers completion API for active provider
async function generateEmail(transcript) {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('email-container').classList.add('hidden');
    document.getElementById('error-msg').classList.add('hidden');

    const tone = document.getElementById('tone-select').value;
    const provider = state.activeProvider;
    const apiKey = state.apiKeys[provider];
    const model = state.models[provider] || (modelPresets[provider] ? modelPresets[provider][0].id : '');

    if (!apiKey) {
        showError(`No API Key set for ${provider.toUpperCase()}. Please configure it in settings.`);
        document.getElementById('loading').classList.add('hidden');
        return;
    }

    const systemPrompt = "You are an expert professional email writer. Convert casual speech into emails.";
    const prompts = {
        professional: `Convert this casual speech into a professional email. Keep it concise and clear. Add appropriate greeting and closing.\n\nCasual speech: "${transcript}"\n\nGenerate ONLY the email text, no explanations, no markdown styling, and no extra formatting.`,
        friendly: `Convert this casual speech into a friendly but professional email. Use a warm, cooperative tone. Add appropriate greeting and closing.\n\nCasual speech: "${transcript}"\n\nGenerate ONLY the email text, no explanations, no markdown styling, and no extra formatting.`,
        formal: `Convert this casual speech into a highly formal business email. Use structured, formal business terms. Add appropriate greeting and closing.\n\nCasual speech: "${transcript}"\n\nGenerate ONLY the email text, no explanations, no markdown styling, and no extra formatting.`,
        casual: `Convert this speech into a casual, relaxed email. Keep it friendly and informal. Add appropriate greeting and closing.\n\nCasual speech: "${transcript}"\n\nGenerate ONLY the email text, no explanations, no markdown styling, and no extra formatting.`
    };

    const targetPrompt = prompts[tone] || prompts.professional;

    try {
        let emailText = '';

        if (provider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: `${systemPrompt}\n\n${targetPrompt}` }]
                    }],
                    generationConfig: {
                        maxOutputTokens: 500,
                        temperature: 0.7
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `Gemini API returned ${response.status}`);
            }

            const data = await response.json();
            emailText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } 
        
        else if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: targetPrompt }
                    ],
                    max_tokens: 500,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `OpenAI API returned ${response.status}`);
            }

            const data = await response.json();
            emailText = data.choices?.[0]?.message?.content || '';
        } 
        
        else if (provider === 'anthropic') {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: 500,
                    system: systemPrompt,
                    messages: [
                        { role: 'user', content: targetPrompt }
                    ],
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `Anthropic API returned ${response.status}`);
            }

            const data = await response.json();
            emailText = data.content?.[0]?.text || '';
        } 
        
        else if (provider === 'openrouter') {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://chrome-extension',
                    'X-Title': 'VoiceMail Pro'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: targetPrompt }
                    ],
                    max_tokens: 500,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `OpenRouter API returned ${response.status}`);
            }

            const data = await response.json();
            emailText = data.choices?.[0]?.message?.content || '';
        }

        emailText = emailText.trim();
        if (!emailText) {
            throw new Error('API returned an empty email body.');
        }

        document.getElementById('email-output').textContent = emailText;
        document.getElementById('email-container').classList.remove('hidden');
        document.getElementById('action-buttons').classList.remove('hidden');

    } catch (err) {
        showError(`Generation failed: ${err.message}`);
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

// Smart pasting to current page
function pasteToCursor() {
    const emailText = document.getElementById('email-output').textContent;
    
    // Inject paste directly to current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'voicemail_pro_paste',
                text: emailText
            });
        }
    });
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

function showScreen(screen) {
    if (screen === 'setup') {
        document.getElementById('setup-screen').classList.remove('hidden');
        document.getElementById('main-screen').classList.add('hidden');
    } else {
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('main-screen').classList.remove('hidden');
    }
}