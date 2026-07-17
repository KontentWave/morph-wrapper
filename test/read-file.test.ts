import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  InMemoryTransport,
  LATEST_PROTOCOL_VERSION,
} from "@modelcontextprotocol/server";

import { createServer } from "../src/server.js";
import type { AppConfig, RepoCheckout, SearchMatch } from "../src/types.js";

function createConfig(repoCacheDir: string): AppConfig {
  return {
    port: 0,
    bindHost: "127.0.0.1",
    authToken: "secret-token",
    morphApiKey: undefined,
    githubToken: undefined,
    repoCacheDir,
    allowedRepos: [{ repo: "owner/repo", defaultBranch: "main" }],
    allowedHosts: undefined,
    allowedOrigins: undefined,
    maxFileBytes: 32,
    searchResultLimit: 10,
  };
}

async function withTestServer(
  checkout: RepoCheckout,
  callback: (helpers: {
    listTools: () => Promise<unknown>;
    callTool: (
      name: string,
      args?: Record<string, unknown>,
    ) => Promise<unknown>;
  }) => Promise<void>,
): Promise<void> {
  const config = createConfig(checkout.checkoutPath);
  const server = createServer({
    config,
    repoCache: {
      async ensureCheckout() {
        return checkout;
      },
      async getDefaultBranch() {
        return checkout.branch;
      },
    } as never,
    searchService: {
      async search(): Promise<SearchMatch[]> {
        return [];
      },
    } as never,
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const pending = new Map<
    number,
    {
      resolve: (message: {
        error?: { message?: string };
        result?: unknown;
      }) => void;
      reject: (error: Error) => void;
      timeoutId: NodeJS.Timeout;
    }
  >();

  clientTransport.onmessage = (message) => {
    if (!message || typeof message !== "object" || !("id" in message)) {
      return;
    }

    const id = (message as { id?: unknown }).id;

    if (typeof id !== "number") {
      return;
    }

    const entry = pending.get(id);

    if (!entry) {
      return;
    }

    clearTimeout(entry.timeoutId);
    pending.delete(id);
    entry.resolve(
      message as { error?: { message?: string }; result?: unknown },
    );
  };

  await server.connect(serverTransport);
  await clientTransport.start();

  let nextId = 1;
  const send = async (payload: {
    id: number;
    method: string;
    params: Record<string, unknown>;
  }) => {
    const response = await new Promise<{
      error?: { message?: string };
      result?: unknown;
    }>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pending.delete(payload.id);
        reject(
          new Error(`Timed out waiting for MCP response to ${payload.method}`),
        );
      }, 5_000);

      pending.set(payload.id, { resolve, reject, timeoutId });

      void clientTransport
        .send({
          jsonrpc: "2.0",
          id: payload.id,
          method: payload.method,
          params: payload.params,
        })
        .catch((error: unknown) => {
          clearTimeout(timeoutId);
          pending.delete(payload.id);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });

    return response;
  };

  try {
    const init = await send({
      jsonrpc: "2.0",
      id: nextId++,
      method: "initialize",
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "test-client", version: "0.0.0" },
      },
    });
    assert.ok(init.result);

    await clientTransport.send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });

    await callback({
      async listTools() {
        const response = await send({
          jsonrpc: "2.0",
          id: nextId++,
          method: "tools/list",
          params: {},
        });

        assert.ok(response.result);
        return response.result;
      },
      async callTool(name, args = {}) {
        const response = await send({
          jsonrpc: "2.0",
          id: nextId++,
          method: "tools/call",
          params: {
            name,
            arguments: args,
          },
        });

        if (response.error) {
          throw new Error(response.error.message ?? "Unknown MCP error");
        }

        assert.ok(response.result);
        return response.result;
      },
    });
  } finally {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timeoutId);
      entry.reject(new Error(`MCP session closed before response ${id}`));
      pending.delete(id);
    }
    await clientTransport.close();
    await server.close();
  }
}

function extractToolText(result: unknown): string {
  assert.ok(result && typeof result === "object");
  const content = (result as { content?: Array<{ text?: string }> }).content;
  assert.ok(Array.isArray(content));
  assert.equal(content.length, 1);
  assert.equal(typeof content[0]?.text, "string");
  return content[0].text as string;
}

function extractToolError(result: unknown): string {
  assert.ok(result && typeof result === "object");
  assert.equal((result as { isError?: boolean }).isError, true);
  return extractToolText(result);
}

test("tools/list exposes only the three read-only MCP tools", async () => {
  const checkoutPath = await mkdtemp(
    join(tmpdir(), "morph-wrapper-read-file-"),
  );
  const checkout = {
    repo: "owner/repo",
    branch: "main",
    checkoutPath,
  };

  await withTestServer(checkout, async ({ listTools }) => {
    const result = (await listTools()) as {
      tools?: Array<{ name: string }>;
    };

    assert.deepEqual(result.tools?.map((tool) => tool.name).sort(), [
      "codebase_search",
      "list_allowed_repos",
      "read_file",
    ]);
  });
});

test("read_file returns requested lines from a safe text file", async () => {
  const checkoutPath = await mkdtemp(
    join(tmpdir(), "morph-wrapper-read-file-"),
  );
  await mkdir(join(checkoutPath, "src"), { recursive: true });
  await writeFile(
    join(checkoutPath, "src", "index.ts"),
    "line one\nline two\nline three\n",
  );

  const checkout = {
    repo: "owner/repo",
    branch: "main",
    checkoutPath,
  };

  await withTestServer(checkout, async ({ callTool }) => {
    const result = await callTool("read_file", {
      repo: "owner/repo",
      branch: "main",
      path: "src/index.ts",
      start_line: 2,
      end_line: 3,
    });
    const payload = JSON.parse(extractToolText(result)) as {
      path: string;
      startLine: number;
      endLine: number;
      content: string;
    };

    assert.equal(payload.path, "src/index.ts");
    assert.equal(payload.startLine, 2);
    assert.equal(payload.endLine, 3);
    assert.equal(payload.content, "line two\nline three");
  });
});

test("read_file rejects secret-like, oversized, binary, and invalid-range requests", async () => {
  const checkoutPath = await mkdtemp(
    join(tmpdir(), "morph-wrapper-read-file-"),
  );
  await mkdir(join(checkoutPath, "config"), { recursive: true });
  await mkdir(join(checkoutPath, "bin"), { recursive: true });
  await writeFile(join(checkoutPath, "config", ".env"), "SECRET=value\n");
  await writeFile(
    join(checkoutPath, "large.txt"),
    "0123456789abcdefghijklmnopqrstuvwxyz\n",
  );
  await writeFile(
    join(checkoutPath, "bin", "artifact.dat"),
    Buffer.from([0x41, 0x00, 0x42]),
  );
  await writeFile(join(checkoutPath, "valid.txt"), "first\nsecond\nthird\n");

  const checkout = {
    repo: "owner/repo",
    branch: "main",
    checkoutPath,
  };

  await withTestServer(checkout, async ({ callTool }) => {
    assert.match(
      extractToolError(
        await callTool("read_file", {
          repo: "owner/repo",
          branch: "main",
          path: "config/.env",
        }),
      ),
      /blocked by path policy/,
    );

    assert.match(
      extractToolError(
        await callTool("read_file", {
          repo: "owner/repo",
          branch: "main",
          path: "large.txt",
        }),
      ),
      /exceeds 32 bytes/,
    );

    assert.match(
      extractToolError(
        await callTool("read_file", {
          repo: "owner/repo",
          branch: "main",
          path: "bin/artifact.dat",
        }),
      ),
      /appears to be binary/,
    );

    assert.match(
      extractToolError(
        await callTool("read_file", {
          repo: "owner/repo",
          branch: "main",
          path: "valid.txt",
          start_line: 3,
          end_line: 1,
        }),
      ),
      /Invalid line range requested/,
    );
  });
});
