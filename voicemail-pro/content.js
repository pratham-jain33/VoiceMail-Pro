// content.js

let isRecording = false;
let recognition = null;
let lastActiveElement = null;
let currentTone = 'professional';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'voicemail_pro_start') {
    let activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'IFRAME') {
      try {
        activeEl = activeEl.contentDocument.activeElement;
      } catch (e) {}
    }
    lastActiveElement = activeEl;
    currentTone = msg.tone || 'professional';
    startVoiceMailPro();
  }
});

async function startVoiceMailPro() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    alert('Voice recognition not supported in this browser.');
    return;
  }
  if (isRecording) return;
  isRecording = true;
  showMicBlinker();
  const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    hideMicBlinker();
    isRecording = false;
    // Send transcript and tone to background for processing
    chrome.runtime.sendMessage({ action: 'voicemail_pro_transcript', transcript, tone: currentTone });
  };
  
  recognition.onerror = (event) => {
    hideMicBlinker();
    isRecording = false;
    alert('Voice recognition error: ' + event.error);
  };
  
  recognition.onend = () => {
    hideMicBlinker();
    isRecording = false;
  };
  recognition.start();
}

function showMicBlinker() {
  if (!lastActiveElement) return;
  try {
    lastActiveElement.dataset.originalCaret = lastActiveElement.style.caretColor;
    lastActiveElement.style.caretColor = 'transparent';
    lastActiveElement.style.backgroundImage = 'url("data:image/svg+xml;utf8,<svg width=\'18\' height=\'18\' xmlns=\'http://www.w3.org/2000/svg\'><circle cx=\'9\' cy=\'9\' r=\'7\' fill=\'%23e11d48\'/><rect x=\'7\' y=\'4\' width=\'4\' height=\'8\' rx=\'2\' fill=\'white\'/></svg>")';
    lastActiveElement.style.backgroundRepeat = 'no-repeat';
    lastActiveElement.style.backgroundPosition = 'right 6px center';
  } catch (e) {}
}

function hideMicBlinker() {
  if (!lastActiveElement) return;
  try {
    lastActiveElement.style.caretColor = lastActiveElement.dataset.originalCaret || '';
    lastActiveElement.style.backgroundImage = '';
  } catch (e) {}
}

// Helper to insert text at cursor for input/textarea or contenteditable fields
function insertTextAtCursor(el, text) {
  if (!el) return false;

  el.focus();

  // 1. If it's a standard input or textarea
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = el.value;

    const before = val.substring(0, start !== null ? start : val.length);
    const after = val.substring(end !== null ? end : val.length);

    el.value = before + text + after;

    // Move cursor to end of inserted text
    const newPos = (start !== null ? start : val.length) + text.length;
    el.selectionStart = el.selectionEnd = newPos;

    // Dispatch events so React/Vue models register the input
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // 2. If it's a contenteditable element (Gmail, Notion, Outlook etc.)
  if (el.isContentEditable) {
    // Try browser-native insertText command
    const success = document.execCommand('insertText', false, text);
    if (!success) {
      // Fallback: Range insertion API
      const sel = window.getSelection();
      if (sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        
        // Move selection range to end of text node
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  // 3. Fallback: standard assignment
  try {
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (e) {}
  return false;
}

// Listen for AI result and paste
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'voicemail_pro_paste') {
    let target = lastActiveElement || document.activeElement;
    
    if (target && target.tagName === 'IFRAME') {
      try {
        target = target.contentDocument.activeElement;
      } catch (e) {}
    }

    if (target) {
      insertTextAtCursor(target, msg.text);
    } else {
      alert('No text field or input is currently selected.');
    }
  }
});
