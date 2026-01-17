let isRecording = false;
let recognition = null;

// Groq / MediaRecorder STT state
let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyserNode = null;
let silenceCheckInterval = null;

// Presets for models per provider
const modelPresets = {
    gemini: [
        { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite' },
        { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
        { id: 'gemma-4-26b', name: 'Gemma 4 26B' },
        { id: 'gemma-4-31b', name: 'Gemma 4 31B' }
    ],
    openrouter: [
        { id: 'openrouter/auto', name: 'OpenRouter Auto (Best Free)' },
        { id: 'google/gemma-4-9b-it:free', name: 'Gemma 4 9B (Free)' },
        { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct (Free)' }
    ],
    openai: [
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Recommended)' },
        { id: 'gpt-4o', name: 'GPT-4o (Powerful)' }
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
            <li>Go to <a href="https://aistudio.google.com/api-keys" target="_blank" style="color: #93c5fd; font-weight: 600;">Google AI Studio</a></li>
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
    models: {},
    userName: '',
    sttProvider: 'webspeech',
    groqSttKey: ''
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load config from local storage
    chrome.storage.local.get(['activeProvider', 'apiKeys', 'models', 'userName', 'sttProvider', 'groqSttKey'], (result) => {
        state.activeProvider = result.activeProvider || 'gemini';
        state.apiKeys = result.apiKeys || {};
        state.models = result.models || {};
        state.userName = result.userName || '';
        state.sttProvider = result.sttProvider || 'webspeech';
        state.groqSttKey = result.groqSttKey || '';

        const activeKey = state.apiKeys[state.activeProvider];

        // Populate inputs and dropdown values
        populateModelDropdown('setup-model-select', state.activeProvider);
        populateModelDropdown('settings-model-select', state.activeProvider);

        // Synchronize provider selects if elements exist in DOM
        const setupProvSel = document.getElementById('setup-provider-select');
        if (setupProvSel) setupProvSel.value = state.activeProvider;

        const settingsProvSel = document.getElementById('settings-provider-select');
        if (settingsProvSel) settingsProvSel.value = state.activeProvider;

        const activeProvSel = document.getElementById('active-provider-select');
        if (activeProvSel) activeProvSel.value = state.activeProvider;

        const userNameInput = document.getElementById('user-name-input');
        if (userNameInput && state.userName) {
            userNameInput.value = state.userName;
        }

        updateInstructions('setup');
        updateInstructions('settings');

        // Check if key is available for current provider
        if (activeKey) {
            showScreen('main');
        } else {
            // Open full onboarding page in new tab so context is preserved when opening links
            chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
            window.close(); // Close small popup window
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
            if (event.error === 'no-speech' || event.error === 'aborted') {
                setRecordingState(false);
                return;
            }
            showError(`Voice error: ${event.error}. Please try again.`);
            setRecordingState(false);
        };

        recognition.onend = () => {
            setRecordingState(false);
        };
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
            document.getElementById('settings-name-input').value = state.userName || '';
            document.getElementById('settings-error').classList.add('hidden');

            // Populate STT settings
            const sttProv = state.sttProvider || 'webspeech';
            const sttNativeSelect = document.getElementById('settings-stt-select');
            if (sttNativeSelect) sttNativeSelect.value = sttProv;
            updateSettingsSttDropdownSelected(sttProv);

            const groqKeyGroup = document.getElementById('groq-key-group');
            if (groqKeyGroup) groqKeyGroup.classList.toggle('hidden', sttProv !== 'groq');
            const groqKeyInput = document.getElementById('settings-groq-key-input');
            if (groqKeyInput) groqKeyInput.value = state.groqSttKey || '';
        }
    });

    const settingsCloseBtn = document.getElementById('settings-close-btn');
    if (settingsCloseBtn) {
        settingsCloseBtn.onclick = () => {
            settingsBtn.classList.remove('active');
            settingsPanel.classList.add('hidden');
        };
    }

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
        showResetConfirmModal();
    });

    document.getElementById('modal-cancel-reset-btn').addEventListener('click', () => {
        hideResetConfirmModal();
    });

    document.getElementById('modal-confirm-reset-btn').addEventListener('click', () => {
        hideResetConfirmModal();
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
            chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
            window.close();
        });
    });

    document.getElementById('modal-close-limit-btn').addEventListener('click', () => {
        hideLimitErrorModal();
    });

    // Custom Cursor-Following Tooltip System
    initCustomTooltips();
    setupMainCustomDropdowns();

    // Active Provider Selector (fast-switch in main view)
    const activeProviderSelect = document.getElementById('active-provider-select');
    if (activeProviderSelect) {
        activeProviderSelect.addEventListener('change', () => {
            const targetProvider = activeProviderSelect.value;
            const keyForProvider = state.apiKeys[targetProvider];

            if (keyForProvider) {
                state.activeProvider = targetProvider;
                chrome.storage.local.set({ activeProvider: targetProvider }, () => {
                    settingsBtn.classList.remove('active');
                    settingsPanel.classList.add('hidden');
                });
            } else {
                alert(`No API key saved for ${targetProvider.toUpperCase()}. Please configure it in Settings first.`);
                activeProviderSelect.value = state.activeProvider;
                settingsBtn.classList.add('active');
                settingsPanel.classList.remove('hidden');
                settingsProviderSelect.value = targetProvider;
                populateModelDropdown('settings-model-select', targetProvider);
                document.getElementById('settings-api-key-input').value = '';
                document.getElementById('settings-api-key-input').focus();
            }
        });
    }

    // Recording and Action Button Bindings
    document.getElementById('record-btn').addEventListener('click', checkMicPermission);
    document.getElementById('copy-btn').addEventListener('click', copyToClipboard);
    document.getElementById('paste-btn').addEventListener('click', pasteToGmail);

    // Track active textbox in parent browser page
    window.addEventListener('focusin', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
            lastFocusedElement = e.target;
        }
    });
}

// Populate model select dropdown lists
function populateModelDropdown(elementId, provider) {
    const select = document.getElementById(elementId);
    if (!select) return;
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

    // Strict API key format & length check
    if (provider === 'gemini' && key.length < 20) {
        showValidationFeedback(errorEl, 'Invalid Gemini key format: key is too short (min 20 characters).');
        return;
    }
    if (provider === 'openrouter' && (!key.startsWith('sk-or-') || key.length < 25)) {
        showValidationFeedback(errorEl, 'Invalid OpenRouter key format: must start with "sk-or-".');
        return;
    }
    if (provider === 'openai' && (!key.startsWith('sk-') || key.length < 25)) {
        showValidationFeedback(errorEl, 'Invalid OpenAI key format: must start with "sk-".');
        return;
    }
    if (provider === 'anthropic' && (!key.startsWith('sk-ant-') || key.length < 25)) {
        showValidationFeedback(errorEl, 'Invalid Anthropic key format: must start with "sk-ant-".');
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

        if (!isSetup) {
            const nameVal = document.getElementById('settings-name-input').value.trim();
            if (nameVal) {
                state.userName = nameVal;
            }
            // Save STT provider settings
            const sttSelect = document.getElementById('settings-stt-select');
            if (sttSelect) {
                state.sttProvider = sttSelect.value;
            }
            const groqKeyEl = document.getElementById('settings-groq-key-input');
            if (groqKeyEl && groqKeyEl.value.trim()) {
                state.groqSttKey = groqKeyEl.value.trim();
            }
        }

        chrome.storage.local.set({
            activeProvider: state.activeProvider,
            apiKeys: state.apiKeys,
            models: state.models,
            userName: state.userName,
            sttProvider: state.sttProvider,
            groqSttKey: state.groqSttKey
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
    if (isRecording) {
        stopRecording();
        return;
    }

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
    if (isRecording) return;
    clearAll();

    if (state.sttProvider === 'groq' && state.groqSttKey) {
        startGroqRecording();
    } else {
        if (!recognition) {
            showError('Voice recognition not supported in this browser.');
            return;
        }
        recognition.start();
        setRecordingState(true);
    }
}

function stopRecording() {
    if (!isRecording) return;
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    setRecordingState(false);
}

function setRecordingState(recording) {
    isRecording = recording;
    const btn = document.getElementById('record-btn');
    if (!btn) return;

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

// ── GROQ WHISPER ENGINE ───────────────────────────────────────────────────────

async function startGroqRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            stopSilenceDetection();
            setRecordingState(false);

            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            if (blob.size < 1000) return; // Too small — no real audio

            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('loading-text').textContent = 'Transcribing with Groq...';
            try {
                const transcript = await transcribeWithGroq(blob);
                if (transcript) {
                    document.getElementById('transcript').textContent = transcript;
                    document.getElementById('transcript-container').classList.remove('hidden');
                    await generateEmail(transcript);
                }
            } catch (err) {
                document.getElementById('loading').classList.add('hidden');
                showError('Groq transcription failed: ' + (err.message || 'Unknown error'));
            }
        };

        mediaRecorder.start(250); // Collect chunks every 250ms
        setRecordingState(true);
        startSilenceDetection(stream);
    } catch (err) {
        showError('Microphone access denied or unavailable.');
    }
}

function startSilenceDetection(stream) {
    audioContext = new AudioContext();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 512;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyserNode);

    const data = new Uint8Array(analyserNode.frequencyBinCount);
    let silentMs = 0;
    const SILENCE_THRESHOLD = 10;
    const SILENCE_WINDOW_MS = 1800; // 1.8s of silence → finish & transcribe

    silenceCheckInterval = setInterval(() => {
        analyserNode.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;

        if (avg < SILENCE_THRESHOLD) {
            silentMs += 100;
            if (silentMs >= SILENCE_WINDOW_MS && isRecording) {
                stopSilenceDetection();
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
            }
        } else {
            silentMs = 0;
        }
    }, 100);
}

function stopSilenceDetection() {
    if (silenceCheckInterval) { clearInterval(silenceCheckInterval); silenceCheckInterval = null; }
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
}

async function transcribeWithGroq(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'text');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.groqSttKey}` },
        body: formData
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Groq returned ${response.status}`);
    }

    return (await response.text()).trim();
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

    const nameSignoff = state.userName ? ` Use "${state.userName}" as the sender's name in the email sign-off signature.` : '';
    const systemPrompt = `You are an expert professional email writer. Convert casual speech into emails.${nameSignoff}`;
    const prompts = {
        professional: `Convert this casual speech into a professional email. Keep it concise and clear. Add appropriate greeting and closing.\n\nCasual speech: "${transcript}"\n\nRespond in this exact format:\nSubject: <concise subject line>\n\n<email body>`,
        friendly: `Convert this casual speech into a friendly but professional email. Use a warm, cooperative tone. Add appropriate greeting and closing.\n\nCasual speech: "${transcript}"\n\nRespond in this exact format:\nSubject: <concise subject line>\n\n<email body>`,
        formal: `Convert this casual speech into a highly formal business email. Use structured, formal business terms. Add appropriate greeting and closing.\n\nCasual speech: "${transcript}"\n\nRespond in this exact format:\nSubject: <concise subject line>\n\n<email body>`,
        casual: `Convert this speech into a casual, relaxed email. Keep it friendly and informal. Add appropriate greeting and closing.\n\nCasual speech: "${transcript}"\n\nRespond in this exact format:\nSubject: <concise subject line>\n\n<email body>`
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
        const errMsg = err.message || '';
        if (errMsg.includes('429') || /quota|rate limit|resource_exhausted|tpm|tpd|rpd/i.test(errMsg)) {
            showLimitErrorModal(
                'API Limit Exceeded',
                `You have reached a rate or quota limit (${provider.toUpperCase()}). Please wait a minute before trying again, or switch to a different AI provider in Settings.`
            );
        } else {
            showError(`Generation failed: ${errMsg}`);
        }
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

function copyToClipboard() {
    const emailText = document.getElementById('email-output').textContent;
    navigator.clipboard.writeText(emailText);

    const btn = document.getElementById('copy-btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    setTimeout(() => {
        btn.innerHTML = originalHTML;
    }, 2000);
}

// Parse "Subject: ..." from generated email text
function parseEmailParts(fullText) {
    const lines = fullText.trim().split('\n');
    let subject = '';
    let bodyLines = [];
    let subjectFound = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!subjectFound && /^Subject:\s*/i.test(line)) {
            subject = line.replace(/^Subject:\s*/i, '').trim();
            subjectFound = true;
        } else if (subjectFound) {
            bodyLines.push(line);
        }
    }

    const body = bodyLines.join('\n').replace(/^\n+/, '');
    return { subject, body };
}

// Open Gmail compose with subject and body prefilled
function pasteToGmail() {
    const fullText = document.getElementById('email-output').textContent;
    const { subject, body } = parseEmailParts(fullText);

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    chrome.tabs.create({ url: gmailUrl });

    const btn = document.getElementById('paste-btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Opening Gmail...</span>
    `;
    setTimeout(() => { btn.innerHTML = originalHTML; }, 3000);
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

// --------------------------------------------------------------------------
// Onboarding Multi-Step Wizard Logic & Animations
// --------------------------------------------------------------------------
let currentStepIndex = 0;

function initOnboardingWizard() {
    currentStepIndex = 0;

    // Hide progress bar on splash screen (step 0)
    const progressBar = document.getElementById('onboarding-progress-bar');
    if (progressBar) progressBar.classList.add('hidden');

    // Reset slide positions
    const slides = document.querySelectorAll('.onboarding-slide');
    slides.forEach((slide, index) => {
        slide.classList.remove('active-slide', 'slide-left', 'slide-right');
        if (index === 0) {
            slide.classList.add('active-slide');
        } else {
            slide.classList.add('slide-right');
        }
    });

    // Step 0 Animations Sequence:
    // 1. Logo image fades in center & slowly grows to 130%
    const splashLogo = document.getElementById('splash-logo');
    const splashTitle = document.getElementById('splash-title');
    const splashBtn = document.getElementById('splash-start-btn');

    splashLogo.classList.remove('animate-grow');
    splashTitle.classList.remove('visible');
    splashBtn.classList.remove('visible');

    // Trigger reflow to restart animation
    void splashLogo.offsetWidth;
    splashLogo.classList.add('animate-grow');

    // 2. When logo reaches 130% (after 1.5s animation), "VoiceMail Pro" text appears
    setTimeout(() => {
        splashTitle.classList.add('visible');

        // 3. After 2 seconds, button appears with text "Click To Type Faster"
        setTimeout(() => {
            splashBtn.classList.add('visible');
        }, 2000);

    }, 1500);

    setupWizardListeners();
    setupCustomDropdown();
}

function updateProgressBar(stepIndex) {
    const progressBar = document.getElementById('onboarding-progress-bar');
    const trackFill = document.getElementById('progress-track-fill');
    if (!progressBar || !trackFill) return;

    if (stepIndex === 0) {
        progressBar.classList.add('hidden');
        return;
    }

    progressBar.classList.remove('hidden');

    // 4 setup steps: 1 (Name), 2 (BYOK Info), 3 (AI Provider), 4 (API Key)
    // Track fill widths:
    // Step 1: 0%
    // Step 2: 33.3%
    // Step 3: 66.6%
    // Step 4: 100%
    const fillPercentages = { 1: '0%', 2: '33.3%', 3: '66.6%', 4: '100%' };
    trackFill.style.width = fillPercentages[stepIndex] || '0%';

    for (let i = 1; i <= 4; i++) {
        const tickNode = document.getElementById(`tick-${i}`);
        if (!tickNode) continue;

        tickNode.classList.remove('active', 'ticked');

        if (i < stepIndex) {
            // Previous completed steps: show tick icon & green background
            tickNode.classList.add('ticked');
        } else if (i === stepIndex) {
            // Current active step: highlight (yellow background, scale effect, no tick icon yet)
            tickNode.classList.add('active');
        }
    }
}

function goToWizardStep(nextStepIndex) {
    const currentSlide = document.getElementById(`onboarding-step-${currentStepIndex}`);
    const nextSlide = document.getElementById(`onboarding-step-${nextStepIndex}`);

    if (!currentSlide || !nextSlide) return;

    if (nextStepIndex > currentStepIndex) {
        currentSlide.classList.remove('active-slide');
        currentSlide.classList.add('slide-left');

        nextSlide.classList.remove('slide-right');
        nextSlide.classList.add('active-slide');
    } else {
        currentSlide.classList.remove('active-slide');
        currentSlide.classList.add('slide-right');

        nextSlide.classList.remove('slide-left');
        nextSlide.classList.add('active-slide');
    }

    currentStepIndex = nextStepIndex;
    updateProgressBar(nextStepIndex);

    // Focus input elements on active step
    if (nextStepIndex === 1) {
        setTimeout(() => {
            document.getElementById('user-name-input').focus();
        }, 450);
    } else if (nextStepIndex === 4) {
        setTimeout(() => {
            document.getElementById('setup-api-key-input').focus();
        }, 450);
    }
}

function setupWizardListeners() {
    // Step 0 -> Step 1 (Splash to Name)
    const splashBtn = document.getElementById('splash-start-btn');
    if (splashBtn) {
        splashBtn.onclick = () => {
            goToWizardStep(1);
        };
    }

    // Step 1 -> Step 2 (Name to BYOK Info)
    const step1Btn = document.getElementById('step-1-next-btn');
    if (step1Btn) {
        step1Btn.onclick = () => {
            const nameVal = document.getElementById('user-name-input').value.trim();
            if (nameVal) {
                state.userName = nameVal;
                chrome.storage.local.set({ userName: nameVal });
            }
            goToWizardStep(2);
        };
    }

    // Step 2 -> Step 3 (BYOK Info to AI Provider)
    const step2Btn = document.getElementById('step-2-next-btn');
    if (step2Btn) {
        step2Btn.onclick = () => {
            goToWizardStep(3);
        };
    }

    // Step 3 -> Step 4 (AI Provider to API Key)
    const step3Btn = document.getElementById('step-3-next-btn');
    if (step3Btn) {
        step3Btn.onclick = () => {
            const provider = document.getElementById('setup-provider-select').value;
            state.activeProvider = provider;
            populateModelDropdown('setup-model-select', provider);
            updateInstructions('setup');
            goToWizardStep(4);
        };
    }

    // Back Buttons (Step 2 -> Step 1, Step 3 -> Step 2, Step 4 -> Step 3)
    const step2BackBtn = document.getElementById('step-2-back-btn');
    if (step2BackBtn) {
        step2BackBtn.onclick = () => {
            goToWizardStep(1);
        };
    }

    const step3BackBtn = document.getElementById('step-3-back-btn');
    if (step3BackBtn) {
        step3BackBtn.onclick = () => {
            goToWizardStep(2);
        };
    }

    const step4BackBtn = document.getElementById('step-4-back-btn');
    if (step4BackBtn) {
        step4BackBtn.onclick = () => {
            goToWizardStep(3);
        };
    }
}

// Custom Themed Brutalist Dropdown Handler
function setupCustomDropdown() {
    const customDropdown = document.getElementById('custom-provider-dropdown');
    const selectedValEl = document.getElementById('dropdown-selected-val');
    const optionsMenu = document.getElementById('dropdown-options-menu');
    const nativeSelect = document.getElementById('setup-provider-select');

    if (!customDropdown || !selectedValEl || !optionsMenu) return;

    const providerNames = {
        gemini: 'Google Gemini (Free)',
        openrouter: 'OpenRouter (Free options)',
        openai: 'OpenAI (Direct API)',
        anthropic: 'Anthropic Claude (Direct API)'
    };

    // Toggle dropdown open/close
    selectedValEl.onclick = (e) => {
        e.stopPropagation();
        customDropdown.classList.toggle('open');
        optionsMenu.classList.toggle('hidden');
    };

    // Option selection
    const options = optionsMenu.querySelectorAll('.dropdown-option');
    options.forEach(option => {
        option.onclick = (e) => {
            e.stopPropagation();
            const val = option.getAttribute('data-value');

            // Update selected class
            options.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');

            // Update displayed text
            selectedValEl.querySelector('.provider-name').textContent = providerNames[val] || option.textContent;

            // Sync hidden native select
            nativeSelect.value = val;

            // Close dropdown
            customDropdown.classList.remove('open');
            optionsMenu.classList.add('hidden');

            // Update model & instructions preview
            populateModelDropdown('setup-model-select', val);
            updateInstructions('setup');
        };
    });

    // Close dropdown on click outside
    document.addEventListener('click', () => {
        customDropdown.classList.remove('open');
        optionsMenu.classList.add('hidden');
    });
}

// --------------------------------------------------------------------------
// Custom Cursor-Following Tooltip Manager
// --------------------------------------------------------------------------
function initCustomTooltips() {
    let tooltipEl = document.getElementById('custom-global-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'custom-global-tooltip';
        document.body.appendChild(tooltipEl);
    }

    document.addEventListener('mousemove', (e) => {
        if (tooltipEl.classList.contains('visible')) {
            tooltipEl.style.left = `${e.clientX}px`;
            tooltipEl.style.top = `${e.clientY}px`;
        }
    });

    document.querySelectorAll('[data-tooltip]').forEach(el => {
        el.addEventListener('mouseenter', (e) => {
            const text = el.getAttribute('data-tooltip');
            if (!text) return;
            tooltipEl.textContent = text;
            tooltipEl.style.left = `${e.clientX}px`;
            tooltipEl.style.top = `${e.clientY}px`;
            tooltipEl.classList.add('visible');
        });

        el.addEventListener('mouseleave', () => {
            tooltipEl.classList.remove('visible');
        });
    });
}

// --------------------------------------------------------------------------
// Custom Dropdown Sync Manager for Main View & Settings
// --------------------------------------------------------------------------
function setupMainCustomDropdowns() {
    // 1. Tone Dropdown
    setupGenericDropdown('tone-custom-dropdown', 'tone-dropdown-selected', 'tone-dropdown-options', 'tone-select', null);

    // 2. Settings Provider Dropdown
    setupGenericDropdown('popup-settings-provider-dropdown', 'popup-settings-provider-selected', 'popup-settings-provider-options', 'settings-provider-select', (newVal) => {
        const native = document.getElementById('settings-provider-select');
        native.value = newVal;
        native.dispatchEvent(new Event('change'));
        updateSettingsModelDropdownOptions(newVal);
    });

    // 4. Settings Model Dropdown
    setupGenericDropdown('popup-settings-model-dropdown', 'popup-settings-model-selected', 'popup-settings-model-options', 'settings-model-select', (newVal) => {
        const native = document.getElementById('settings-model-select');
        native.value = newVal;
    });

    // 5. Settings STT Dropdown
    setupGenericDropdown('popup-settings-stt-dropdown', 'popup-settings-stt-selected', 'popup-settings-stt-options', 'settings-stt-select', (newVal) => {
        const native = document.getElementById('settings-stt-select');
        if (native) native.value = newVal;
        const groqKeyGroup = document.getElementById('groq-key-group');
        if (groqKeyGroup) groqKeyGroup.classList.toggle('hidden', newVal !== 'groq');
    });

    // Initialize Settings model dropdown on load
    updateSettingsModelDropdownOptions(state.activeProvider);
}

function updateSettingsSttDropdownSelected(prov) {
    const selectedText = document.querySelector('#popup-settings-stt-selected .provider-name');
    const optionsMenu = document.getElementById('popup-settings-stt-options');
    const names = {
        webspeech: 'Browser Web Speech (Free)',
        groq: 'Groq Whisper (Recommended)'
    };
    if (selectedText) selectedText.textContent = names[prov] || 'Browser Web Speech (Free)';
    if (optionsMenu) {
        optionsMenu.querySelectorAll('.dropdown-option').forEach(opt => {
            opt.classList.toggle('selected', opt.getAttribute('data-value') === prov);
        });
    }
}

function setupGenericDropdown(wrapperId, selectedId, optionsId, nativeId, onChangeCallback) {
    const wrapper = document.getElementById(wrapperId);
    const selectedEl = document.getElementById(selectedId);
    const optionsMenu = document.getElementById(optionsId);
    const nativeSelect = document.getElementById(nativeId);

    if (!wrapper || !selectedEl || !optionsMenu || !nativeSelect) return;

    selectedEl.onclick = (e) => {
        e.stopPropagation();
        // Close all other dropdowns
        document.querySelectorAll('.custom-dropdown').forEach(d => {
            if (d !== wrapper) {
                d.classList.remove('open');
                const opt = d.querySelector('.dropdown-options');
                if (opt) opt.classList.add('hidden');
            }
        });
        wrapper.classList.toggle('open');
        optionsMenu.classList.toggle('hidden');
    };

    optionsMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-option');
        if (!item) return;
        e.stopPropagation();

        const val = item.getAttribute('data-value');
        optionsMenu.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('selected'));
        item.classList.add('selected');

        selectedEl.querySelector('.provider-name').textContent = item.textContent;
        nativeSelect.value = val;

        wrapper.classList.remove('open');
        optionsMenu.classList.add('hidden');

        if (onChangeCallback) onChangeCallback(val);
    });

    document.addEventListener('click', () => {
        wrapper.classList.remove('open');
        optionsMenu.classList.add('hidden');
    });
}

function updateSettingsModelDropdownOptions(provider) {
    const optionsMenu = document.getElementById('popup-settings-model-options');
    const selectedText = document.querySelector('#popup-settings-model-selected .provider-name');
    const nativeSelect = document.getElementById('settings-model-select');
    if (!optionsMenu || !selectedText || !nativeSelect) return;

    optionsMenu.innerHTML = '';
    const presets = modelPresets[provider] || [];
    const currentVal = state.models[provider] || (presets[0] ? presets[0].id : '');

    presets.forEach(m => {
        const item = document.createElement('div');
        item.className = `dropdown-option ${m.id === currentVal ? 'selected' : ''}`;
        item.setAttribute('data-value', m.id);
        item.textContent = m.name;
        optionsMenu.appendChild(item);

        if (m.id === currentVal) {
            selectedText.textContent = m.name;
            nativeSelect.value = m.id;
        }
    });
}

// --------------------------------------------------------------------------
// Custom Modal Display Helpers (Reset Warning & Limit Error)
// --------------------------------------------------------------------------
function showResetConfirmModal() {
    const modal = document.getElementById('reset-confirm-modal');
    if (modal) modal.classList.remove('hidden');
}

function hideResetConfirmModal() {
    const modal = document.getElementById('reset-confirm-modal');
    if (modal) modal.classList.add('hidden');
}

function showLimitErrorModal(title, message) {
    const modal = document.getElementById('limit-error-modal');
    const titleEl = document.getElementById('limit-modal-title');
    const bodyEl = document.getElementById('limit-modal-body');

    if (modal && titleEl && bodyEl) {
        titleEl.textContent = title || 'API Limit Exceeded';
        bodyEl.textContent = message || 'You have hit a provider rate limit (RPM/TPM/RPD). Please wait a moment or switch models.';
        modal.classList.remove('hidden');
    }
}

function hideLimitErrorModal() {
    const modal = document.getElementById('limit-error-modal');
    if (modal) modal.classList.add('hidden');
}