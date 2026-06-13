export type PublicSigningKey = {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  ext?: boolean;
  key_ops?: string[];
};

export type Participant = {
  id: string;
  name: string;
  joinedAt: string;
  signingPublicKey: PublicSigningKey;
};

export type MessageEnvelope = {
  id: string;
  roomId: string;
  senderId: string;
  keyVersion: number;
  chainId: string;
  messageIndex: number;
  chainKeyNonce: string;
  chainKeyCiphertext: string;
  nonce: string;
  ciphertext: string;
  signature: string;
  createdAt: string;
  expiresAt: string;
};

export type CreateRoomRequest = {
  participantName?: string;
  ttlMs?: number;
  signingPublicKey?: PublicSigningKey;
};

export type JoinRoomRequest = {
  participantName?: string;
  inviteToken?: string;
  signingPublicKey?: PublicSigningKey;
};

export type AddMessageRequest = {
  keyVersion?: number;
  chainId?: string;
  messageIndex?: number;
  chainKeyNonce?: string;
  chainKeyCiphertext?: string;
  nonce?: string;
  ciphertext?: string;
  signature?: string;
};

export type RoomSession = {
  roomId: string;
  participantId: string;
  sessionToken: string;
  expiresAt: string;
  participants: Participant[];
};

export type RoomState = {
  roomId: string;
  expiresAt: string;
  participants: Participant[];
  messages: MessageEnvelope[];
};

export type MikroTextOptions = {
  defaultTtlMs?: number;
  maxTtlMs?: number;
  now?: () => number;
};
