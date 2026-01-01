// content.js

let isRecording = false;
let recognition = null;
let lastActiveElement = null;
let currentTone = 'professional';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'voicemail_pro_start') {
    lastActiveElement = document.activeElement;
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
    // Send transcript and tone to background for OpenRouter processing
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
  lastActiveElement.dataset.originalCaret = lastActiveElement.style.caretColor;
  lastActiveElement.style.caretColor = 'transparent';
  lastActiveElement.style.backgroundImage = 'url("data:image/svg+xml;utf8,<svg width=\'18\' height=\'18\' xmlns=\'http://www.w3.org/2000/svg\'><circle cx=\'9\' cy=\'9\' r=\'7\' fill=\'%23e11d48\'/><rect x=\'7\' y=\'4\' width=\'4\' height=\'8\' rx=\'2\' fill=\'white\'/></svg>")';
  lastActiveElement.style.backgroundRepeat = 'no-repeat';
  lastActiveElement.style.backgroundPosition = 'right 6px center';
}

function hideMicBlinker() {
  if (!lastActiveElement) return;
  lastActiveElement.style.caretColor = lastActiveElement.dataset.originalCaret || '';
  lastActiveElement.style.backgroundImage = '';
}

// Listen for AI result and paste
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'voicemail_pro_paste' && lastActiveElement) {
    lastActiveElement.value = msg.text;
    lastActiveElement.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
