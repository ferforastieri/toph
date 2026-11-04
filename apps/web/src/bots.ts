export const BOT_AVATARS = [
  "toph-core", "toph-orbit", "toph-prism", "toph-bloom", "toph-forge",
  "toph-nimbus", "toph-tide", "toph-spark", "toph-echo", "toph-pebble",
  "toph-nova", "toph-luna", "toph-peak", "toph-kite", "toph-grove",
  "toph-pulse", "toph-cube", "toph-comet", "toph-portal", "toph-mochi",
] as const;
export type BotAvatar = (typeof BOT_AVATARS)[number];

export const BOT_AVATAR_LABELS: Record<BotAvatar, string> = {
  "toph-core": "Toph Essência", "toph-orbit": "Toph Órbita", "toph-prism": "Toph Prisma", "toph-bloom": "Toph Flora", "toph-forge": "Toph Forja",
  "toph-nimbus": "Toph Nimbus", "toph-tide": "Toph Maré", "toph-spark": "Toph Faísca", "toph-echo": "Toph Eco", "toph-pebble": "Toph Seixo",
  "toph-nova": "Toph Nova", "toph-luna": "Toph Luna", "toph-peak": "Toph Pico", "toph-kite": "Toph Pipa", "toph-grove": "Toph Bosque",
  "toph-pulse": "Toph Pulso", "toph-cube": "Toph Cubo", "toph-comet": "Toph Cometa", "toph-portal": "Toph Portal", "toph-mochi": "Toph Mochi",
};

export type BotLanguage = "auto" | "pt" | "en" | "es";
