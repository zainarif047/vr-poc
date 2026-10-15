// Browser text-to-speech for the scripted interviewer (Web Speech API).
// Production would stream a LiveKit agent voice; this simulates task assignment only.

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

let cancelToken = 0;

function pickVoice(): SpeechSynthesisVoice | undefined {
  if (!ttsSupported) return undefined;
  const vs = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  const pref = ['Google UK English Male', 'Daniel', 'Google US English', 'Samantha', 'Alex', 'Microsoft'];
  for (const p of pref) {
    const v = vs.find((x) => x.name.includes(p));
    if (v) return v;
  }
  return vs[0];
}

export function cancelSpeech() {
  cancelToken += 1;
  if (ttsSupported) window.speechSynthesis.cancel();
}

/** Speaks text, resolves when finished (or after an estimated duration when audio is muted/unavailable). */
export function speak(text: string, opts: { audio: boolean; onStart?: () => void } = { audio: true }): Promise<void> {
  const token = ++cancelToken;
  const estimate = Math.max(1400, text.length * 52);
  opts.onStart?.();
  if (!ttsSupported || !opts.audio) {
    return new Promise((res) => setTimeout(res, estimate));
  }
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 0.98;
    u.pitch = 1;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      resolve();
    };
    const guard = setTimeout(finish, estimate * 2.2 + 2500);
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.cancel();
    // allow cancel() to settle before queueing, avoids dropped utterances in Chrome
    setTimeout(() => {
      if (token !== cancelToken) return finish();
      window.speechSynthesis.speak(u);
    }, 60);
  });
}

if (ttsSupported) {
  // prime voice list (async in Chrome)
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}
