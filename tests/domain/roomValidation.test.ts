import { describe, expect, test } from "vitest";

import {
  assertBase64Url,
  assertPublicSigningKey,
  assertSecret,
  MikroTextError,
  sanitizeParticipantName,
} from "../../src/domain/index.js";
import type { PublicSigningKey } from "../../src/interfaces/MikroText.js";

describe("room validation", () => {
  test("normalizes participant names", () => {
    expect(sanitizeParticipantName("  Clear   River   60  ")).toBe("Clear River 60");
    expect(sanitizeParticipantName("")).toBe("Unknown Guest");
    expect(sanitizeParticipantName(undefined)).toBe("Unknown Guest");
    expect(sanitizeParticipantName("a".repeat(80))).toHaveLength(48);
  });

  test("accepts base64url secrets in the configured length range", () => {
    expect(assertSecret("abcdefghijklmnopqrstuvwxyzABCDEF", "Invite token")).toBe(
      "abcdefghijklmnopqrstuvwxyzABCDEF",
    );
  });

  test("rejects missing, short, long, and non-base64url secrets", () => {
    for (const value of [undefined, "", "short", "a".repeat(257), "bad+secret"]) {
      expect(() => assertSecret(value, "Invite token")).toThrow(MikroTextError);
    }
  });

  test("accepts bounded base64url envelope fields", () => {
    expect(assertBase64Url("abcDEF123_-", "Nonce", 32)).toBe("abcDEF123_-");
  });

  test("rejects missing, oversized, and invalid envelope fields", () => {
    for (const value of [undefined, "", "a".repeat(33), "abc/def"]) {
      expect(() => assertBase64Url(value, "Nonce", 32)).toThrow(MikroTextError);
    }
  });

  test("normalizes public signing keys to the allowed JWK surface", () => {
    const normalized = assertPublicSigningKey({
      ...key("a", "b"),
      ext: false,
      key_ops: ["sign", "verify"],
    });

    expect(normalized).toEqual({
      kty: "EC",
      crv: "P-256",
      x: "a".repeat(43),
      y: "b".repeat(43),
      ext: true,
      key_ops: ["verify"],
    });
  });

  test("rejects unsupported public signing keys", () => {
    const valid = key("a", "b");
    const invalidKeys = [
      undefined,
      { ...valid, kty: "RSA" },
      { ...valid, crv: "P-384" },
      { ...valid, x: "too-short" },
      { ...valid, y: "bad/value" },
    ];

    for (const invalidKey of invalidKeys) {
      expect(() => assertPublicSigningKey(invalidKey as PublicSigningKey | undefined)).toThrow(
        MikroTextError,
      );
    }
  });
});

function key(x: string, y: string): PublicSigningKey {
  return {
    kty: "EC",
    crv: "P-256",
    x: x.repeat(43),
    y: y.repeat(43),
  };
}
