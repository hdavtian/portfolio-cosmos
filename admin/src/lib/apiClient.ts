// The admin is served from the same origin as the API (portfolio-admin
// hostname in production, the Vite proxy in development), so requests use
// relative paths and the hd_session cookie travels as a first-party cookie.
export interface ApiErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  // Declared explicitly rather than as constructor parameter properties: the
  // admin compiles with erasableSyntaxOnly, which forbids syntax that cannot
  // be stripped without emitting runtime code.
  public readonly status: number;
  public readonly code: string;
  public readonly details: ApiErrorDetail[];
  public readonly requestId?: string;

  public constructor(
    status: number,
    code: string,
    message: string,
    details: ApiErrorDetail[] = [],
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Field errors keyed by form field, for the dialog validators. */
  public get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((detail) => [detail.path, detail.message]));
  }

  public get isUnauthorized(): boolean {
    return this.status === 401;
  }

  public get isConflict(): boolean {
    return this.status === 409;
  }
}

const parseError = async (response: Response): Promise<ApiError> => {
  let code = "ERROR";
  let message = response.statusText || "Request failed";
  let details: ApiErrorDetail[] = [];
  let requestId: string | undefined;

  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: ApiErrorDetail[]; requestId?: string };
    };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details ?? [];
      requestId = body.error.requestId;
    }
  } catch {
    // Non-JSON error (proxy or gateway); keep the status text.
  }

  return new ApiError(response.status, code, message, details, requestId);
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
};

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
};
