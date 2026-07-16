import { MorphClient, type WarpGrepContext } from "@morphllm/morphsdk";

import { AppError } from "./errors.js";
import type { SearchMatch } from "./types.js";

export class SearchService {
  private readonly morphClient?: MorphClient;

  public constructor(
    morphApiKey: string | undefined,
    private readonly resultLimit: number,
  ) {
    if (morphApiKey) {
      this.morphClient = new MorphClient({ apiKey: morphApiKey });
    }
  }

  public async search(
    checkoutPath: string,
    query: string,
  ): Promise<SearchMatch[]> {
    if (!this.morphClient) {
      throw new AppError(
        "MORPH_API_KEY is required to execute codebase_search.",
        500,
      );
    }

    const result = await this.morphClient.warpGrep.execute({
      searchTerm: query,
      repoRoot: checkoutPath,
    });

    if (!result.success) {
      throw new AppError(result.error ?? "Morph WarpGrep search failed.", 502);
    }

    return (result.contexts ?? [])
      .map((context) => toSearchMatch(context))
      .slice(0, this.resultLimit);
  }
}

function toSearchMatch(context: WarpGrepContext): SearchMatch {
  const [startLine, endLine] = resolveLineRange(context);

  return {
    path: context.file,
    startLine,
    endLine,
    reason:
      context.lines === "*"
        ? "Morph WarpGrep returned the full file as relevant context."
        : `Morph WarpGrep returned ${Array.isArray(context.lines) ? context.lines.length : 0} relevant line range(s).`,
    confidence: context.lines === "*" ? "medium" : "high",
  };
}

function resolveLineRange(context: WarpGrepContext): [number, number] {
  if (context.lines === "*" || !context.lines || context.lines.length === 0) {
    const lineCount = context.content.split(/\r?\n/).length;
    return [1, Math.max(1, lineCount)];
  }

  const [firstRange] = context.lines;
  const lastRange = context.lines[context.lines.length - 1];
  return [firstRange[0], lastRange[1]];
}
