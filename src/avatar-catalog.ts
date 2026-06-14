export type SynraAvatarId = "classic" | "code1" | "battle" | "princess";

export interface SynraAvatarOption {
  id: SynraAvatarId;
  label: string;
  detail: string;
  url: string;
}

export const SYNRA_AVATARS: SynraAvatarOption[] = [
  {
    id: "classic",
    label: "Synra Classic",
    detail: "Original assistant model",
    url: "/avatars/synra.vrm"
  },
  {
    id: "code1",
    label: "Synra Code 1",
    detail: "Code-themed Synra model",
    url: "/avatars/synra-code1.vrm"
  },
  {
    id: "battle",
    label: "Synra Battle",
    detail: "Battle-ready Synra model",
    url: "/avatars/synra-battle.vrm"
  },
  {
    id: "princess",
    label: "Princess Synra",
    detail: "Royal alternate Synra avatar model",
    url: "/avatars/princess-synra.vrm"
  }
];

export const DEFAULT_SYNRA_AVATAR_ID: SynraAvatarId = "classic";

export function getSynraAvatar(id: string | null | undefined): SynraAvatarOption {
  return SYNRA_AVATARS.find((avatar) => avatar.id === id) ?? SYNRA_AVATARS.find((avatar) => avatar.id === DEFAULT_SYNRA_AVATAR_ID) ?? SYNRA_AVATARS[0];
}

export function isSynraAvatarId(id: string | null | undefined): id is SynraAvatarId {
  return SYNRA_AVATARS.some((avatar) => avatar.id === id);
}
