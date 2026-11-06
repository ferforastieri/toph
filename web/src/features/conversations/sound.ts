let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

/** Create/resume the audio context during a user gesture so later replies can beep. */
export function unlockBotSound(): void {
  getContext();
}

/** Short two-tone signal used when a bot finishes a response. */
export function playBotResponseSound(): void {
  const audio = getContext();
  if (!audio) return;
  const start = audio.currentTime + 0.01;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.075, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
  gain.connect(audio.destination);

  const first = audio.createOscillator();
  first.type = "sine";
  first.frequency.setValueAtTime(740, start);
  first.frequency.exponentialRampToValueAtTime(988, start + 0.13);
  first.connect(gain);
  first.start(start);
  first.stop(start + 0.17);

  const second = audio.createOscillator();
  second.type = "sine";
  second.frequency.setValueAtTime(1174, start + 0.12);
  second.frequency.exponentialRampToValueAtTime(1318, start + 0.25);
  second.connect(gain);
  second.start(start + 0.12);
  second.stop(start + 0.32);
}
