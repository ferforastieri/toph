import { create } from "zustand";
import { api, type PetConfig as ApiPetConfig } from "./api";

export type PetKind = "momo" | "pip" | "byte" | "nori";
export type PetMode = "corner" | "free";

export interface PetConfig {
  chosen: boolean;
  enabled: boolean;
  kind: PetKind;
  mode: PetMode;
  commits: number;
}

export const PET_OPTIONS: Array<{ kind: PetKind; name: string; description: string }> = [
  { kind: "momo", name: "Momo", description: "Um gato de âmbar que adora um terminal quentinho." },
  { kind: "pip", name: "Pip", description: "Coelho curioso, sempre de olho nos seus commits." },
  { kind: "byte", name: "Byte", description: "Robô compacto que processa carinho em alta velocidade." },
  { kind: "nori", name: "Nori", description: "Fantasma tranquilo que flutua pelos cantos do workspace." },
];

const DEFAULT_CONFIG: PetConfig = {
  chosen: false,
  enabled: false,
  kind: "momo",
  mode: "corner",
  commits: 0,
};

// Each commit is a snack. The first evolution lands after 3 commits.
export function petLevel(commits: number): number {
  return Math.min(5, 1 + Math.floor(Math.max(0, commits) / 3));
}

export function petLevelProgress(commits: number): number {
  if (petLevel(commits) >= 5) return 100;
  return ((Math.max(0, commits) % 3) / 3) * 100;
}

function storageKey(username: string): string {
  return `toph_pet_${username}`;
}

function normalizePet(value: Partial<ApiPetConfig>): PetConfig {
  return {
    chosen: value.chosen === true,
    enabled: value.enabled === true,
    kind: value.kind === "momo" || value.kind === "pip" || value.kind === "byte" || value.kind === "nori" ? value.kind : "momo",
    mode: value.mode === "free" ? "free" : "corner",
    commits: typeof value.commits === "number" && Number.isFinite(value.commits) ? Math.max(0, Math.floor(value.commits)) : 0,
  };
}

function readLocalPet(username: string): PetConfig {
  if (!username) return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(storageKey(username));
    if (!raw) return DEFAULT_CONFIG;
    return normalizePet(JSON.parse(raw) as Partial<PetConfig>);
  } catch {
    return DEFAULT_CONFIG;
  }
}

function writeLocalPet(username: string, config: PetConfig): void {
  if (!username) return;
  try {
    localStorage.setItem(storageKey(username), JSON.stringify(config));
  } catch {
    // The server remains the source of truth when storage is unavailable.
  }
}

function persistPet(username: string, config: PetConfig): void {
  writeLocalPet(username, config);
  if (!username) return;
  void api.savePet(config).catch(() => undefined);
}

interface PetState extends PetConfig {
  username: string;
  loaded: boolean;
  hydrate: (username: string) => Promise<void>;
  choose: (kind: PetKind) => void;
  disable: () => void;
  setMode: (mode: PetMode) => void;
  feed: () => void;
}

function snapshot(state: PetState): PetConfig {
  return {
    chosen: state.chosen,
    enabled: state.enabled,
    kind: state.kind,
    mode: state.mode,
    commits: state.commits,
  };
}

export const usePet = create<PetState>((set, get) => ({
  username: "",
  loaded: false,
  ...DEFAULT_CONFIG,
  hydrate: async (username) => {
    if (!username) {
      set({ ...DEFAULT_CONFIG, username: "", loaded: false });
      return;
    }
    if (get().loaded && get().username === username) return;
    set({ username, loaded: false });
    const local = readLocalPet(username);
    try {
      let remote = normalizePet(await api.pet());
      // Preserve a choice made before pet settings moved to the database.
      if (!remote.chosen && local.chosen) {
        remote = local;
        await api.savePet(remote).catch(() => undefined);
      }
      writeLocalPet(username, remote);
      set({ ...remote, username, loaded: true });
    } catch {
      set({ ...local, username, loaded: true });
    }
  },
  choose: (kind) => {
    const username = get().username;
    const next = { ...snapshot(get()), chosen: true, enabled: true, kind };
    set(next);
    persistPet(username, next);
  },
  disable: () => {
    const username = get().username;
    const next = { ...snapshot(get()), chosen: true, enabled: false };
    set(next);
    persistPet(username, next);
  },
  setMode: (mode) => {
    const username = get().username;
    const next = { ...snapshot(get()), mode };
    set(next);
    persistPet(username, next);
  },
  feed: () => {
    const username = get().username;
    const next = { ...snapshot(get()), commits: get().commits + 1 };
    set(next);
    persistPet(username, next);
  },
}));
