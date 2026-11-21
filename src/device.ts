export const guestStorage = {
  get: async (key: string) => globalThis.sessionStorage?.getItem(key) ?? null,
  set: async (key: string, value: string) => { globalThis.sessionStorage?.setItem(key, value); },
};
export const tapFeedback = () => {};
export async function requestPushToken(): Promise<string> {
  throw new Error('Le notifiche sono disponibili nell’app iOS e Android.');
}
