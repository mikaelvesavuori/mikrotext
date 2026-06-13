# MikroText

**Short-lived encrypted text rooms with no accounts and no server-readable messages.**

![MikroText product view](./mikrotext.png)

MikroText is a small private messaging app for temporary conversations. Create a room, share a one-time invite, exchange text, and let the room expire.

It is useful when a full chat product is too much and an account flow would get in the way.

_Use MikroText online at [text.mikrosuite.com](https://text.mikrosuite.com)._

## What MikroText Includes

- **Short-lived rooms**: rooms expire automatically and can be burned manually.
- **No accounts**: participants use random local names for each room session.
- **One-time invites**: invite links are consumed once and carry the room key in the URL fragment.
- **End-to-end encryption**: messages are encrypted in the browser before they reach the relay.
- **Signed messages**: browser-generated signing keys help clients verify message envelopes.
- **Safety code**: participants can compare a room code through another channel.
- **Small deployment surface**: static browser app, Node relay, and in-memory room state.

## Features

- No accounts, profiles, organizations, or passwords
- Random local participant names
- One-time invite URLs with room keys in URL fragments
- Browser-side AES-GCM message encryption
- Browser-generated ECDSA signing keys for message authentication
- Per-sender message key evolution for encrypted envelopes
- Signed ciphertext relay with TTL cleanup
- Safety code for out-of-band comparison
- Manual room burn
- Static frontend and small Node API

## Quick Start

Requires Node.js 24 or newer.

```bash
npm install
npm run dev
```

The API runs on `http://127.0.0.1:3000`.
The app runs on `http://127.0.0.1:8000`.

## Release Downloads

The latest release archives are available from GitHub Releases and these stable URLs:

- `https://releases.mikrosuite.com/mikrotext_app_latest.zip` - static browser app
- `https://releases.mikrosuite.com/mikrotext_api_latest.zip` - Node API bundle

## Configuration

MikroText keeps configuration intentionally small.

The browser app reads `config.json` at startup:

```json
{
  "apiBaseUrl": "http://127.0.0.1:3000",
  "debugMode": false,
  "maxMessageLength": 1000,
  "pollIntervalMs": 2500,
  "defaultTtlMs": 3600000
}
```

For the hosted app, build with `CF_PAGES=1` or set `MIKROTEXT_PUBLIC_API_BASE_URL=https://text-api.mikrosuite.com`. The build writes that API origin to `dist/config.json` and allows it in the generated `_headers` CSP.

The API reads deployment settings from environment variables:

- `HOST` - bind host, default `127.0.0.1`
- `PORT` - bind port, default `3000`
- `ALLOWED_DOMAINS` - comma-separated CORS origins, default `*`
- `DEFAULT_TTL_MS` - default room lifetime
- `MAX_TTL_MS` - maximum accepted room lifetime

## API

- `GET /health` returns service health
- `POST /rooms` creates a room and joins the creator
- `POST /rooms/:roomId/invites` creates a one-time invite
- `POST /rooms/:roomId/join` consumes a one-time invite
- `GET /rooms/:roomId/state` returns room state and encrypted messages
- `POST /rooms/:roomId/messages` relays a signed encrypted message envelope
- `POST /rooms/:roomId/burn` burns the room immediately

See the API reference in the docs site for payload shapes.

## Documentation

Full documentation is available at **[mikrosuite.com/text/docs](https://mikrosuite.com/text/docs)**:

- [Introduction](https://mikrosuite.com/text/docs/getting-started/intro) - What is MikroText?
- [Installation](https://mikrosuite.com/text/docs/getting-started/installation) - Get up and running
- [Configuration](https://mikrosuite.com/text/docs/guides/configuration) - Runtime and deployment settings
- [Security Model](https://mikrosuite.com/text/docs/guides/security-model) - What MikroText protects
- [Deployment](https://mikrosuite.com/text/docs/guides/deployment) - Production deployment guide
- [API Reference](https://mikrosuite.com/text/docs/reference/api) - HTTP API endpoints

## Security Model

MikroText keeps message plaintext away from the relay server when the deployed browser app is trusted. The relay receives ciphertext, signatures, public signing keys, and operational metadata. It does not receive room keys, participant signing private keys, sender chain keys, or plaintext messages.

MikroText does not protect against compromised devices, malicious browser code served by a compromised host, invite forwarding, screenshots, copied messages, IP and timing metadata, or participants leaking room keys. It is not a Signal replacement and does not claim Signal-grade forward secrecy.

See the [Security Model](https://mikrosuite.com/text/docs/guides/security-model) for the full boundary.

## Technology

- **Frontend**: Vanilla HTML, CSS, and JavaScript compiled with esbuild
- **Backend**: TypeScript with MikroServe
- **Crypto**: Web Crypto AES-GCM and ECDSA P-256 in the browser
- **Storage**: In-memory server state for short-lived rooms
- **Docs**: Astro Starlight
- **Tests**: Vitest

## License

MIT.
