import { Platform } from 'react-native';

const devHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const apiBase = (process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? `http://${devHost}:3001` : '')).replace(/\/$/, '');
export const imageUri = (path: string) => `${apiBase}${path}`;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; token?: string; customerToken?: string; signal?: AbortSignal } = {}) {
  if (!apiBase) throw new ApiError('Il servizio non è configurato.', 503);
  const { method, body, token, customerToken, signal } = options;
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method, signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(customerToken ? { 'X-Customer-Token': customerToken } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('Connessione non disponibile. Riprova tra poco.', 0);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(result.error ?? 'Impossibile completare la richiesta.', response.status);
  return result as T;
}
