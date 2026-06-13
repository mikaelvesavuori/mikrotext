import { describe, expect, test } from "vitest";

import {
  createMessageDigest,
  CURRENT_KEY_VERSION,
  MikroTextError,
  normalizeMessageFields,
} from "../../src/domain/index.js";
import type { MessageEnvelope } from "../../src/interfaces/MikroText.js";

const message = {
  keyVersion: 3,
  chainId: "chainABC123_-",
  messageIndex: 7,
  chainKeyNonce: "keyNonceABC123_-",
  chainKeyCiphertext: "keyCiphertextABC123_-",
  nonce: "nonceABC123_-",
  ciphertext: "encryptedPayloadABC123_-",
  signature: "validSignatureABC123_-",
};

describe("message envelopes", () => {
  test("normalizes the intended v3 message key fields", () => {
    expect(normalizeMessageFields(message)).toEqual({
      keyVersion: CURRENT_KEY_VERSION,
      chainId: message.chainId,
      messageIndex: message.messageIndex,
      chainKeyNonce: message.chainKeyNonce,
      chainKeyCiphertext: message.chainKeyCiphertext,
    });
  });

  test("rejects unsupported message versions and invalid message indexes", () => {
    for (const request of [
      { ...message, keyVersion: 2 },
      { ...message, keyVersion: undefined },
      { ...message, messageIndex: -1 },
      { ...message, messageIndex: 1.5 },
      { ...message, messageIndex: Number.MAX_SAFE_INTEGER + 1 },
      { ...message, messageIndex: undefined },
    ]) {
      expect(() => normalizeMessageFields(request)).toThrow(MikroTextError);
    }
  });

  test("rejects missing, invalid, or oversized chain checkpoint fields", () => {
    for (const request of [
      { ...message, chainId: "" },
      { ...message, chainId: "a".repeat(129) },
      { ...message, chainId: "bad/value" },
      { ...message, chainKeyNonce: "" },
      { ...message, chainKeyCiphertext: "a".repeat(513) },
    ]) {
      expect(() => normalizeMessageFields(request)).toThrow(MikroTextError);
    }
  });

  test("creates stable digests for identical encrypted envelopes", () => {
    const first = createMessageDigest("sender-1", envelope(message));
    const second = createMessageDigest("sender-1", envelope(message));

    expect(first).toBe(second);
  });

  test("changes the digest when sender or signed envelope fields change", () => {
    const base = createMessageDigest("sender-1", envelope(message));
    const variants = [
      createMessageDigest("sender-2", envelope(message)),
      createMessageDigest("sender-1", envelope({ ...message, messageIndex: 8 })),
      createMessageDigest("sender-1", envelope({ ...message, nonce: "nonceDEF456_-" })),
      createMessageDigest("sender-1", envelope({ ...message, signature: "otherSignature123_-" })),
    ];

    expect(new Set(variants)).not.toContain(base);
  });
});

function envelope(input: typeof message): Pick<
  MessageEnvelope,
  | "keyVersion"
  | "chainId"
  | "messageIndex"
  | "chainKeyNonce"
  | "chainKeyCiphertext"
  | "nonce"
  | "ciphertext"
  | "signature"
> {
  return input;
}
