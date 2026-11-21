import * as Crypto from 'expo-crypto';
import type { OrderStatus } from './checkout';

export type Profile = { id: string; token: string };
export type ProfileOrders = {
  orders: { id: string; number: number; status: OrderStatus }[];
  hasMore: boolean;
};
export const profileStorageKey = 'chiappetta.profile.v1';

export async function newCredentials(): Promise<Profile> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return { id: Crypto.randomUUID(), token: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') };
}

export function readCode(code: string): Profile | null {
  const value = code.trim().toLowerCase();
  const parts = /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.([a-f0-9]{64})$/.exec(value);
  return parts ? { id: parts[1], token: parts[2] } : null;
}
