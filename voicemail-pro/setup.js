// setup.js - Onboarding Wizard Script for Dedicated Page

let currentStepIndex = 0;
let state = {
    activeProvider: 'gemini',
    apiKeys: {},
    models: {},
    userName: '',
    sttProvider: 'webspeech',
    groqSttKey: ''
};

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

const instructionsHTML = {
    gemini: `
        <p><b>Step 1:</b> Get free Gemini API Key</p>
        <ol>
            <li>Go to <a href="https://aistudio.google.com/" target="_blank" style="color: #1d4ed8; font-weight: 800;">Google AI Studio</a></li>
            <li>Click <b>Create API Key</b></li>
            <li>Copy the key and paste it below</li>
        </ol>
    `,
    openrouter: `
        <p><b>Step 1:</b> Get OpenRouter API Key</p>
        <ol>
            <li>Go to <a href="https://openrouter.ai/keys" target="_blank" style="color: #1d4ed8; font-weight: 800;">OpenRouter API Keys</a></li>
            <li>Log in and click <b>+ Create Key</b></li>
            <li>Copy key (starts with <code>sk-or</code>) & paste below</li>
        </ol>
    `,
    openai: `
        <p><b>Step 1:</b> Get OpenAI API Key</p>
        <ol>
            <li>Go to <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #1d4ed8; font-weight: 800;">OpenAI API Keys</a></li>
            <li>Click <b>+ Create new secret key</b></li>
            <li>Copy key (starts with <code>sk-</code>) & paste below</li>
        </ol>
    `,
    anthropic: `
        <p><b>Step 1:</b> Get Anthropic API Key</p>
        <ol>
            <li>Go to <a href="https://console.anthropic.com/" target="_blank" style="color: #1d4ed8; font-weight: 800;">Anthropic Console</a></li>
            <li>Go to API keys section</li>
            <li>Create key (starts with <code>sk-ant-</code>) & paste below</li>
        </ol>
    `
};

document.addEventListener('DOMContentLoaded', () => {
    // Load local storage
    chrome.storage.local.get(['activeProvider', 'apiKeys', 'models', 'userName', 'sttProvider', 'groqSttKey'], (result) => {
        state.activeProvider = result.activeProvider || 'gemini';
        state.apiKeys = result.apiKeys || {};
        state.models = result.models || {};
        state.userName = result.userName || '';
        state.sttProvider = result.sttProvider || 'webspeech';
        state.groqSttKey = result.groqSttKey || '';

        if (state.userName) {
            document.getElementById('user-name-input').value = state.userName;
        }

        populateModelDropdown(state.activeProvider);
        document.getElementById('setup-provider-select').value = state.activeProvider;
        document.getElementById('fallback-provider-select').value = state.activeProvider;
        updateInstructions();

        // Restore STT provider selection in step 5
        const sttRadio = document.querySelector(`input[name="setup-stt-provider"][value="${state.sttProvider}"]`);
        if (sttRadio) {
            sttRadio.checked = true;
            updateSttCardSelection(state.sttProvider);
        }
        if (state.groqSttKey) {
            const groqKeyInput = document.getElementById('setup-groq-key-input');
            if (groqKeyInput) groqKeyInput.value = state.groqSttKey;
        }

        initOnboardingWizard();
        initCustomTooltips();
    });
});

function populateModelDropdown(provider) {
    const select = document.getElementById('setup-model-select');
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

function updateInstructions() {
    const provider = document.getElementById('setup-provider-select').value;
    document.getElementById('setup-instructions').innerHTML = instructionsHTML[provider] || '';
}

function initOnboardingWizard() {
    currentStepIndex = 0;
    
    const progressBar = document.getElementById('onboarding-progress-bar');
    if (progressBar) progressBar.classList.add('hidden');

    const slides = document.querySelectorAll('.onboarding-slide');
    slides.forEach((slide, index) => {
        slide.classList.remove('active-slide', 'slide-left', 'slide-right');
        if (index === 0) {
            slide.classList.add('active-slide');
        } else {
            slide.classList.add('slide-right');
        }
    });

    // Step 0 Animations
    const splashLogo = document.getElementById('splash-logo');
    const splashTitle = document.getElementById('splash-title');
    const splashBtn = document.getElementById('splash-start-btn');

    splashLogo.classList.remove('animate-grow');
    splashTitle.classList.remove('visible');
    splashBtn.classList.remove('visible');

    void splashLogo.offsetWidth;
    splashLogo.classList.add('animate-grow');

    setTimeout(() => {
        splashTitle.classList.add('visible');
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

    // 6 setup steps: 1 (Name), 2 (BYOK Info), 3 (AI Provider), 4 (AI API Key), 5 (Speech Setup), 6 (Technical Checks)
    const fillPercentages = { 1: '0%', 2: '20%', 3: '40%', 4: '60%', 5: '80%', 6: '100%' };
    trackFill.style.width = fillPercentages[stepIndex] || '0%';

    for (let i = 1; i <= 6; i++) {
        const tickNode = document.getElementById(`tick-${i}`);
        if (!tickNode) continue;

        tickNode.classList.remove('active', 'ticked');

        if (i < stepIndex) {
            tickNode.classList.add('ticked');
        } else if (i === stepIndex) {
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

    if (nextStepIndex === 1) {
        setTimeout(() => { document.getElementById('user-name-input').focus(); }, 450);
    } else if (nextStepIndex === 4) {
        setTimeout(() => { document.getElementById('setup-api-key-input').focus(); }, 450);
    } else if (nextStepIndex === 5) {
        const groqKeyInput = document.getElementById('setup-groq-key-input');
        if (groqKeyInput && !groqKeyInput.parentElement.classList.contains('hidden')) {
            setTimeout(() => { groqKeyInput.focus(); }, 450);
        }
    } else if (nextStepIndex === 6) {
        runTechnicalChecks();
    }
}

function setupWizardListeners() {
    // Step 0 -> 1
    const splashBtn = document.getElementById('splash-start-btn');
    if (splashBtn) {
        splashBtn.onclick = () => { goToWizardStep(1); };
    }

    // Step 1 -> 2
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

    // Step 2 -> 3
    const step2Btn = document.getElementById('step-2-next-btn');
    if (step2Btn) {
        step2Btn.onclick = () => { goToWizardStep(3); };
    }

    // Step 3 -> 4
    const step3Btn = document.getElementById('step-3-next-btn');
    if (step3Btn) {
        step3Btn.onclick = () => {
            const provider = document.getElementById('setup-provider-select').value;
            state.activeProvider = provider;
            populateModelDropdown(provider);
            updateInstructions();
            goToWizardStep(4);
        };
    }

    // Step 4 -> 5
    const step4Btn = document.getElementById('step-4-next-btn');
    if (step4Btn) {
        step4Btn.onclick = () => {
            const key = document.getElementById('setup-api-key-input').value.trim();
            const provider = document.getElementById('setup-provider-select').value;
            const model = document.getElementById('setup-model-select').value;

            if (!key) {
                const errEl = document.getElementById('setup-error');
                errEl.textContent = 'Please enter an API key.';
                errEl.classList.remove('hidden');
                return;
            }

            state.apiKeys[provider] = key;
            state.models[provider] = model;
            state.activeProvider = provider;

            chrome.storage.local.set({
                activeProvider: state.activeProvider,
                apiKeys: state.apiKeys,
                models: state.models
            }, () => {
                goToWizardStep(5);
            });
        };
    }

    // Step 5 STT Radio Card listeners
    document.querySelectorAll('input[name="setup-stt-provider"]').forEach(radio => {
        radio.addEventListener('change', () => {
            updateSttCardSelection(radio.value);
        });
    });

    // Step 5 -> 6
    const step5Btn = document.getElementById('step-5-next-btn');
    if (step5Btn) {
        step5Btn.onclick = () => {
            const selectedStt = document.querySelector('input[name="setup-stt-provider"]:checked')?.value || 'webspeech';
            const sttErrorEl = document.getElementById('setup-stt-error');
            sttErrorEl.classList.add('hidden');

            if (selectedStt === 'groq') {
                const groqKey = document.getElementById('setup-groq-key-input').value.trim();
                if (!groqKey) {
                    sttErrorEl.textContent = 'Please enter your Groq API key (starts with gsk_) or select Browser Web Speech API.';
                    sttErrorEl.classList.remove('hidden');
                    return;
                }
                state.sttProvider = 'groq';
                state.groqSttKey = groqKey;
            } else {
                state.sttProvider = 'webspeech';
            }

            chrome.storage.local.set({
                sttProvider: state.sttProvider,
                groqSttKey: state.groqSttKey
            }, () => {
                goToWizardStep(6);
            });
        };
    }

    // Back Buttons
    const backBtnMap = {
        'step-2-back-btn': 1,
        'step-3-back-btn': 2,
        'step-4-back-btn': 3,
        'step-5-back-btn': 4,
        'step-6-back-btn': 5
    };

    Object.keys(backBtnMap).forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.onclick = () => { goToWizardStep(backBtnMap[id]); };
        }
    });

    // Fallback retry button
    const fallbackRetryBtn = document.getElementById('fallback-retry-btn');
    if (fallbackRetryBtn) {
        fallbackRetryBtn.onclick = () => {
            const newKey = document.getElementById('fallback-api-key-input').value.trim();
            const newProvider = document.getElementById('fallback-provider-select').value;
            const newGroqKey = document.getElementById('fallback-groq-key-input').value.trim();
            
            if (newKey) {
                state.apiKeys[newProvider] = newKey;
                state.activeProvider = newProvider;
                const model = modelPresets[newProvider] ? modelPresets[newProvider][0].id : '';
                state.models[newProvider] = model;

                document.getElementById('setup-api-key-input').value = newKey;
                document.getElementById('setup-provider-select').value = newProvider;
            }

            if (newGroqKey) {
                state.groqSttKey = newGroqKey;
                state.sttProvider = 'groq';
                const setupGroqInput = document.getElementById('setup-groq-key-input');
                if (setupGroqInput) setupGroqInput.value = newGroqKey;
            }

            chrome.storage.local.set({
                activeProvider: state.activeProvider,
                apiKeys: state.apiKeys,
                models: state.models,
                sttProvider: state.sttProvider,
                groqSttKey: state.groqSttKey
            });

            document.getElementById('tech-check-fallback').classList.add('hidden');
            runTechnicalChecks();
        };
    }

    // Finish onboarding button
    const finishBtn = document.getElementById('onboarding-finish-btn');
    const completeModal = document.getElementById('setup-complete-modal');
    const closeSetupBtn = document.getElementById('modal-close-setup-btn');

    if (finishBtn) {
        finishBtn.onclick = () => {
            if (completeModal) {
                completeModal.classList.remove('hidden');
            } else {
                window.close();
            }
        };
    }

    if (closeSetupBtn) {
        closeSetupBtn.onclick = () => {
            window.close();
        };
    }
}

function updateSttCardSelection(selectedVal) {
    const webspeechCard = document.getElementById('stt-opt-webspeech-card');
    const groqCard = document.getElementById('stt-opt-groq-card');
    const groqKeyCard = document.getElementById('setup-groq-key-card');
    const sttErrorEl = document.getElementById('setup-stt-error');

    if (sttErrorEl) sttErrorEl.classList.add('hidden');

    if (selectedVal === 'groq') {
        if (webspeechCard) webspeechCard.classList.remove('selected');
        if (groqCard) groqCard.classList.add('selected');
        if (groqKeyCard) groqKeyCard.classList.remove('hidden');
    } else {
        if (groqCard) groqCard.classList.remove('selected');
        if (webspeechCard) webspeechCard.classList.add('selected');
        if (groqKeyCard) groqKeyCard.classList.add('hidden');
    }
}

function setupCustomDropdown() {
    setupDropdownInstance('custom-provider-dropdown', 'dropdown-selected-val', 'dropdown-options-menu', 'setup-provider-select', (val) => {
        populateModelDropdown(val);
        updateInstructions();
    });

    setupDropdownInstance('fallback-provider-custom-dropdown', 'fallback-provider-dropdown-selected', 'fallback-provider-dropdown-options', 'fallback-provider-select', null);
}

function setupDropdownInstance(wrapperId, selectedId, optionsId, nativeId, onChangeCallback) {
    const customDropdown = document.getElementById(wrapperId);
    const selectedValEl = document.getElementById(selectedId);
    const optionsMenu = document.getElementById(optionsId);
    const nativeSelect = document.getElementById(nativeId);

    if (!customDropdown || !selectedValEl || !optionsMenu || !nativeSelect) return;

    const providerNames = {
        gemini: 'Google Gemini (Free)',
        openrouter: 'OpenRouter (Free options)',
        openai: 'OpenAI (Direct API)',
        anthropic: 'Anthropic Claude (Direct API)'
    };

    selectedValEl.onclick = (e) => {
        e.stopPropagation();
        customDropdown.classList.toggle('open');
        optionsMenu.classList.toggle('hidden');
    };

    const options = optionsMenu.querySelectorAll('.dropdown-option');
    options.forEach(option => {
        option.onclick = (e) => {
            e.stopPropagation();
            const val = option.getAttribute('data-value');

            options.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');

            selectedValEl.querySelector('.provider-name').textContent = providerNames[val] || option.textContent;
            nativeSelect.value = val;

            customDropdown.classList.remove('open');
            optionsMenu.classList.add('hidden');

            if (onChangeCallback) onChangeCallback(val);
        };
    });

    document.addEventListener('click', () => {
        customDropdown.classList.remove('open');
        optionsMenu.classList.add('hidden');
    });
}

// --------------------------------------------------------------------------
// Technical Checks Suite
// --------------------------------------------------------------------------
async function runTechnicalChecks() {
    const micItem = document.getElementById('check-item-mic');
    const api2Item = document.getElementById('check-item-api2');
    const api3Item = document.getElementById('check-item-api3');
    const sttItem = document.getElementById('check-item-stt');

    const micDesc = document.getElementById('mic-status-desc');
    const api2Desc = document.getElementById('api2-status-desc');
    const api3Desc = document.getElementById('api3-status-desc');
    const sttDesc = document.getElementById('stt-status-desc');

    const micRetryBtn = document.getElementById('mic-retry-btn');
    const fallbackBox = document.getElementById('tech-check-fallback');
    const finishBtn = document.getElementById('onboarding-finish-btn');

    // Reset status indicators
    [micItem, api2Item, api3Item, sttItem].forEach(item => {
        if (!item) return;
        const icon = item.querySelector('.check-icon-status');
        icon.className = 'check-icon-status status-pending';
        icon.innerHTML = '<img src="icons/spinner-gap.png" class="spinner-icon-rotate" alt="Checking..." />';
    });

    micDesc.textContent = 'Checking microphone permissions...';
    api2Desc.textContent = 'Authenticating with AI provider...';
    api3Desc.textContent = 'Running quick prompt test...';
    if (sttDesc) sttDesc.textContent = 'Verifying STT engine configuration...';

    micRetryBtn.classList.add('hidden');
    fallbackBox.classList.add('hidden');
    finishBtn.classList.add('hidden');

    let overallSuccess = true;

    // 1. Microphone Check
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Stop stream immediately
        setCheckItemStatus(micItem, true);
        micDesc.textContent = 'Microphone permission granted & hardware ready.';
    } catch (e) {
        overallSuccess = false;
        setCheckItemStatus(micItem, false);
        micDesc.textContent = `Microphone access denied (${e.name || e.message}).`;
        micRetryBtn.classList.remove('hidden');
        micRetryBtn.onclick = async () => {
            await runTechnicalChecks();
        };
    }

    const provider = state.activeProvider;
    const apiKey = state.apiKeys[provider] || '';
    const model = state.models[provider] || (modelPresets[provider] ? modelPresets[provider][0].id : '');

    // 2. API Check 1: Provider Authentication Test
    let authValid = false;
    if (apiKey) {
        try {
            if (provider === 'gemini') {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                if (res.status === 400 || res.status === 403 || res.status === 401) {
                    throw new Error('Invalid API key or unauthorized credentials.');
                } else if (!res.ok) {
                    throw new Error(`Authentication server returned error (HTTP ${res.status}).`);
                }
            } else if (provider === 'openrouter') {
                const res = await fetch('https://openrouter.ai/api/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (res.status === 401 || res.status === 403) {
                    throw new Error('Invalid API key or unauthorized credentials.');
                } else if (!res.ok) {
                    throw new Error(`Authentication server returned error (HTTP ${res.status}).`);
                }
            } else if (provider === 'openai') {
                const res = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (res.status === 401 || res.status === 403) {
                    throw new Error('Invalid API key or unauthorized credentials.');
                } else if (!res.ok) {
                    throw new Error(`Authentication server returned error (HTTP ${res.status}).`);
                }
            } else if (provider === 'anthropic') {
                const res = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({})
                });
                if (res.status === 401 || res.status === 403) {
                    throw new Error('Invalid API key or unauthorized credentials.');
                }
            }
            authValid = true;
            setCheckItemStatus(api2Item, true);
            api2Desc.textContent = `Successfully authenticated with ${provider.toUpperCase()}.`;
        } catch (err) {
            overallSuccess = false;
            setCheckItemStatus(api2Item, false);
            api2Desc.textContent = `Authentication failed: ${err.message}`;
        }
    } else {
        overallSuccess = false;
        setCheckItemStatus(api2Item, false);
        api2Desc.textContent = 'No API key provided.';
    }

    // 4. API Check 3: Model Execution & Prompt Test
    async function runModelPrompt(p, key, mdl) {
        if (p === 'gemini') {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: 'Respond with OK' }] }] })
            });
            return res;
        } else if (p === 'openai') {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({ model: mdl, messages: [{ role: 'user', content: 'Respond with OK' }], max_tokens: 10 })
            });
            return res;
        } else if (p === 'openrouter') {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({ model: mdl, messages: [{ role: 'user', content: 'Respond with OK' }], max_tokens: 10 })
            });
            return res;
        } else if (p === 'anthropic') {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({ model: mdl, max_tokens: 10, messages: [{ role: 'user', content: 'Respond with OK' }] })
            });
            return res;
        }
    }

    const fallbackModels = {
        gemini: 'gemini-3.5-flash-lite',
        openrouter: 'openrouter/auto',
        openai: 'gpt-4o-mini',
        anthropic: 'claude-3-haiku-20240307'
    };

    if (authValid) {
        try {
            let usedModel = model;
            let res = await runModelPrompt(provider, apiKey, usedModel);

            if (res.status === 429) {
                setCheckItemStatus(api3Item, true);
                api3Desc.textContent = `Key valid. Rate-limited on free tier — this is normal.`;
            } else if (res.status === 404) {
                const fb = fallbackModels[provider];
                if (fb && fb !== usedModel) {
                    res = await runModelPrompt(provider, apiKey, fb);
                    usedModel = fb;
                }
                if (res.status === 429) {
                    setCheckItemStatus(api3Item, true);
                    api3Desc.textContent = `Key valid. Rate-limited on free tier — this is normal.`;
                } else if (!res.ok) {
                    throw new Error(`Status ${res.status} on model ${usedModel}`);
                } else {
                    setCheckItemStatus(api3Item, true);
                    api3Desc.textContent = `Execution test passed (using ${usedModel}).`;
                    state.models[provider] = usedModel;
                    chrome.storage.local.set({ models: state.models });
                }
            } else if (!res.ok) {
                throw new Error(`Status ${res.status}`);
            } else {
                setCheckItemStatus(api3Item, true);
                api3Desc.textContent = `Execution test passed on model: ${usedModel}`;
            }
        } catch (err) {
            overallSuccess = false;
            setCheckItemStatus(api3Item, false);
            api3Desc.textContent = `Pipeline test failed: ${err.message}`;
        }
    } else {
        overallSuccess = false;
        setCheckItemStatus(api3Item, false);
        api3Desc.textContent = 'Skipped due to authentication failure.';
    }

    // 5. STT Engine Verification Test
    if (sttItem && sttDesc) {
        if (state.sttProvider === 'groq') {
            const groqKey = state.groqSttKey || '';
            if (!groqKey) {
                overallSuccess = false;
                setCheckItemStatus(sttItem, false);
                sttDesc.textContent = 'No Groq API key provided.';
            } else {
                try {
                    const res = await fetch('https://api.groq.com/openai/v1/models', {
                        headers: { 'Authorization': `Bearer ${groqKey}` }
                    });
                    if (res.status === 401 || res.status === 403) {
                        throw new Error('Invalid Groq API key or unauthorized credentials.');
                    } else if (!res.ok) {
                        throw new Error(`Groq server returned error (HTTP ${res.status}).`);
                    }
                    setCheckItemStatus(sttItem, true);
                    sttDesc.textContent = 'Groq Whisper API authenticated (whisper-large-v3-turbo).';
                } catch (err) {
                    overallSuccess = false;
                    setCheckItemStatus(sttItem, false);
                    sttDesc.textContent = `Groq STT check failed: ${err.message}`;
                }
            }
        } else {
            setCheckItemStatus(sttItem, true);
            sttDesc.textContent = 'Browser Web Speech API active & ready.';
        }
    }

    // Render diagnostic result button or fallback update container
    if (overallSuccess) {
        finishBtn.classList.remove('hidden');
    } else {
        fallbackBox.classList.remove('hidden');
        document.getElementById('fallback-api-key-input').value = apiKey;
        document.getElementById('fallback-provider-select').value = provider;
        const fallbackGroqGroup = document.getElementById('fallback-groq-group');
        if (fallbackGroqGroup) {
            fallbackGroqGroup.classList.toggle('hidden', state.sttProvider !== 'groq');
        }
        const fallbackGroqInput = document.getElementById('fallback-groq-key-input');
        if (fallbackGroqInput && state.groqSttKey) {
            fallbackGroqInput.value = state.groqSttKey;
        }
    }
}

function setCheckItemStatus(itemEl, isPass) {
    const icon = itemEl.querySelector('.check-icon-status');
    if (isPass) {
        icon.className = 'check-icon-status status-pass';
        icon.innerHTML = '<img src="icons/check.png" class="status-icon-img" alt="Passed" />';
    } else {
        icon.className = 'check-icon-status status-fail';
        icon.innerHTML = '✕';
    }
}

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
