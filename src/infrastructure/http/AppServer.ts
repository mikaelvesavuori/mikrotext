import { type Context, type HandlerResponse, type MikroServeOptions, MikroServe } from "mikroserve";

import { MikroText } from "../../application/index.js";
import { MikroTextError } from "../../domain/index.js";

type StartServerOptions = {
  config?: MikroServeOptions;
  text?: MikroText;
};

export function startServer(options: StartServerOptions = {}) {
  const text = options.text || new MikroText();
  const server = new MikroServe(options.config);

  server.use(async (_c: Context, next: () => Promise<HandlerResponse>) => {
    const response = await next();

    return {
      ...response,
      headers: {
        "Cache-Control": "no-store",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        "Referrer-Policy": "no-referrer",
        ...response.headers,
      },
    };
  });

  server.get("/health", async (c: Context) => c.text("OK", 200));

  server.post("/rooms", async (c: Context) => toResponse(c, () => text.createRoom(c.body), 201));

  server.post("/rooms/:roomId/invites", async (c: Context) =>
    toResponse(c, () => text.createInvite(c.params.roomId, getBearerToken(c), c.body.inviteToken)),
  );

  server.post("/rooms/:roomId/join", async (c: Context) =>
    toResponse(c, () => text.joinRoom(c.params.roomId, c.body), 201),
  );

  server.get("/rooms/:roomId/state", async (c: Context) =>
    toResponse(c, () =>
      text.getState(c.params.roomId, getBearerToken(c), c.query.after || undefined),
    ),
  );

  server.post("/rooms/:roomId/messages", async (c: Context) =>
    toResponse(
      c,
      () => ({
        message: text.addMessage(c.params.roomId, getBearerToken(c), c.body),
      }),
      201,
    ),
  );

  server.post("/rooms/:roomId/burn", async (c: Context) =>
    toResponse(c, () => text.burnRoom(c.params.roomId, getBearerToken(c))),
  );

  return server.start();
}

function getBearerToken(c: Context) {
  const authorization = c.headers.authorization || "";
  if (Array.isArray(authorization)) return "";
  if (!authorization.startsWith("Bearer ")) return "";

  return authorization.slice("Bearer ".length).trim();
}

function toResponse(c: Context, action: () => any, status = 200) {
  try {
    return c.json(action(), status);
  } catch (error) {
    if (error instanceof MikroTextError)
      return c.json({ error: error.message, code: error.code }, error.status);

    console.error("MikroText API error:", error);
    return c.json({ error: "Internal Server Error", code: "INTERNAL_SERVER_ERROR" }, 500);
  }
}
