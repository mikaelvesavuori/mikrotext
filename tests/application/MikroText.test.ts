import { describe, expect, test } from "vitest";

import { MikroText } from "../../src/application/index.js";
import { MikroTextError } from "../../src/domain/index.js";
import type { PublicSigningKey } from "../../src/interfaces/MikroText.js";

const inviteToken = "abcdefghijklmnopqrstuvwxyzABCDEF";
const signingPublicKey = key("a", "b");
const secondSigningPublicKey = key("c", "d");
const message = {
  keyVersion: 3,
  chainId: "chainABC123_-",
  messageIndex: 0,
  chainKeyNonce: "keyNonceABC123_-",
  chainKeyCiphertext: "keyCiphertextABC123_-",
  nonce: "nonceABC123_-",
  ciphertext: "encryptedPayloadABC123_-",
  signature: "validSignatureABC123_-"
};

describe("MikroText", () => {
  test("creates a room without requiring account data", () => {
    const text = new MikroText();
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });

    expect(room.roomId).toBeTruthy();
    expect(room.sessionToken).toBeTruthy();
    expect(room.participants).toEqual([
      expect.objectContaining({
        id: room.participantId,
        name: "Grey Moose 53",
        signingPublicKey
      })
    ]);
  });

  test("normalizes participant names and clamps room TTLs", () => {
    const now = Date.parse("2026-06-12T10:00:00.000Z");
    const text = new MikroText({ now: () => now });

    const room = text.createRoom({
      participantName: "  Grey   Moose   53  ",
      ttlMs: 1,
      signingPublicKey
    });
    const longRoom = text.createRoom({
      participantName: "Blue Pine 19",
      ttlMs: 999_999_999,
      signingPublicKey: secondSigningPublicKey
    });

    expect(room.participants[0]?.name).toBe("Grey Moose 53");
    expect(room.expiresAt).toBe(new Date(now + 60_000).toISOString());
    expect(longRoom.expiresAt).toBe(new Date(now + 24 * 60 * 60 * 1000).toISOString());
  });

  test("rejects non-finite TTL values", () => {
    const text = new MikroText();

    expect(() =>
      text.createRoom({
        ttlMs: Number.NaN,
        signingPublicKey
      })
    ).toThrow(MikroTextError);
  });

  test("joins a room with a one-time invite", () => {
    const text = new MikroText();
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });
    text.createInvite(room.roomId, room.sessionToken, inviteToken);

    const joined = text.joinRoom(room.roomId, {
      participantName: "Blue Pine 19",
      inviteToken,
      signingPublicKey: secondSigningPublicKey
    });

    expect(joined.participants.map((participant) => participant.name)).toEqual([
      "Grey Moose 53",
      "Blue Pine 19"
    ]);

    expect(() =>
      text.joinRoom(room.roomId, {
        participantName: "Red Stone 77",
        inviteToken,
        signingPublicKey: key("e", "f")
      })
    ).toThrow(MikroTextError);
  });

  test("requires a current participant session to create invites and relay messages", () => {
    const text = new MikroText();
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });

    expect(() => text.createInvite(room.roomId, "not-valid", inviteToken)).toThrow(MikroTextError);
    expect(() => text.addMessage(room.roomId, "not-valid", message)).toThrow(MikroTextError);
  });

  test("rejects duplicate invite tokens and caps invites per room", () => {
    const text = new MikroText();
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });

    text.createInvite(room.roomId, room.sessionToken, inviteToken);
    expect(() => text.createInvite(room.roomId, room.sessionToken, inviteToken)).toThrow(
      MikroTextError
    );

    for (let index = 1; index < 64; index += 1) {
      text.createInvite(room.roomId, room.sessionToken, tokenAt(index));
    }

    expect(() => text.createInvite(room.roomId, room.sessionToken, tokenAt(64))).toThrow(
      MikroTextError
    );
  });

  test("caps participants per room", () => {
    const text = new MikroText();
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });

    for (let index = 1; index < 16; index += 1) {
      const token = tokenAt(index);
      text.createInvite(room.roomId, room.sessionToken, token);
      text.joinRoom(room.roomId, {
        participantName: `Guest ${index}`,
        inviteToken: token,
        signingPublicKey: keyAt(index)
      });
    }

    const overflowToken = tokenAt(16);
    text.createInvite(room.roomId, room.sessionToken, overflowToken);

    expect(() =>
      text.joinRoom(room.roomId, {
        participantName: "Guest 16",
        inviteToken: overflowToken,
        signingPublicKey: keyAt(16)
      })
    ).toThrow(MikroTextError);
  });

  test("requires signing keys and message signatures", () => {
    const text = new MikroText();

    expect(() => text.createRoom({ participantName: "Grey Moose 53" })).toThrow(MikroTextError);

    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });

    expect(() => text.addMessage(room.roomId, room.sessionToken, incompleteMessage())).toThrow(
      MikroTextError
    );
  });

  test("stores encrypted message envelopes without plaintext", () => {
    const text = new MikroText();
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });
    const stored = text.addMessage(room.roomId, room.sessionToken, message);
    const state = text.getState(room.roomId, room.sessionToken);

    expect(state.messages).toEqual([stored]);
    expect(JSON.stringify(state)).not.toContain("hello");
    expect(state.messages[0]?.ciphertext).toBe(message.ciphertext);
    expect(state.messages[0]?.signature).toBe(message.signature);
    expect(state.messages[0]?.senderId).toBe(room.participantId);
  });

  test("relays v3 message metadata without decrypting it", () => {
    const text = new MikroText();
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });
    const stored = text.addMessage(room.roomId, room.sessionToken, message);

    expect(stored).toEqual(expect.objectContaining(message));
    expect(text.getState(room.roomId, room.sessionToken).messages[0]).toEqual(
      expect.objectContaining({
        keyVersion: 3,
        chainId: message.chainId,
        messageIndex: 0,
        chainKeyNonce: message.chainKeyNonce,
        chainKeyCiphertext: message.chainKeyCiphertext
      })
    );
  });

  test("returns only messages after the requested message ID", () => {
    const text = new MikroText();
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });
    const first = text.addMessage(room.roomId, room.sessionToken, messageAt(1));
    const second = text.addMessage(room.roomId, room.sessionToken, messageAt(2));
    const third = text.addMessage(room.roomId, room.sessionToken, messageAt(3));

    expect(text.getState(room.roomId, room.sessionToken, first.id).messages).toEqual([
      second,
      third
    ]);
  });

  test("rejects incomplete message envelopes", () => {
    const text = new MikroText();
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });

    expect(() => text.addMessage(room.roomId, room.sessionToken, incompleteMessage())).toThrow(
      MikroTextError
    );
  });

  test("rejects duplicate encrypted envelopes", () => {
    const text = new MikroText();
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });

    text.addMessage(room.roomId, room.sessionToken, message);

    expect(() => text.addMessage(room.roomId, room.sessionToken, message)).toThrow(MikroTextError);
  });

  test("rejects oversized ciphertext envelopes", () => {
    const text = new MikroText();
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });

    expect(() =>
      text.addMessage(room.roomId, room.sessionToken, {
        ...message,
        ciphertext: "a".repeat(32_769)
      })
    ).toThrow(MikroTextError);
  });

  test("rate limits a noisy participant", () => {
    let now = Date.parse("2026-06-12T10:00:00.000Z");
    const text = new MikroText({ now: () => now });
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });

    for (let index = 0; index < 40; index += 1) {
      text.addMessage(room.roomId, room.sessionToken, messageAt(index));
    }

    expect(() => text.addMessage(room.roomId, room.sessionToken, messageAt(40))).toThrow(
      MikroTextError
    );

    now += 60_001;

    expect(text.addMessage(room.roomId, room.sessionToken, messageAt(41))).toEqual(
      expect.objectContaining({
        ciphertext: "encryptedPayload41"
      })
    );
  });

  test("rate limits a noisy room across participants", () => {
    let now = Date.parse("2026-06-12T10:00:00.000Z");
    const text = new MikroText({ now: () => now });
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });
    const sessions = [room];

    for (let index = 1; index < 16; index += 1) {
      const token = tokenAt(index);
      text.createInvite(room.roomId, room.sessionToken, token);
      sessions.push(
        text.joinRoom(room.roomId, {
          participantName: `Guest ${index}`,
          inviteToken: token,
          signingPublicKey: keyAt(index)
        })
      );
    }

    let messageIndex = 0;
    for (const session of sessions) {
      for (let count = 0; count < 7; count += 1) {
        text.addMessage(room.roomId, session.sessionToken, messageAt(messageIndex));
        messageIndex += 1;
      }
    }
    for (let index = 0; index < 8; index += 1) {
      text.addMessage(room.roomId, sessions[index]?.sessionToken || "", messageAt(messageIndex));
      messageIndex += 1;
    }

    expect(() =>
      text.addMessage(room.roomId, sessions[8]?.sessionToken || "", messageAt(messageIndex))
    ).toThrow(MikroTextError);

    now += 60_001;

    expect(text.addMessage(room.roomId, room.sessionToken, messageAt(messageIndex + 1))).toEqual(
      expect.objectContaining({ senderId: room.participantId })
    );
  });

  test("burns a room immediately", () => {
    const text = new MikroText();
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      signingPublicKey
    });

    expect(text.burnRoom(room.roomId, room.sessionToken)).toEqual({ success: true });
    expect(() => text.getState(room.roomId, room.sessionToken)).toThrow(MikroTextError);
  });

  test("expires rooms after their TTL", () => {
    let now = Date.parse("2026-06-12T10:00:00.000Z");
    const text = new MikroText({ now: () => now });
    const room = text.createRoom({
      participantName: "Grey Moose 53",
      ttlMs: 60_000,
      signingPublicKey
    });

    now += 60_001;

    expect(() => text.getState(room.roomId, room.sessionToken)).toThrow(MikroTextError);
  });

  test("cleans up expired rooms while keeping active rooms available", () => {
    let now = Date.parse("2026-06-12T10:00:00.000Z");
    const text = new MikroText({ now: () => now });
    const expired = text.createRoom({
      participantName: "Grey Moose 53",
      ttlMs: 60_000,
      signingPublicKey
    });
    const active = text.createRoom({
      participantName: "Blue Pine 19",
      ttlMs: 120_000,
      signingPublicKey: secondSigningPublicKey
    });

    now += 60_001;
    text.cleanupExpired();

    expect(() => text.getState(expired.roomId, expired.sessionToken)).toThrow(MikroTextError);
    expect(text.getState(active.roomId, active.sessionToken).roomId).toBe(active.roomId);
  });
});

function messageAt(index: number) {
  return {
    keyVersion: 3,
    chainId: "chainABC123_-",
    messageIndex: index,
    chainKeyNonce: `keyNonce${index}`,
    chainKeyCiphertext: `keyCiphertext${index}`,
    nonce: `nonce${index}`,
    ciphertext: `encryptedPayload${index}`,
    signature: `validSignature${index}`
  };
}

function incompleteMessage() {
  return {
    nonce: "incompleteNonce123_-",
    ciphertext: "incompleteCiphertext123_-",
    signature: "incompleteSignature123_-"
  };
}

function tokenAt(index: number) {
  return `invite${String(index).padStart(2, "0")}${"a".repeat(24)}`;
}

function keyAt(index: number): PublicSigningKey {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
  return key(alphabet[index % alphabet.length] || "a", alphabet[(index + 1) % alphabet.length] || "b");
}

function key(x: string, y: string): PublicSigningKey {
  return {
    kty: "EC",
    crv: "P-256",
    x: x.repeat(43),
    y: y.repeat(43),
    ext: true,
    key_ops: ["verify"]
  };
}
