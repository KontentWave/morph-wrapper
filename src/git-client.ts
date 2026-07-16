import { spawn } from "node:child_process";

import { AppError } from "./errors.js";

export interface GitClientOptions {
  githubToken?: string;
}

export class GitClient {
  public constructor(private readonly options: GitClientOptions) {}

  public async run(args: string[], cwd?: string): Promise<string> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    };

    if (this.options.githubToken) {
      env.GIT_CONFIG_COUNT = "1";
      env.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
      env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: bearer ${this.options.githubToken}`;
    }

    return new Promise((resolve, reject) => {
      const child = spawn("git", args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(new AppError(`Failed to start git: ${error.message}`, 500));
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
          return;
        }

        reject(
          new AppError(
            `Git command failed: ${stderr.trim() || stdout.trim() || args.join(" ")}`,
            500,
          ),
        );
      });
    });
  }
}
