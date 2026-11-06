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
  "toph-logo": [{ x: 88, y: 40, w: 18, h: 29 }, { x: 150, y: 40, w: 18, h: 30 }],
  "toph-01": [{ x: 92, y: 121, w: 20, h: 36 }, { x: 143, y: 121, w: 21, h: 36 }],
  "toph-02": [{ x: 102, y: 142, w: 15, h: 27 }, { x: 138, y: 142, w: 15, h: 27 }],
  "toph-03": [{ x: 111, y: 104, w: 11, h: 20 }, { x: 134, y: 104, w: 11, h: 20 }],
  "toph-04": [{ x: 84, y: 101, w: 24, h: 39 }, { x: 146, y: 101, w: 24, h: 39 }],
  "toph-05": [{ x: 102, y: 102, w: 16, h: 27 }, { x: 138, y: 102, w: 16, h: 27 }],
  "toph-06": [{ x: 102, y: 84, w: 16, h: 28 }, { x: 138, y: 84, w: 16, h: 28 }],
  "toph-07": [{ x: 90, y: 109, w: 21, h: 36 }, { x: 145, y: 109, w: 21, h: 36 }],
  "toph-08": [{ x: 95, y: 125, w: 18, h: 33 }, { x: 141, y: 125, w: 19, h: 33 }],
  "toph-09": [{ x: 98, y: 102, w: 19, h: 33 }, { x: 142, y: 105, w: 19, h: 33 }],
  "toph-10": [{ x: 97, y: 148, w: 17, h: 32 }, { x: 142, y: 147, w: 18, h: 33 }],
  "toph-11": [{ x: 102, y: 115, w: 14, h: 28 }, { x: 139, y: 115, w: 15, h: 28 }],
  "toph-12": [{ x: 88, y: 110, w: 19, h: 33 }, { x: 133, y: 110, w: 20, h: 33 }],
  "toph-13": [{ x: 100, y: 104, w: 23, h: 40 }, { x: 153, y: 103, w: 22, h: 41 }],
  "toph-14": [{ x: 104, y: 105, w: 14, h: 24 }, { x: 137, y: 105, w: 14, h: 24 }],
  "toph-15": [{ x: 100, y: 76, w: 16, h: 27 }, { x: 139, y: 75, w: 15, h: 28 }],
  "toph-16": [{ x: 89, y: 121, w: 12, h: 23 }, { x: 116, y: 125, w: 13, h: 24 }],
  "toph-17": [{ x: 68, y: 140, w: 15, h: 27 }, { x: 109, y: 142, w: 15, h: 27 }],
  "toph-18": [{ x: 94, y: 97, w: 19, h: 33 }, { x: 140, y: 97, w: 19, h: 33 }],
  "toph-19": [{ x: 94, y: 86, w: 18, h: 31 }, { x: 144, y: 86, w: 18, h: 31 }],
  "toph-20": [{ x: 100, y: 135, w: 16, h: 29 }, { x: 140, y: 135, w: 16, h: 29 }],
  "toph-21": [{ x: 105, y: 100, w: 13, h: 25 }, { x: 137, y: 100, w: 14, h: 25 }],
  "toph-22": [{ x: 106, y: 65, w: 11, h: 19 }, { x: 137, y: 65, w: 12, h: 19 }],
  "toph-23": [{ x: 101, y: 108, w: 15, h: 27 }, { x: 139, y: 107, w: 15, h: 28 }],
  "toph-24": [{ x: 99, y: 117, w: 18, h: 32 }, { x: 139, y: 117, w: 18, h: 32 }],
  "toph-25": [{ x: 108, y: 149, w: 12, h: 21 }, { x: 135, y: 148, w: 13, h: 22 }],
  "toph-26": [{ x: 106, y: 86, w: 13, h: 24 }, { x: 137, y: 86, w: 13, h: 24 }],
  "toph-27": [{ x: 105, y: 89, w: 14, h: 23 }, { x: 137, y: 89, w: 14, h: 23 }],
  "toph-28": [{ x: 92, y: 107, w: 21, h: 38 }, { x: 142, y: 107, w: 21, h: 37 }],
  "toph-29": [{ x: 108, y: 61, w: 12, h: 24 }, { x: 135, y: 62, w: 13, h: 25 }],
  "toph-30": [{ x: 105, y: 106, w: 12, h: 22 }, { x: 136, y: 106, w: 13, h: 22 }],
};
