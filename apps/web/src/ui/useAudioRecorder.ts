import { useEffect, useRef, useState } from "react";

export interface AgentAttachment { name: string; uri: string; mime: string; size: number; }

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0?: { transcript?: string };
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface AudioBridge {
  hasPermission?: () => boolean;
  requestPermission?: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    TophAudio?: AudioBridge;
    webkitAudioContext?: typeof AudioContext;
  }
}

interface Options {
  onComplete: (attachment: AgentAttachment, transcript: string) => void;
  onError: (message: string) => void;
  maxSeconds?: number;
}

function preferredMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"]
    .find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "";
}

function dataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Encodes speech as mono PCM16 WAV at 16 kHz for broad model compatibility. */
export function audioBufferToWav(buffer: AudioBuffer, targetRate = 16_000): ArrayBuffer {
  const sampleRate = Math.min(targetRate, buffer.sampleRate);
  const frameCount = Math.max(1, Math.round(buffer.duration * sampleRate));
  const pcm = new Int16Array(frameCount);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  for (let index = 0; index < frameCount; index += 1) {
    const sourcePosition = index * (buffer.sampleRate / sampleRate);
    const left = Math.min(Math.floor(sourcePosition), buffer.length - 1);
    const right = Math.min(left + 1, buffer.length - 1);
    const fraction = sourcePosition - left;
    let sample = 0;
    for (const channel of channels) {
      sample += (channel[left] ?? 0) * (1 - fraction) + (channel[right] ?? 0) * fraction;
    }
    sample = Math.max(-1, Math.min(1, sample / Math.max(1, channels.length)));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  const output = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(output);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  new Int16Array(output, 44).set(pcm);
  return output;
}

async function wavBlob(blob: Blob): Promise<Blob> {
  const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextCtor) return blob;
  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    return new Blob([audioBufferToWav(decoded)], { type: "audio/wav" });
  } catch {
    return blob;
  } finally {
    void context.close().catch(() => undefined);
  }
}

async function nativePermission(): Promise<boolean> {
  const bridge = window.TophAudio;
  if (!bridge?.requestPermission) return true;
  try {
    if (bridge.hasPermission?.()) return true;
  } catch {
    return true;
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (granted: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("toph:microphone-permission", permission as EventListener);
      resolve(granted);
    };
    const permission = (event: Event) => finish(Boolean((event as CustomEvent<{ granted?: boolean }>).detail?.granted));
    const timeout = window.setTimeout(() => {
      try { finish(Boolean(bridge.hasPermission?.())); } catch { finish(false); }
    }, 20_000);
    window.addEventListener("toph:microphone-permission", permission as EventListener);
    bridge.requestPermission?.();
  });
}

function recordingError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Permita o acesso ao microfone para gravar áudio.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "Nenhum microfone foi encontrado.";
  return "Não foi possível iniciar a gravação de áudio.";
}

export function useAudioRecorder({ onComplete, onError, maxSeconds = 120 }: Options) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptRef = useRef("");
  const mountedRef = useRef(true);
  const completeRef = useRef(onComplete);
  const errorRef = useRef(onError);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const supported = typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== "undefined";

  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);
  useEffect(() => { errorRef.current = onError; }, [onError]);

  function releaseMedia() {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    recognitionRef.current = null;
    recorderRef.current = null;
  }

  async function finalize(mime: string) {
    if (mountedRef.current) setProcessing(true);
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    const source = new Blob(chunksRef.current, { type: mime || "audio/webm" });
    chunksRef.current = [];
    const audio = await wavBlob(source);
    if (audio.size > 8 * 1024 * 1024) {
      errorRef.current("O áudio ficou maior que 8 MB. Grave uma mensagem mais curta.");
      if (mountedRef.current) setProcessing(false);
      releaseMedia();
      return;
    }
    try {
      const uri = await dataUri(audio);
      if (mountedRef.current) {
        const extension = audio.type === "audio/wav" ? "wav" : audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
        completeRef.current({
          name: `audio-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`,
          uri,
          mime: audio.type || "audio/webm",
          size: audio.size,
        }, transcriptRef.current.trim());
      }
    } catch {
      errorRef.current("Não foi possível preparar o áudio gravado.");
    } finally {
      if (mountedRef.current) setProcessing(false);
      releaseMedia();
    }
  }

  function startRecognition() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;
    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = document.documentElement.lang || navigator.language || "pt-BR";
      recognition.onresult = (event) => {
        let transcript = "";
        for (let index = 0; index < event.results.length; index += 1) transcript += `${event.results[index]?.[0]?.transcript ?? ""} `;
        transcriptRef.current = transcript.trim();
        if (mountedRef.current) setLiveTranscript(transcriptRef.current);
      };
      recognition.onerror = () => undefined;
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      recognitionRef.current = null;
    }
  }

  async function start() {
    if (!supported || recording || processing) return;
    if (!await nativePermission()) {
      errorRef.current("A permissão do microfone foi negada.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mime = preferredMimeType();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      transcriptRef.current = "";
      setLiveTranscript("");
      setElapsed(0);
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onerror = () => errorRef.current("A gravação foi interrompida pelo navegador.");
      recorder.onstop = () => void finalize(recorder.mimeType || mime);
      recorder.start(250);
      startRecognition();
      setRecording(true);
    } catch (error) {
      releaseMedia();
      errorRef.current(recordingError(error));
    }
  }

  function stop() {
    if (!recording) return;
    setRecording(false);
    setProcessing(true);
    try { recognitionRef.current?.stop(); } catch { recognitionRef.current?.abort(); }
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    else {
      setProcessing(false);
      releaseMedia();
    }
  }

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setElapsed((current) => {
        const next = current + 1;
        if (next >= maxSeconds) window.setTimeout(stop, 0);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording, maxSeconds]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder) recorder.onstop = null;
      try { if (recorder?.state === "recording") recorder.stop(); } catch { /* already stopped */ }
      try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
      releaseMedia();
    };
  }, []);

  return { supported, recording, processing, elapsed, liveTranscript, start, stop };
}
