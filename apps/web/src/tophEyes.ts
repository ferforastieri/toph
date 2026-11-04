// Eye regions measured on the 256x256 source art. Each pair is the left
// and right eye, used to render small copies that follow the pointer.
// Keeping the data here avoids runtime image analysis and keeps the
// avatar body completely still while the eyes move.

export interface TophEyeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const TOPH_EYES: Record<string, readonly [TophEyeBox, TophEyeBox]> = {
  "toph-bloom": [{ x: 88, y: 102, w: 22, h: 40 }, { x: 146, y: 103, w: 22, h: 38 }],
  "toph-comet": [{ x: 81, y: 112, w: 21, h: 31 }, { x: 132, y: 108, w: 23, h: 38 }],
  "toph-core": [{ x: 81, y: 88, w: 24, h: 44 }, { x: 152, y: 88, w: 24, h: 44 }],
  "toph-cube": [{ x: 81, y: 99, w: 25, h: 41 }, { x: 149, y: 99, w: 26, h: 41 }],
  "toph-echo": [{ x: 87, y: 83, w: 24, h: 39 }, { x: 145, y: 83, w: 25, h: 39 }],
  "toph-forge": [{ x: 91, y: 111, w: 22, h: 38 }, { x: 144, y: 111, w: 22, h: 38 }],
  "toph-grove": [{ x: 86, y: 110, w: 23, h: 36 }, { x: 146, y: 110, w: 24, h: 36 }],
  "toph-kite": [{ x: 91, y: 97, w: 19, h: 37 }, { x: 144, y: 97, w: 20, h: 35 }],
  "toph-luna": [{ x: 85, y: 105, w: 21, h: 31 }, { x: 138, y: 105, w: 21, h: 31 }],
  "toph-mochi": [{ x: 84, y: 104, w: 24, h: 41 }, { x: 149, y: 103, w: 25, h: 41 }],
  "toph-nimbus": [{ x: 88, y: 89, w: 22, h: 40 }, { x: 146, y: 89, w: 22, h: 40 }],
  "toph-nova": [{ x: 86, y: 101, w: 24, h: 41 }, { x: 142, y: 101, w: 26, h: 42 }],
  "toph-orbit": [{ x: 90, y: 103, w: 20, h: 35 }, { x: 146, y: 103, w: 19, h: 34 }],
  "toph-peak": [{ x: 92, y: 104, w: 20, h: 41 }, { x: 145, y: 104, w: 21, h: 41 }],
  "toph-pebble": [{ x: 85, y: 95, w: 24, h: 38 }, { x: 147, y: 95, w: 25, h: 39 }],
  "toph-portal": [{ x: 84, y: 108, w: 24, h: 31 }, { x: 149, y: 109, w: 24, h: 30 }],
  "toph-prism": [{ x: 92, y: 99, w: 22, h: 39 }, { x: 142, y: 100, w: 22, h: 39 }],
  "toph-pulse": [{ x: 93, y: 101, w: 18, h: 33 }, { x: 146, y: 101, w: 17, h: 33 }],
  "toph-spark": [{ x: 87, y: 99, w: 26, h: 40 }, { x: 144, y: 98, w: 27, h: 41 }],
  "toph-tide": [{ x: 88, y: 111, w: 21, h: 39 }, { x: 148, y: 111, w: 21, h: 39 }],
};
