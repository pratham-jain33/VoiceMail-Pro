// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'voicemail-pro-root',
    title: 'VoiceMail Pro',
    contexts: ['editable']
  });
  const tones = [
    { id: 'casual', title: 'Casual' },
    { id: 'professional', title: 'Professional' },
    { id: 'friendly', title: 'Friendly' },
    { id: 'formal', title: 'Formal' }
  ];
  tones.forEach(tone => {
    chrome.contextMenus.create({
      id: `voicemail-pro-${tone.id}`,
      parentId: 'voicemail-pro-root',
      title: tone.title,
      contexts: ['editable']
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId.startsWith('voicemail-pro-')) {
    const tone = info.menuItemId.replace('voicemail-pro-', '');
    if (['casual', 'professional', 'friendly', 'formal'].includes(tone)) {
      chrome.tabs.sendMessage(tab.id, { action: 'voicemail_pro_start', tone });
    }
  }
});

// Listen for transcript, call the active API provider, and send formatted text back
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'voicemail_pro_transcript') {
    // Get settings from local storage
    chrome.storage.local.get(['activeProvider', 'apiKeys', 'models'], async (result) => {
      const provider = result.activeProvider || 'gemini';
      const apiKeys = result.apiKeys || {};
      const models = result.models || {};
      
      const apiKey = apiKeys[provider];
      
      const defaultModels = {
        gemini: 'gemini-3.5-flash-lite',
        openai: 'gpt-4o-mini',
        anthropic: 'claude-3-5-sonnet-20240620',
        openrouter: 'openrouter/auto'
      };
      
      const model = models[provider] || defaultModels[provider];
      
      if (!apiKey) {
        chrome.tabs.sendMessage(sender.tab.id, { 
          action: 'voicemail_pro_paste', 
          text: `[Error: No API key configured for ${provider.toUpperCase()}]` 
        });
        return;
      }
      
      const systemPrompt = "You are an expert professional email writer. Convert casual speech into emails.";
      const prompts = {
        professional: `Convert this casual speech into a professional email. Keep it concise and clear. Add appropriate greeting and closing.\n\nCasual speech: "${msg.transcript}"\n\nGenerate ONLY the email text, no explanations, no markdown styling, and no extra formatting.`,
        friendly: `Convert this casual speech into a friendly but professional email. Use a warm, cooperative tone. Add appropriate greeting and closing.\n\nCasual speech: "${msg.transcript}"\n\nGenerate ONLY the email text, no explanations, no markdown styling, and no extra formatting.`,
        formal: `Convert this casual speech into a highly formal business email. Use structured, formal business terms. Add appropriate greeting and closing.\n\nCasual speech: "${msg.transcript}"\n\nGenerate ONLY the email text, no explanations, no markdown styling, and no extra formatting.`,
        casual: `Convert this speech into a casual, relaxed email. Keep it friendly and informal. Add appropriate greeting and closing.\n\nCasual speech: "${msg.transcript}"\n\nGenerate ONLY the email text, no explanations, no markdown styling, and no extra formatting.`
      };
      
      const targetPrompt = prompts[msg.tone] || prompts.professional;
      
      try {
        let emailText = '';
        
        if (provider === 'gemini') {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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
            throw new Error(errData.error?.message || `Status ${response.status}`);
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
            throw new Error(errData.error?.message || `Status ${response.status}`);
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
              messages: [{ role: 'user', content: targetPrompt }],
              temperature: 0.7
            })
          });
          
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `Status ${response.status}`);
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
            throw new Error(errData.error?.message || `Status ${response.status}`);
          }
          const data = await response.json();
          emailText = data.choices?.[0]?.message?.content || '';
        }

        emailText = emailText.trim();
        if (!emailText) throw new Error('Empty model response.');

        chrome.tabs.sendMessage(sender.tab.id, { action: 'voicemail_pro_paste', text: emailText });
      } catch (e) {
        chrome.tabs.sendMessage(sender.tab.id, { 
          action: 'voicemail_pro_paste', 
          text: `[Error: Generation failed - ${e.message}]` 
        });
      }
    });
  }
});
