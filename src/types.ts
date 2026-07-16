export interface AllowedRepoConfig {
  repo: string;
  defaultBranch?: string;
  allowedBranches?: string[];
  description?: string;
}

export interface AppConfig {
  port: number;
  bindHost: string;
  authToken: string;
  morphApiKey?: string;
  githubToken?: string;
  repoCacheDir: string;
  allowedRepos: AllowedRepoConfig[];
  allowedHosts?: string[];
  allowedOrigins?: string[];
  maxFileBytes: number;
  searchResultLimit: number;
}

export interface ResolvedRepoTarget {
  config: AllowedRepoConfig;
  branch: string;
}

export interface RepoCheckout {
  repo: string;
  branch: string;
  checkoutPath: string;
}

export interface SearchMatch {
  path: string;
  startLine: number;
  endLine: number;
  reason: string;
  confidence: "low" | "medium" | "high";
}
