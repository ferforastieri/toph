let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  return context;
}

/** Create/resume the audio context during a user gesture so later replies can beep. */
export function unlockBotSound(): void {
  getContext();
}

function beep(audio: AudioContext): void {
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

/** Short two-tone signal used when a bot finishes a response. */
export function playBotResponseSound(): void {
  const audio = getContext();
  if (!audio) return;
  // WebViews only allow audio after a user gesture; wait for the resume when the
  // context is still suspended instead of dropping the signal silently.
  if (audio.state === "suspended") {
    void audio.resume().then(() => {
      if (audio.state === "running") beep(audio);
    }).catch(() => undefined);
    return;
  }
  beep(audio);
}

function questionBeep(audio: AudioContext): void {
  const start = audio.currentTime + 0.01;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.09, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.46);
  gain.connect(audio.destination);

  // Descending pair: clearly different from the rising completion chime.
  const first = audio.createOscillator();
  first.type = "triangle";
  first.frequency.setValueAtTime(988, start);
  first.frequency.exponentialRampToValueAtTime(740, start + 0.18);
  first.connect(gain);
  first.start(start);
  first.stop(start + 0.22);

  const second = audio.createOscillator();
  second.type = "triangle";
  second.frequency.setValueAtTime(740, start + 0.2);
  second.frequency.exponentialRampToValueAtTime(587, start + 0.38);
  second.connect(gain);
  second.start(start + 0.2);
  second.stop(start + 0.46);
}

/** Attention signal used when the Toph is waiting for an answer. */
export function playQuestionSound(): void {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === "suspended") {
    void audio.resume().then(() => {
      if (audio.state === "running") questionBeep(audio);
    }).catch(() => undefined);
    return;
  }
  questionBeep(audio);
}
