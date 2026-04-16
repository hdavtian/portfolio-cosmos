export interface ContentEnvelope<TPayload> {
  key: string;
  category: string;
  payload: TPayload;
  version: number;
  updatedAt: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8080";

export async function fetchContentByKey<TPayload>(key: string): Promise<ContentEnvelope<TPayload>> {
  const response = await fetch(`${API_BASE_URL}/api/v1/content/${key}`);

  if (!response.ok) {
    throw new Error(`Unable to load content key "${key}" (${response.status})`);
  }

  return (await response.json()) as ContentEnvelope<TPayload>;
}
