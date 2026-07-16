import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        clientId: string;
      };
    }
  }
}

export function requireStaticBearerAuth(expectedToken: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const header = request.header("authorization");

    if (!header?.startsWith("Bearer ")) {
      response.status(401).json({ error: "Missing bearer token." });
      return;
    }

    const providedToken = header.slice("Bearer ".length).trim();
    if (providedToken !== expectedToken) {
      response.status(403).json({ error: "Invalid bearer token." });
      return;
    }

    request.auth = {
      token: providedToken,
      clientId: "static-token-client",
      scopes: [],
    };
    next();
  };
}
