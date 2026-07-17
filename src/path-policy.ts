import { stat } from "node:fs/promises";
import { posix, resolve } from "node:path";

import { AppError } from "./errors.js";

const blockedNamePatterns = [
  /(^|\/)\.env(\..+)?$/i,
  /(^|\/)\.envrc$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|\/).+\.(pem|key|p12|pfx)$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.git-credentials$/i,
  /(^|\/).+\.(sqlite|db|dump|bak)$/i,
  /(^|\/)terraform\.tfstate(\..+)?$/i,
  /(^|\/)(secrets?|credentials?)(\.|\/|$)/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.aws\/credentials$/i,
  /(^|\/)\.kube\/config$/i,
];

export function normalizeSafeRelativePath(inputPath: string): string {
  const trimmed = inputPath.trim();

  if (!trimmed) {
    throw new AppError("File path is required.", 400);
  }

  if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    throw new AppError("Absolute paths are not allowed.", 400);
  }

  const normalized = posix.normalize(trimmed.replaceAll("\\", "/"));

  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new AppError("Path traversal is not allowed.", 400);
  }

  if (blockedNamePatterns.some((pattern) => pattern.test(normalized))) {
    throw new AppError(
      `Access to ${inputPath} is blocked by path policy.`,
      403,
    );
  }

  return normalized.replace(/^\.\//, "");
}

export async function resolveReadableFile(
  checkoutPath: string,
  relativePath: string,
  maxFileBytes: number,
): Promise<string> {
  const absolutePath = resolve(checkoutPath, relativePath);
  const checkoutRoot = resolve(checkoutPath) + "/";

  if (
    !absolutePath.startsWith(checkoutRoot) &&
    absolutePath !== resolve(checkoutPath)
  ) {
    throw new AppError(
      "Resolved file path escapes the repository checkout.",
      400,
    );
  }

  const fileStat = await stat(absolutePath);

  if (!fileStat.isFile()) {
    throw new AppError("Requested path is not a file.", 400);
  }

  if (fileStat.size > maxFileBytes) {
    throw new AppError(`Requested file exceeds ${maxFileBytes} bytes.`, 413);
  }

  return absolutePath;
}

export function isBinaryBuffer(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 8_000);

  for (let index = 0; index < sampleSize; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }

  return false;
}
