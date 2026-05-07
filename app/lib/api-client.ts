export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return parseApiResponse<T>(response);
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: (T & { error?: string }) | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as T & { error?: string };
    } catch {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
      }
      throw new Error("API returned invalid JSON.");
    }
  }
  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload as T;
}
