import { describe, expect, it } from "vitest";
import { audioBufferToWav } from "./useAudioRecorder";

describe("audio recording", () => {
  it("encodes microphone samples as mono 16 kHz WAV", () => {
    const channel = new Float32Array([0, 0.5, -0.5, 1]);
    const buffer = {
      sampleRate: 16_000,
      duration: channel.length / 16_000,
      length: channel.length,
      numberOfChannels: 1,
      getChannelData: () => channel,
    } as unknown as AudioBuffer;

    const wav = audioBufferToWav(buffer);
    const view = new DataView(wav);
    const text = (offset: number, length: number) => Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join("");

    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
  });
});
