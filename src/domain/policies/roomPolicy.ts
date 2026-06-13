export const DEFAULT_TTL_MS = 60 * 60 * 1000;
export const MIN_TTL_MS = 60 * 1000;
export const MAX_TTL_MS = 24 * 60 * 60 * 1000;

export const MAX_NAME_LENGTH = 48;
export const MAX_CIPHERTEXT_LENGTH = 32_768;
export const MAX_SIGNATURE_LENGTH = 512;
export const MAX_PARTICIPANTS_PER_ROOM = 16;
export const MAX_INVITES_PER_ROOM = 64;
export const MAX_MESSAGES_PER_ROOM = 1_000;
export const MAX_MESSAGES_PER_MINUTE = 120;
export const MAX_MESSAGES_PER_PARTICIPANT_PER_MINUTE = 40;
export const CURRENT_KEY_VERSION = 3;
export const MAX_CHAIN_ID_LENGTH = 128;
export const MAX_CHAIN_KEY_CIPHERTEXT_LENGTH = 512;

export const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
