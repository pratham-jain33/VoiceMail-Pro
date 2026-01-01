document.getElementById('grant-permission').addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        window.close();
    } catch (err) {
        alert('Microphone access denied. Please enable it in Chrome settings.');
    }
});