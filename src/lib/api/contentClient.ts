export interface ContentEnvelope<TPayload> {
  key: string;
  category: string;
  payload: TPayload;
  version: number;
  updatedAt: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8080";

interface FetchByKeyOptions<TPayload> {
  fallbackPayload?: TPayload;
  fallbackCategory?: string;
}

export async function fetchContentByKey<TPayload>(
  key: string,
  options: FetchByKeyOptions<TPayload> = {},
): Promise<ContentEnvelope<TPayload>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/content/${key}`);

    if (!response.ok) {
      throw new Error(`Unable to load content key "${key}" (${response.status})`);
    }

    return (await response.json()) as ContentEnvelope<TPayload>;
  } catch (error) {
    if (options.fallbackPayload !== undefined) {
      return {
        key,
        category: options.fallbackCategory ?? "fallback",
        payload: options.fallbackPayload,
        version: 0,
        updatedAt: new Date(0).toISOString(),
      };
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(`Unable to load content key "${key}"`);
  }
}
