import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { SearchMatch } from "./types.js";
import { isBinaryBuffer, normalizeSafeRelativePath } from "./path-policy.js";

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
]);

export class SearchService {
  public constructor(
    private readonly maxFileBytes: number,
    private readonly resultLimit: number,
  ) {}

  public async search(
    checkoutPath: string,
    query: string,
  ): Promise<SearchMatch[]> {
    const terms = tokenizeQuery(query);
    if (terms.length === 0) {
      return [];
    }

    const candidates: SearchMatch[] = [];
    await this.walk(checkoutPath, checkoutPath, terms, candidates);

    return candidates.sort(compareMatches).slice(0, this.resultLimit);
  }

  private async walk(
    rootPath: string,
    currentPath: string,
    terms: string[],
    matches: SearchMatch[],
  ): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await this.walk(
            rootPath,
            join(currentPath, entry.name),
            terms,
            matches,
          );
        }
        continue;
      }

      const filePath = join(currentPath, entry.name);
      const relativePath = relative(rootPath, filePath).replaceAll("\\", "/");

      try {
        normalizeSafeRelativePath(relativePath);
      } catch {
        continue;
      }

      const buffer = await readFile(filePath);
      if (buffer.length > this.maxFileBytes || isBinaryBuffer(buffer)) {
        continue;
      }

      const text = buffer.toString("utf8");
      const lines = text.split(/\r?\n/);
      const evaluation = scoreFile(lines, terms);

      if (evaluation) {
        matches.push({
          path: relativePath,
          startLine: evaluation.startLine,
          endLine: evaluation.endLine,
          reason: evaluation.reason,
          confidence: evaluation.confidence,
        });
      }
    }
  }
}

function tokenizeQuery(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9_/-]+/)
        .filter((term) => term.length >= 3),
    ),
  ].slice(0, 8);
}

function scoreFile(
  lines: string[],
  terms: string[],
): {
  startLine: number;
  endLine: number;
  reason: string;
  confidence: "low" | "medium" | "high";
  score: number;
} | null {
  let matchedTerms = 0;
  let firstMatchLine = -1;
  let totalHits = 0;

  for (const term of terms) {
    const lineIndex = lines.findIndex((line) =>
      line.toLowerCase().includes(term),
    );
    if (lineIndex >= 0) {
      matchedTerms += 1;
      totalHits += countOccurrences(lines, term);
      if (firstMatchLine === -1 || lineIndex < firstMatchLine) {
        firstMatchLine = lineIndex;
      }
    }
  }

  if (matchedTerms === 0 || firstMatchLine === -1) {
    return null;
  }

  const startLine = firstMatchLine + 1;
  const endLine = Math.min(lines.length, firstMatchLine + 3);
  const confidence =
    matchedTerms >= Math.min(4, terms.length)
      ? "high"
      : matchedTerms >= 2
        ? "medium"
        : "low";
  const score = matchedTerms * 100 + totalHits;

  return {
    startLine,
    endLine,
    reason: `Matched ${matchedTerms} query term(s); first hit on line ${startLine}.`,
    confidence,
    score,
  };
}

function countOccurrences(lines: string[], term: string): number {
  let total = 0;
  for (const line of lines) {
    if (line.toLowerCase().includes(term)) {
      total += 1;
    }
  }
  return total;
}

function compareMatches(left: SearchMatch, right: SearchMatch): number {
  const confidenceScore = { high: 3, medium: 2, low: 1 };
  const confidenceDelta =
    confidenceScore[right.confidence] - confidenceScore[left.confidence];
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  return left.path.localeCompare(right.path);
}
