import type { PublicSigningKey } from "../../interfaces/MikroText.js";
import { MikroTextError } from "../errors/MikroTextError.js";
import { BASE64URL_PATTERN, MAX_NAME_LENGTH } from "../policies/roomPolicy.js";

export function sanitizeParticipantName(participantName: string | undefined) {
  const name = `${participantName || ""}`.trim().replace(/\s+/g, " ");
  if (!name) return "Unknown Guest";

  return name.slice(0, MAX_NAME_LENGTH);
}

export function assertSecret(value: string | undefined, label: string) {
  if (!value || typeof value !== "string") throw new MikroTextError(`${label} is required`);
  if (value.length < 16) throw new MikroTextError(`${label} is too short`);
  if (value.length > 256) throw new MikroTextError(`${label} is too long`);
  if (!BASE64URL_PATTERN.test(value)) throw new MikroTextError(`${label} is invalid`);

  return value;
}

export function assertBase64Url(value: string | undefined, label: string, maxLength: number) {
  if (!value || typeof value !== "string") throw new MikroTextError(`${label} is required`);
  if (value.length > maxLength) throw new MikroTextError(`${label} is too large`, 413, "TOO_LARGE");
  if (!BASE64URL_PATTERN.test(value)) throw new MikroTextError(`${label} is invalid`);

  return value;
}

export function assertPublicSigningKey(value: PublicSigningKey | undefined): PublicSigningKey {
  if (!value || typeof value !== "object") throw new MikroTextError("Signing public key is required");
  if (value.kty !== "EC" || value.crv !== "P-256")
    throw new MikroTextError("Signing public key is invalid");
  if (!isP256Coordinate(value.x) || !isP256Coordinate(value.y))
    throw new MikroTextError("Signing public key is invalid");

  return {
    kty: "EC",
    crv: "P-256",
    x: value.x,
    y: value.y,
    ext: true,
    key_ops: ["verify"],
  };
}

function isP256Coordinate(value: unknown) {
  return (
    typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 64 &&
    BASE64URL_PATTERN.test(value)
  );
}
