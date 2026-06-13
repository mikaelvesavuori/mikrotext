import { createHash } from "node:crypto";

import type { AddMessageRequest, MessageEnvelope } from "../../interfaces/MikroText.js";
import { MikroTextError } from "../errors/MikroTextError.js";
import {
  CURRENT_KEY_VERSION,
  MAX_CHAIN_ID_LENGTH,
  MAX_CHAIN_KEY_CIPHERTEXT_LENGTH,
} from "../policies/roomPolicy.js";
import { assertBase64Url } from "./roomValidation.js";

export type NormalizedMessageFields = Pick<
  MessageEnvelope,
  "keyVersion" | "chainId" | "messageIndex" | "chainKeyNonce" | "chainKeyCiphertext"
>;

export function normalizeMessageFields(request: AddMessageRequest): NormalizedMessageFields {
  if (request.keyVersion !== CURRENT_KEY_VERSION)
    throw new MikroTextError("Message key version is unsupported");

  const messageIndex = request.messageIndex;
  if (
    typeof messageIndex !== "number" ||
    !Number.isInteger(messageIndex) ||
    messageIndex < 0 ||
    messageIndex > Number.MAX_SAFE_INTEGER
  ) {
    throw new MikroTextError("Message index is invalid");
  }

  return {
    keyVersion: CURRENT_KEY_VERSION,
    chainId: assertBase64Url(request.chainId, "Chain ID", MAX_CHAIN_ID_LENGTH),
    messageIndex,
    chainKeyNonce: assertBase64Url(request.chainKeyNonce, "Chain key nonce", 256),
    chainKeyCiphertext: assertBase64Url(
      request.chainKeyCiphertext,
      "Chain key ciphertext",
      MAX_CHAIN_KEY_CIPHERTEXT_LENGTH,
    ),
  };
}

export function createMessageDigest(
  senderId: string,
  message: Pick<
    MessageEnvelope,
    | "keyVersion"
    | "chainId"
    | "messageIndex"
    | "chainKeyNonce"
    | "chainKeyCiphertext"
    | "nonce"
    | "ciphertext"
    | "signature"
  >,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        senderId,
        keyVersion: message.keyVersion,
        chainId: message.chainId,
        messageIndex: message.messageIndex,
        chainKeyNonce: message.chainKeyNonce,
        chainKeyCiphertext: message.chainKeyCiphertext,
        nonce: message.nonce,
        ciphertext: message.ciphertext,
        signature: message.signature,
      }),
    )
    .digest("base64url");
}
