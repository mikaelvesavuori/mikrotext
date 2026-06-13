const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SIGNING_KEY_ALGORITHM = {
  name: "ECDSA",
  namedCurve: "P-256"
};
const SIGNING_ALGORITHM = {
  name: "ECDSA",
  hash: "SHA-256"
};
const CURRENT_KEY_VERSION = 3;

export function generateRoomKey() {
  return randomBase64Url(32);
}

export function generateToken() {
  return randomBase64Url(32);
}

export function createRatchetState() {
  return {
    sendChainId: generateToken(),
    sendChainKey: generateRoomKey(),
    sendMessageIndex: 0
  };
}

export async function importRoomKey(keyString) {
  const keyBytes = base64UrlToBytes(keyString);
  if (keyBytes.byteLength !== 32) throw new Error("Invalid room key");

  return window.crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt"
  ]);
}

export async function generateSigningKeys() {
  const pair = await window.crypto.subtle.generateKey(SIGNING_KEY_ALGORITHM, true, [
    "sign",
    "verify"
  ]);
  const signingPublicKey = normalizePublicSigningKey(
    await window.crypto.subtle.exportKey("jwk", pair.publicKey)
  );
  const signingPrivateKey = await window.crypto.subtle.exportKey("jwk", pair.privateKey);

  return {
    signingPublicKey,
    signingPrivateKey,
    signingPrivateCryptoKey: pair.privateKey
  };
}

export async function importSigningPrivateKey(signingPrivateKey) {
  return window.crypto.subtle.importKey(
    "jwk",
    signingPrivateKey,
    SIGNING_KEY_ALGORITHM,
    true,
    ["sign"]
  );
}

export async function encryptTextMessage(room, text) {
  ensureRatchetState(room);

  const nonce = window.crypto.getRandomValues(new Uint8Array(12));
  const messageIndex = room.sendMessageIndex;
  const chainKey = room.sendChainKey;
  const messageKey = await deriveMessageKey({
    chainKey,
    roomId: room.roomId,
    senderId: room.participantId,
    chainId: room.sendChainId,
    messageIndex
  });
  const plaintext = encoder.encode(
    JSON.stringify({
      v: CURRENT_KEY_VERSION,
      text,
      sentAt: new Date().toISOString()
    })
  );
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: ratchetAssociatedData(
        room.roomId,
        room.participantId,
        room.sendChainId,
        messageIndex
      )
    },
    messageKey,
    plaintext
  );
  const chainKeyCheckpoint = await encryptChainKeyCheckpoint(room, chainKey, messageIndex);
  const nonceValue = bytesToBase64Url(nonce);
  const ciphertext = bytesToBase64Url(new Uint8Array(encrypted));
  const envelope = {
    keyVersion: CURRENT_KEY_VERSION,
    chainId: room.sendChainId,
    messageIndex,
    ...chainKeyCheckpoint,
    nonce: nonceValue,
    ciphertext
  };
  const signature = await signEnvelope(room, envelope);

  room.sendChainKey = bytesToBase64Url(await advanceChainKey(base64UrlToBytes(chainKey)));
  room.sendMessageIndex = messageIndex + 1;

  return {
    ...envelope,
    signature
  };
}

export async function decryptEnvelope(room, envelope) {
  const isVerified = await verifyEnvelopeSignature(room, envelope);
  if (!isVerified) throw new Error("Message signature failed");

  if (envelope.keyVersion !== CURRENT_KEY_VERSION) throw new Error("Unsupported message version");

  const messageKey = await deriveMessageKeyFromEnvelope(room, envelope);
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(envelope.nonce),
      additionalData: ratchetAssociatedData(
        room.roomId,
        envelope.senderId,
        envelope.chainId,
        envelope.messageIndex
      )
    },
    messageKey,
    base64UrlToBytes(envelope.ciphertext)
  );

  return JSON.parse(decoder.decode(decrypted));
}

export async function roomSafetyCode(keyString, participants = []) {
  const participantKeys = participants
    .map((participant) => participant.signingPublicKey)
    .filter(Boolean)
    .map(publicSigningKeyInput)
    .sort();
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    encoder.encode(
      JSON.stringify({
        v: 2,
        key: keyString,
        participantKeys
      })
    )
  );
  return formatCode(new Uint8Array(digest).slice(0, 6));
}

export async function participantFingerprint(signingPublicKey) {
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    encoder.encode(publicSigningKeyInput(signingPublicKey))
  );
  return formatCode(new Uint8Array(digest).slice(0, 4));
}

async function signEnvelope(room, envelope) {
  const signature = await window.crypto.subtle.sign(
    SIGNING_ALGORITHM,
    room.signingPrivateCryptoKey,
    envelopeSigningInput(room.roomId, room.participantId, envelope)
  );

  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifyEnvelopeSignature(room, envelope) {
  const participant = room.participants?.find((entry) => entry.id === envelope.senderId);
  if (!participant?.signingPublicKey || !envelope.signature) return false;

  const signingPublicKey = await window.crypto.subtle.importKey(
    "jwk",
    participant.signingPublicKey,
    SIGNING_KEY_ALGORITHM,
    true,
    ["verify"]
  );

  return window.crypto.subtle.verify(
    SIGNING_ALGORITHM,
    signingPublicKey,
    base64UrlToBytes(envelope.signature),
    envelopeSigningInput(room.roomId, envelope.senderId, envelope)
  );
}

function envelopeSigningInput(roomId, senderId, envelope) {
  return encoder.encode(
    JSON.stringify({
      v: CURRENT_KEY_VERSION,
      roomId,
      senderId,
      keyVersion: CURRENT_KEY_VERSION,
      chainId: envelope.chainId,
      messageIndex: envelope.messageIndex,
      chainKeyNonce: envelope.chainKeyNonce,
      chainKeyCiphertext: envelope.chainKeyCiphertext,
      nonce: envelope.nonce,
      ciphertext: envelope.ciphertext
    })
  );
}

async function encryptChainKeyCheckpoint(room, chainKey, messageIndex) {
  const nonce = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: chainKeyAssociatedData(
        room.roomId,
        room.participantId,
        room.sendChainId,
        messageIndex
      )
    },
    room.cryptoKey,
    encoder.encode(chainKey)
  );

  return {
    chainKeyNonce: bytesToBase64Url(nonce),
    chainKeyCiphertext: bytesToBase64Url(new Uint8Array(encrypted))
  };
}

async function decryptChainKeyCheckpoint(room, envelope) {
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(envelope.chainKeyNonce),
      additionalData: chainKeyAssociatedData(
        room.roomId,
        envelope.senderId,
        envelope.chainId,
        envelope.messageIndex
      )
    },
    room.cryptoKey,
    base64UrlToBytes(envelope.chainKeyCiphertext)
  );
  const chainKey = decoder.decode(decrypted);
  if (base64UrlToBytes(chainKey).byteLength !== 32) throw new Error("Invalid message key");

  return chainKey;
}

async function deriveMessageKeyFromEnvelope(room, envelope) {
  const chainKey = await decryptChainKeyCheckpoint(room, envelope);
  return deriveMessageKey({
    chainKey,
    roomId: room.roomId,
    senderId: envelope.senderId,
    chainId: envelope.chainId,
    messageIndex: envelope.messageIndex
  });
}

async function deriveMessageKey({ chainKey, roomId, senderId, chainId, messageIndex }) {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(chainKey),
    "HKDF",
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(`MikroText:v3:${roomId}:${senderId}:${chainId}:${messageIndex}`),
      info: encoder.encode("MikroText message key")
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function advanceChainKey(chainKeyBytes) {
  const label = encoder.encode("MikroText chain key v3");
  const input = new Uint8Array(label.byteLength + chainKeyBytes.byteLength);
  input.set(label, 0);
  input.set(chainKeyBytes, label.byteLength);

  return new Uint8Array(await window.crypto.subtle.digest("SHA-256", input));
}

function ratchetAssociatedData(roomId, senderId, chainId, messageIndex) {
  return encoder.encode(`MikroText:v3:${roomId}:${senderId}:${chainId}:${messageIndex}`);
}

function chainKeyAssociatedData(roomId, senderId, chainId, messageIndex) {
  return encoder.encode(`MikroText:chain:v3:${roomId}:${senderId}:${chainId}:${messageIndex}`);
}

function ensureRatchetState(room) {
  if (!room.sendChainId) room.sendChainId = generateToken();
  if (!room.sendChainKey) room.sendChainKey = generateRoomKey();
  if (!Number.isInteger(room.sendMessageIndex) || room.sendMessageIndex < 0)
    room.sendMessageIndex = 0;
}

function normalizePublicSigningKey(key) {
  return {
    kty: "EC",
    crv: "P-256",
    x: key.x,
    y: key.y,
    ext: true,
    key_ops: ["verify"]
  };
}

function publicSigningKeyInput(key) {
  return `EC:P-256:${key.x}:${key.y}`;
}

function formatCode(bytes) {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${hex.slice(0, 4)} ${hex.slice(4, 8)} ${hex.slice(8, 12)}`.trim();
}

function randomBase64Url(length) {
  return bytesToBase64Url(window.crypto.getRandomValues(new Uint8Array(length)));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
