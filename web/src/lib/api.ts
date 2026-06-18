// Vide par défaut = même origine (le frontend est servi par l'API). En dev, mettre VITE_API_URL=http://localhost:3001
const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

let token: string | null = localStorage.getItem('tiraboschi_token');

export function setToken(t: string | null): void {
  token = t;
  if (t) localStorage.setItem('tiraboschi_token', t);
  else localStorage.removeItem('tiraboschi_token');
}

export function getToken(): string | null {
  return token;
}

/** Télécharge une réponse texte/CSV authentifiée et déclenche un download navigateur. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await fetch(API_URL + path, {
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
    // Session expirée/invalide : on nettoie et on renvoie à l'écran de connexion.
    if (res.status === 401 && token && path !== '/api/auth/login') {
      setToken(null);
      localStorage.removeItem('tiraboschi_user');
      location.reload();
    }
    const msg = (data as { error?: string }).error ?? 'HTTP ' + res.status;
    throw new Error(msg);
  }
  return data as T;
}
