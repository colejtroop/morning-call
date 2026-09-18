export function createDemoVoice({ onTranscript }) {
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  let recognition = null;
  function speak(text) {
    if (!("speechSynthesis" in globalThis)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    speechSynthesis.speak(utterance);
  }
  function start() {
    if (!Recognition) return false;
    recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) if (event.results[index].isFinal) onTranscript(event.results[index][0].transcript);
    };
    recognition.onend = () => { try { recognition?.start(); } catch {} };
    try { recognition.start(); return true; } catch { return false; }
  }
  function stop() {
    const active = recognition;
    recognition = null;
    active?.stop();
    globalThis.speechSynthesis?.cancel();
  }
  return { speak, start, stop };
}
