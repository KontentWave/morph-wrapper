import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";

import { requireStaticBearerAuth } from "./auth.js";
import { loadConfig } from "./config.js";
import { RepoCacheService } from "./repo-cache.js";
import { SearchService } from "./search-service.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const repoCache = new RepoCacheService(config);
  const searchService = new SearchService(
    config.maxFileBytes,
    config.searchResultLimit,
  );

  const handler = createMcpHandler(
    () => createServer({ config, repoCache, searchService }),
    {
      responseMode: "json",
    },
  );

  const app =
    config.bindHost === "127.0.0.1"
      ? createMcpExpressApp()
      : createMcpExpressApp({
          host: config.bindHost,
          allowedHosts: config.allowedHosts,
          allowedOrigins: config.allowedOrigins,
        });

  const auth = requireStaticBearerAuth(config.authToken);
  const nodeHandler = toNodeHandler(handler);

  app.get("/healthz", (_request, response) => {
    response.json({ ok: true });
  });

  app.all("/mcp", auth, (request, response) => {
    void nodeHandler(request, response, request.body);
  });

  const server = app.listen(config.port, config.bindHost, () => {
    process.stdout.write(
      `Morph GitHub MCP wrapper listening on http://${config.bindHost}:${config.port}/mcp\n`,
    );
  });

  const shutdown = async () => {
    server.close();
    await handler.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main();
