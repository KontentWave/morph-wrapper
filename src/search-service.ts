import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { AppError } from "./errors.js";
import type { SearchMatch } from "./types.js";

const execFile = promisify(execFileCallback);
const DEFAULT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const MAX_HIT_SCORE = 12;
const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "code",
  "file",
  "files",
  "find",
  "for",
  "from",
  "in",
  "list",
  "of",
  "or",
  "repo",
  "repository",
  "search",
  "show",
  "that",
  "the",
  "this",
  "to",
  "using",
  "what",
  "where",
  "which",
  "with",
]);
const TEST_PATH_SEGMENTS = new Set(["test", "tests", "__tests__", "spec"]);
const IMPLEMENTATION_PATH_SEGMENTS = new Set([
  "app",
  "class",
  "classes",
  "include",
  "includes",
  "js",
  "lib",
  "src",
  "template",
  "templates",
]);
const GENERIC_HELPER_FILENAMES = new Set([
  "bootstrap.php",
  "common.js",
  "common.ts",
  "function.inc.php",
  "functions.inc.php",
  "helper.js",
  "helper.php",
  "helper.ts",
  "helpers.js",
  "helpers.php",
  "helpers.ts",
  "index.js",
  "index.ts",
  "util.js",
  "util.ts",
  "utils.js",
  "utils.ts",
]);

interface RipgrepJsonMatch {
  type: "match";
  data: {
    path?: { text?: string };
    lines?: { text?: string };
    line_number?: number;
  };
}

interface CandidateMatch {
  path: string;
  lineNumbers: number[];
  matchedTerms: Set<string>;
  totalHits: number;
}

interface SearchProvider {
  search(
    checkoutPath: string,
    pattern: string,
    searchTerms: string[],
  ): Promise<Map<string, CandidateMatch>>;
}

class RipgrepSearchProvider implements SearchProvider {
  public async search(
    checkoutPath: string,
    pattern: string,
    searchTerms: string[],
  ): Promise<Map<string, CandidateMatch>> {
    if (!pattern) {
      return new Map();
    }

    try {
      const { stdout } = await execFile(
        "rg",
        [
          "--json",
          "--line-number",
          "--smart-case",
          "--glob",
          "!node_modules",
          "--glob",
          "!.git",
          pattern,
          ".",
        ],
        {
          cwd: checkoutPath,
          maxBuffer: DEFAULT_MAX_BUFFER_BYTES,
        },
      );

      return collectMatches(stdout, searchTerms);
    } catch (error) {
      const execError = error as NodeJS.ErrnoException & {
        stdout?: string | Buffer;
        stderr?: string | Buffer;
        code?: number | string;
      };
      const exitCode =
        typeof execError.code === "number" ? execError.code : undefined;

      if (exitCode === 1) {
        const stdout = stringifyExecOutput(execError.stdout);
        return collectMatches(stdout, searchTerms);
      }

      if (execError.code === "ENOENT") {
        throw new AppError(
          "ripgrep (rg) is required to execute codebase_search.",
          500,
        );
      }

      throw new AppError(
        `Local codebase_search failed: ${stringifyExecOutput(execError.stderr) || execError.message}`,
        502,
      );
    }
  }
}

export class SearchService {
  public constructor(
    private readonly resultLimit: number,
    private readonly provider: SearchProvider = new RipgrepSearchProvider(),
  ) {}

  public async search(
    checkoutPath: string,
    query: string,
  ): Promise<SearchMatch[]> {
    const searchTerms = extractSearchTerms(query);
    const pattern = buildPattern(searchTerms);
    const candidates = await this.provider.search(
      checkoutPath,
      pattern,
      searchTerms,
    );

    return [...candidates.values()]
      .sort(compareCandidates)
      .slice(0, this.resultLimit)
      .map((candidate) => toSearchMatch(candidate, searchTerms.length));
  }
}

function extractSearchTerms(query: string): string[] {
  const quotedTerms = [...query.matchAll(/"([^"]+)"|'([^']+)'/g)]
    .map((match) => (match[1] ?? match[2] ?? "").trim().toLowerCase())
    .filter(Boolean);

  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !QUERY_STOP_WORDS.has(token));

  const deduped = new Set<string>([...quotedTerms, ...tokens]);
  if (deduped.size > 0) {
    return [...deduped];
  }

  const trimmed = query.trim().toLowerCase();
  return trimmed ? [trimmed] : [];
}

function buildPattern(searchTerms: string[]): string {
  const escapedTerms = searchTerms.map(escapeRipgrepPattern);
  return escapedTerms.join("|");
}

function collectMatches(
  stdout: string,
  searchTerms: string[],
): Map<string, CandidateMatch> {
  const candidates = new Map<string, CandidateMatch>();

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const event = JSON.parse(line) as { type?: string; data?: unknown };
    if (event.type !== "match") {
      continue;
    }

    const match = event as RipgrepJsonMatch;
    const path = normalizePath(match.data.path?.text);
    const lineNumber = match.data.line_number;

    if (!path || typeof lineNumber !== "number") {
      continue;
    }

    const lineText = match.data.lines?.text ?? "";
    const candidate = candidates.get(path) ?? {
      path,
      lineNumbers: [],
      matchedTerms: new Set<string>(),
      totalHits: 0,
    };

    candidate.lineNumbers.push(lineNumber);
    candidate.totalHits += 1;

    for (const searchTerm of searchTerms) {
      if (lineText.toLowerCase().includes(searchTerm)) {
        candidate.matchedTerms.add(searchTerm);
      }
    }

    candidates.set(path, candidate);
  }

  return candidates;
}

function compareCandidates(
  left: CandidateMatch,
  right: CandidateMatch,
): number {
  const scoreDelta = scoreCandidate(right) - scoreCandidate(left);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const pathDelta = left.path.localeCompare(right.path);
  if (pathDelta !== 0) {
    return pathDelta;
  }

  return Math.min(...left.lineNumbers) - Math.min(...right.lineNumbers);
}

function scoreCandidate(candidate: CandidateMatch): number {
  const pathLower = candidate.path.toLowerCase();
  const basename = pathLower.split("/").pop() ?? pathLower;

  return (
    candidate.matchedTerms.size * 10 +
    Math.min(candidate.totalHits, MAX_HIT_SCORE) +
    resolvePathMatchScore(pathLower, basename, candidate) -
    resolvePathPenalty(pathLower, basename) +
    resolveImplementationBonus(pathLower, basename)
  );
}

function resolvePathMatchScore(
  pathLower: string,
  basename: string,
  candidate: CandidateMatch,
): number {
  let score = 0;

  for (const term of candidate.matchedTerms) {
    if (basename.includes(term)) {
      score += 5;
      continue;
    }

    if (pathLower.includes(term)) {
      score += 2;
    }
  }

  if (score > 0 && !isTestPath(pathLower)) {
    score += 2;
  }

  return score;
}

function resolvePathPenalty(pathLower: string, basename: string): number {
  let penalty = 0;

  if (isTestPath(pathLower)) {
    penalty += 16;
  }

  if (GENERIC_HELPER_FILENAMES.has(basename)) {
    penalty += 6;
  }

  return penalty;
}

function resolveImplementationBonus(
  pathLower: string,
  basename: string,
): number {
  if (isTestPath(pathLower) || GENERIC_HELPER_FILENAMES.has(basename)) {
    return 0;
  }

  const segments = pathLower.split("/");
  if (segments.some((segment) => IMPLEMENTATION_PATH_SEGMENTS.has(segment))) {
    return 4;
  }

  return 0;
}

function isTestPath(pathLower: string): boolean {
  const segments = pathLower.split("/");
  return segments.some((segment) => {
    if (TEST_PATH_SEGMENTS.has(segment)) {
      return true;
    }

    return /(^|[._-])(test|spec)([._-]|$)/.test(segment);
  });
}

function toSearchMatch(
  candidate: CandidateMatch,
  queryTermCount: number,
): SearchMatch {
  const [startLine, endLine] = resolveLineRange(candidate);
  const matchedTermCount = candidate.matchedTerms.size;

  return {
    path: candidate.path,
    startLine,
    endLine,
    reason: `Matched ${matchedTermCount} query term(s) across ${candidate.totalHits} relevant line(s).`,
    confidence: resolveConfidence(matchedTermCount, queryTermCount, candidate),
  };
}

function resolveLineRange(candidate: CandidateMatch): [number, number] {
  const sortedLines = [...candidate.lineNumbers].sort(
    (left, right) => left - right,
  );

  if (sortedLines.length === 0) {
    return [1, 1];
  }

  return [sortedLines[0], sortedLines[sortedLines.length - 1]];
}

function resolveConfidence(
  matchedTermCount: number,
  queryTermCount: number,
  candidate: CandidateMatch,
): SearchMatch["confidence"] {
  if (matchedTermCount >= 2 || matchedTermCount === queryTermCount) {
    return "high";
  }

  if (candidate.totalHits >= 2 || matchedTermCount >= 1) {
    return "medium";
  }

  return "low";
}

function escapeRipgrepPattern(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePath(path: string | undefined): string | undefined {
  return path?.replace(/\\/g, "/").replace(/^\.\//, "");
}

function stringifyExecOutput(output: string | Buffer | undefined): string {
  if (!output) {
    return "";
  }

  return Buffer.isBuffer(output) ? output.toString("utf8") : output;
}
