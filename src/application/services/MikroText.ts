import {
  assertBase64Url,
  assertPublicSigningKey,
  assertSecret,
  createMessageDigest,
  DEFAULT_TTL_MS,
  getPublicParticipants,
  MAX_CIPHERTEXT_LENGTH,
  MAX_INVITES_PER_ROOM,
  MAX_MESSAGES_PER_MINUTE,
  MAX_MESSAGES_PER_PARTICIPANT_PER_MINUTE,
  MAX_MESSAGES_PER_ROOM,
  MAX_PARTICIPANTS_PER_ROOM,
  MAX_SIGNATURE_LENGTH,
  MAX_TTL_MS,
  MikroTextError,
  MIN_TTL_MS,
  normalizeMessageFields,
  sanitizeParticipantName,
  type Invite,
  type Room,
  type StoredParticipant,
} from "../../domain/index.js";
import type {
  AddMessageRequest,
  CreateRoomRequest,
  JoinRoomRequest,
  MessageEnvelope,
  MikroTextOptions,
  PublicSigningKey,
  RoomSession,
  RoomState,
} from "../../interfaces/MikroText.js";
import { clamp } from "../../shared/math.js";
import { constantTimeEqual, createId, createSecret, hashSecret } from "../../shared/secrets.js";
import { toIso } from "../../shared/time.js";

/**
 * @description Application service for the in-memory encrypted-room relay.
 */
export class MikroText {
  private readonly rooms = new Map<string, Room>();
  private readonly defaultTtlMs: number;
  private readonly maxTtlMs: number;
  private readonly now: () => number;

  constructor(options: MikroTextOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs || DEFAULT_TTL_MS;
    this.maxTtlMs = options.maxTtlMs || MAX_TTL_MS;
    this.now = options.now || Date.now;
  }

  public createRoom(request: CreateRoomRequest = {}): RoomSession {
    this.cleanupExpired();

    const now = this.now();
    const ttlMs = this.resolveTtl(request.ttlMs);
    const roomId = createId();
    const createdAt = toIso(now);
    const expiresAt = toIso(now + ttlMs);
    const participant = this.createParticipant(
      request.participantName,
      request.signingPublicKey,
      now,
    );

    const room: Room = {
      id: roomId,
      createdAt,
      expiresAt,
      ttlMs,
      participants: new Map([[participant.publicParticipant.id, participant.storedParticipant]]),
      invites: new Map(),
      messages: [],
      messageTimestamps: [],
      participantMessageTimestamps: new Map(),
      messageDigests: new Set(),
    };

    this.rooms.set(roomId, room);

    return {
      roomId,
      participantId: participant.publicParticipant.id,
      sessionToken: participant.sessionToken,
      expiresAt,
      participants: [participant.publicParticipant],
    };
  }

  public createInvite(roomId: string, sessionToken: string, inviteToken: string) {
    const room = this.authorize(roomId, sessionToken);
    const cleanInviteToken = assertSecret(inviteToken, "Invite token");
    const tokenHash = hashSecret(cleanInviteToken);
    if (room.invites.size >= MAX_INVITES_PER_ROOM)
      throw new MikroTextError("Too many invites", 429, "TOO_MANY_INVITES");

    for (const invite of room.invites.values()) {
      if (constantTimeEqual(invite.tokenHash, tokenHash))
        throw new MikroTextError("Invite token already exists", 409, "INVITE_EXISTS");
    }

    const now = this.now();
    const invite = {
      id: createId(),
      tokenHash,
      createdAt: toIso(now),
      expiresAt: room.expiresAt,
    };

    room.invites.set(invite.id, invite);

    return {
      inviteId: invite.id,
      expiresAt: invite.expiresAt,
    };
  }

  public joinRoom(roomId: string, request: JoinRoomRequest = {}): RoomSession {
    this.cleanupExpired();

    const room = this.getActiveRoom(roomId);
    if (room.participants.size >= MAX_PARTICIPANTS_PER_ROOM)
      throw new MikroTextError("Room is full", 409, "ROOM_FULL");

    const inviteToken = assertSecret(request.inviteToken, "Invite token");
    const invite = this.getUsableInvite(room, inviteToken);
    const now = this.now();
    const participant = this.createParticipant(
      request.participantName,
      request.signingPublicKey,
      now,
    );

    invite.usedAt = toIso(now);
    room.participants.set(participant.publicParticipant.id, participant.storedParticipant);

    return {
      roomId: room.id,
      participantId: participant.publicParticipant.id,
      sessionToken: participant.sessionToken,
      expiresAt: room.expiresAt,
      participants: getPublicParticipants(room),
    };
  }

  public getState(roomId: string, sessionToken: string, afterMessageId?: string): RoomState {
    const room = this.authorize(roomId, sessionToken);
    this.removeExpiredMessages(room);

    const afterIndex = afterMessageId
      ? room.messages.findIndex((message) => message.id === afterMessageId)
      : -1;
    const messages = afterIndex >= 0 ? room.messages.slice(afterIndex + 1) : room.messages;

    return {
      roomId: room.id,
      expiresAt: room.expiresAt,
      participants: getPublicParticipants(room),
      messages,
    };
  }

  public addMessage(
    roomId: string,
    sessionToken: string,
    request: AddMessageRequest = {},
  ): MessageEnvelope {
    const room = this.authorize(roomId, sessionToken);
    const participant = this.findParticipantBySessionToken(room, sessionToken);
    if (!participant) throw new MikroTextError("Unauthorized", 401, "UNAUTHORIZED");

    const messageFields = normalizeMessageFields(request);
    const nonce = assertBase64Url(request.nonce, "Nonce", 256);
    const ciphertext = assertBase64Url(request.ciphertext, "Ciphertext", MAX_CIPHERTEXT_LENGTH);
    const signature = assertBase64Url(request.signature, "Signature", MAX_SIGNATURE_LENGTH);
    const now = this.now();
    this.assertMessageRate(room, participant.id, now);

    const digest = createMessageDigest(participant.id, {
      ...messageFields,
      nonce,
      ciphertext,
      signature,
    });
    if (room.messageDigests.has(digest))
      throw new MikroTextError("Message already relayed", 409, "MESSAGE_REPLAYED");

    const message = {
      id: createId(),
      roomId: room.id,
      senderId: participant.id,
      ...messageFields,
      nonce,
      ciphertext,
      signature,
      createdAt: toIso(now),
      expiresAt: toIso(Math.min(Date.parse(room.expiresAt), now + room.ttlMs)),
    };

    if (room.messages.length >= MAX_MESSAGES_PER_ROOM) {
      const removed = room.messages.shift();
      if (removed) room.messageDigests.delete(createMessageDigest(removed.senderId, removed));
    }
    room.messages.push(message);
    room.messageDigests.add(digest);
    room.messageTimestamps.push(now);
    room.participantMessageTimestamps.set(participant.id, [
      ...(room.participantMessageTimestamps.get(participant.id) || []),
      now,
    ]);

    return message;
  }

  public burnRoom(roomId: string, sessionToken: string) {
    this.authorize(roomId, sessionToken);
    this.rooms.delete(roomId);

    return { success: true };
  }

  public cleanupExpired() {
    const now = this.now();

    for (const [roomId, room] of this.rooms) {
      if (Date.parse(room.expiresAt) <= now) {
        this.rooms.delete(roomId);
        continue;
      }

      this.removeExpiredMessages(room);
    }
  }

  private authorize(roomId: string, sessionToken: string): Room {
    this.cleanupExpired();

    const cleanSessionToken = assertSecret(sessionToken, "Session token");
    const room = this.getActiveRoom(roomId);
    const participant = this.findParticipantBySessionToken(room, cleanSessionToken);

    if (!participant) throw new MikroTextError("Unauthorized", 401, "UNAUTHORIZED");

    return room;
  }

  private getActiveRoom(roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new MikroTextError("Room not found", 404, "ROOM_NOT_FOUND");
    if (Date.parse(room.expiresAt) <= this.now()) {
      this.rooms.delete(roomId);
      throw new MikroTextError("Room expired", 410, "ROOM_EXPIRED");
    }

    return room;
  }

  private getUsableInvite(room: Room, inviteToken: string): Invite {
    const tokenHash = hashSecret(inviteToken);

    for (const invite of room.invites.values()) {
      if (!constantTimeEqual(invite.tokenHash, tokenHash)) continue;
      if (invite.usedAt) throw new MikroTextError("Invite already used", 410, "INVITE_USED");
      if (Date.parse(invite.expiresAt) <= this.now())
        throw new MikroTextError("Invite expired", 410, "INVITE_EXPIRED");

      return invite;
    }

    throw new MikroTextError("Invite not found", 404, "INVITE_NOT_FOUND");
  }

  private createParticipant(
    participantName: string | undefined,
    signingPublicKey: PublicSigningKey | undefined,
    now: number,
  ) {
    const publicParticipant = {
      id: createId(),
      name: sanitizeParticipantName(participantName),
      joinedAt: toIso(now),
      signingPublicKey: assertPublicSigningKey(signingPublicKey),
    };
    const sessionToken = createSecret();

    return {
      publicParticipant,
      sessionToken,
      storedParticipant: {
        ...publicParticipant,
        sessionTokenHash: hashSecret(sessionToken),
      },
    };
  }

  private findParticipantBySessionToken(room: Room, sessionToken: string): StoredParticipant | null {
    const sessionTokenHash = hashSecret(sessionToken);

    for (const participant of room.participants.values()) {
      if (constantTimeEqual(participant.sessionTokenHash, sessionTokenHash)) return participant;
    }

    return null;
  }

  private resolveTtl(ttlMs: number | undefined) {
    if (ttlMs === undefined || ttlMs === null)
      return clamp(this.defaultTtlMs, MIN_TTL_MS, this.maxTtlMs);
    if (!Number.isFinite(ttlMs)) throw new MikroTextError("TTL must be a number");

    return clamp(Math.trunc(ttlMs), MIN_TTL_MS, this.maxTtlMs);
  }

  private removeExpiredMessages(room: Room) {
    const now = this.now();
    room.messages = room.messages.filter((message) => Date.parse(message.expiresAt) > now);
    room.messageDigests = new Set(
      room.messages.map((message) => createMessageDigest(message.senderId, message)),
    );
  }

  private assertMessageRate(room: Room, participantId: string, now: number) {
    const since = now - 60_000;
    room.messageTimestamps = room.messageTimestamps.filter((timestamp) => timestamp > since);
    const participantTimestamps = (room.participantMessageTimestamps.get(participantId) || []).filter(
      (timestamp) => timestamp > since,
    );
    room.participantMessageTimestamps.set(participantId, participantTimestamps);

    if (room.messageTimestamps.length >= MAX_MESSAGES_PER_MINUTE)
      throw new MikroTextError("Too many messages", 429, "TOO_MANY_MESSAGES");
    if (participantTimestamps.length >= MAX_MESSAGES_PER_PARTICIPANT_PER_MINUTE)
      throw new MikroTextError("Too many messages", 429, "TOO_MANY_MESSAGES");
  }
}
