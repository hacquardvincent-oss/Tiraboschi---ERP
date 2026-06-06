const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) || 'https://tiraboschi-ops-v2.onrender.com';

let token: string | null = localStorage.getItem('tiraboschi_token');

export function setToken(t: string | null): void {
  token = t;
  if (t) localStorage.setItem('tiraboschi_token', t);
  else localStorage.removeItem('tiraboschi_token');
}

export function getToken(): string | null {
  return token;
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(API_URL + path, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? 'HTTP ' + res.status;
    throw new Error(msg);
  }
  return data as T;
}
