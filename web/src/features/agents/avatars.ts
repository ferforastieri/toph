/** The one Toph: the mascot of the logo. There is no gallery of characters anymore. */
export const BOT_AVATARS = ["toph-logo"] as const;
export type BotAvatar = (typeof BOT_AVATARS)[number];

export const BOT_AVATAR_LABELS: Record<BotAvatar, string> = {
  "toph-logo": "Toph",
};

export type BotLanguage = "auto" | "pt" | "en" | "es";
