import type { MessageEnvelope, Participant } from "../../interfaces/MikroText.js";

export type StoredParticipant = Participant & {
  sessionTokenHash: string;
};

export type Invite = {
  id: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
};

export type Room = {
  id: string;
  createdAt: string;
  expiresAt: string;
  ttlMs: number;
  participants: Map<string, StoredParticipant>;
  invites: Map<string, Invite>;
  messages: MessageEnvelope[];
  messageTimestamps: number[];
  participantMessageTimestamps: Map<string, number[]>;
  messageDigests: Set<string>;
};

export function getPublicParticipants(room: Room): Participant[] {
  return [...room.participants.values()].map(({ sessionTokenHash: _sessionTokenHash, ...rest }) => ({
    ...rest,
  }));
}
