import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { MikroText } from "../../src/application/index.js";
import { startServer } from "../../src/infrastructure/index.js";
import type { PublicSigningKey } from "../../src/interfaces/MikroText.js";

const signingPublicKey = key("a", "b");
const servers: Server[] = [];

describe("AppServer", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(closeServer));
    vi.restoreAllMocks();
  });

  test("serves health with relay-safe headers", async () => {
    const { baseUrl } = await startTestServer();
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  test("relays v3 encrypted envelopes through HTTP", async () => {
    const { baseUrl } = await startTestServer();
    const room = await postJson(`${baseUrl}/rooms`, {
      participantName: "Grey Moose 53",
      signingPublicKey,
    });

    const response = await postJson(
      `${baseUrl}/rooms/${room.roomId}/messages`,
      {
        keyVersion: 3,
        chainId: "chainABC123_-",
        messageIndex: 0,
        chainKeyNonce: "keyNonceABC123_-",
        chainKeyCiphertext: "keyCiphertextABC123_-",
        nonce: "nonceABC123_-",
        ciphertext: "encryptedPayloadABC123_-",
        signature: "validSignatureABC123_-",
      },
      room.sessionToken,
    );
    const state = await getJson(`${baseUrl}/rooms/${room.roomId}/state`, room.sessionToken);

    expect(response.message).toEqual(
      expect.objectContaining({
        roomId: room.roomId,
        senderId: room.participantId,
        keyVersion: 3,
        ciphertext: "encryptedPayloadABC123_-",
      }),
    );
    expect(state.messages).toHaveLength(1);
  });

  test("maps domain errors to JSON responses", async () => {
    const { baseUrl } = await startTestServer();
    const response = await fetch(`${baseUrl}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantName: "No Key" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Signing public key is required",
      code: "BAD_REQUEST",
    });
  });
});

async function startTestServer() {
  const server = startServer({
    text: new MikroText(),
    config: {
      host: "127.0.0.1",
      port: 0,
      allowedDomains: ["*"],
      rateLimit: {
        enabled: false,
        requestsPerMinute: 1_000,
      },
    },
  }) as Server;
  servers.push(server);

  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function postJson(url: string, body: unknown, token?: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  expect(response.ok).toBe(true);
  return response.json();
}

async function getJson(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(response.ok).toBe(true);
  return response.json();
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function key(x: string, y: string): PublicSigningKey {
  return {
    kty: "EC",
    crv: "P-256",
    x: x.repeat(43),
    y: y.repeat(43),
  };
}
