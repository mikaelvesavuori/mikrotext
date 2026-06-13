import { MikroText } from "./application/index.js";
import { startServer } from "./infrastructure/index.js";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "127.0.0.1";
const allowedDomains = (process.env.ALLOWED_DOMAINS || "*")
  .split(",")
  .map((domain) => domain.trim())
  .filter(Boolean);

startServer({
  text: new MikroText({
    defaultTtlMs: Number.parseInt(process.env.DEFAULT_TTL_MS || "", 10) || undefined,
    maxTtlMs: Number.parseInt(process.env.MAX_TTL_MS || "", 10) || undefined
  }),
  config: {
    port,
    host,
    allowedDomains,
    maxBodySize: 64 * 1024,
    rateLimit: {
      enabled: true,
      requestsPerMinute: 240
    }
  }
});
