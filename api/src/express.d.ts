// What the API hangs on each Express request: the signed-in subject (set by
// requireAuth) and the id that ties a log line and an error envelope to a
// request (set in app.ts). Ambient, so every entry point sees it, including
// one-off scripts type-checked on their own.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { subject: string };
      requestId?: string;
    }
  }
}

export {};
