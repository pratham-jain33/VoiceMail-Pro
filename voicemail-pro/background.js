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

// Listen for transcript, call OpenRouter, and send result back
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action === 'voicemail_pro_transcript') {
    // Get API key from storage
    chrome.storage.local.get(['openrouterApiKey'], async (result) => {
      const apiKey = result.openrouterApiKey;
      if (!apiKey) {
        chrome.tabs.sendMessage(sender.tab.id, { action: 'voicemail_pro_paste', text: '[No API key set]' });
        return;
      }
      // Build prompt based on selected tone
      const tonePrompts = {
        professional: `Convert this casual speech into a professional email. Keep it concise and clear. Add appropriate greeting and closing.\n\nCasual speech: \"${msg.transcript}\"\n\nGenerate ONLY the email text, no explanations or extra formatting.`,
        friendly: `Convert this casual speech into a friendly but professional email. Use a warm tone. Add appropriate greeting and closing.\n\nCasual speech: \"${msg.transcript}\"\n\nGenerate ONLY the email text, no explanations or extra formatting.`,
        formal: `Convert this casual speech into a very formal business email. Use formal language and structure. Add appropriate greeting and closing.\n\nCasual speech: \"${msg.transcript}\"\n\nGenerate ONLY the email text, no explanations or extra formatting.`,
        casual: `Convert this speech into a casual email. Keep it relaxed but still clear. Add appropriate greeting and closing.\n\nCasual speech: \"${msg.transcript}\"\n\nGenerate ONLY the email text, no explanations or extra formatting.`
      };
      const prompt = tonePrompts[msg.tone] || tonePrompts.professional;
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
              { role: 'user', content: prompt }
            ],
            max_tokens: 500,
            temperature: 0.7
          })
        });
        if (!response.ok) {
          chrome.tabs.sendMessage(sender.tab.id, { action: 'voicemail_pro_paste', text: '[AI error: ' + response.status + ']' });
          return;
        }
        const data = await response.json();
        const emailText = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
          ? data.choices[0].message.content.trim()
          : '[No response from model]';
        chrome.tabs.sendMessage(sender.tab.id, { action: 'voicemail_pro_paste', text: emailText });
      } catch (e) {
        chrome.tabs.sendMessage(sender.tab.id, { action: 'voicemail_pro_paste', text: '[Network error]' });
      }
    });
  }
});
