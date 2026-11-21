import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from './api';
import { statusLabels, type GuestOrder } from './checkout';
import { newCredentials, readCode, type Profile, type ProfileOrders } from './profile';
import { Action, Field, ui } from './ui';

export default function ProfileSection({ profile, change, open }: {
  profile?: Profile;
  change: (profile?: Profile) => Promise<void>;
  open: (order: GuestOrder) => void;
}) {
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [orders, setOrders] = useState<ProfileOrders>();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const draft = useRef<Profile | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!profile) return;
    try {
      const data = await api<ProfileOrders>(`/customers/${profile.id}/orders?page=${page}`, { token: profile.token, signal });
      if (!signal?.aborted) setOrders(data);
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : 'Impossibile leggere lo storico.');
    }
  }, [profile, page]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  async function activate(restore: boolean) {
    setBusy(true);
    setError('');
    try {
      const candidate = restore ? readCode(code) : draft.current ?? await newCredentials();
      if (!candidate) throw new Error('Inserisci il codice privato completo.');
      if (restore) {
        await api(`/customers/${candidate.id}/orders`, { token: candidate.token });
      } else {
        draft.current = candidate;
        await api('/customers', { method: 'POST', token: candidate.token, body: { id: candidate.id } });
      }
      await change(candidate);
      setCode('');
      setPage(1);
      setShow(!restore);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Impossibile aprire il profilo.');
    } finally {
      setBusy(false);
    }
  }

  return <View style={{ paddingVertical: 12, gap: 10 }}>
    <Text style={ui.subtitle}>Profilo ordini</Text>
    {profile ? <>
      {orders?.orders.map(order => <Action key={order.id} secondary title={`Ordine #${order.number} · ${statusLabels[order.status]}`}
        onPress={() => open({ id: order.id, number: order.number, token: profile.token, profileAccess: true })} />)}
      {orders && !orders.orders.length && <Text style={ui.copy}>Il profilo non contiene ordini.</Text>}
      {page > 1 && <Action title="Pagina precedente" secondary onPress={() => setPage(current => current - 1)} />}
      {orders?.hasMore && <Action title="Pagina successiva" secondary onPress={() => setPage(current => current + 1)} />}
      <Action secondary title={show ? 'Nascondi codice privato' : 'Mostra codice privato'} onPress={() => setShow(current => !current)} />
      {show && <><Text style={ui.copy}>Conservalo in un posto sicuro. Dà accesso allo storico del profilo.</Text>
        <Text selectable style={ui.copy}>{profile.id}.{profile.token}</Text></>}
      <Action title="Scollega il profilo da questo dispositivo" secondary onPress={() => {
        void change().then(() => { setOrders(undefined); setPage(1); setShow(false); draft.current = null; })
          .catch(() => setError('Impossibile scollegare il profilo.'));
      }} />
    </> : <>
      <Text style={ui.copy}>Con un profilo puoi ritrovare lo storico su un altro dispositivo.</Text>
      <Action title="Crea profilo" disabled={busy} secondary onPress={() => void activate(false)} />
      <Field label="Codice privato del profilo" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} maxLength={101} />
      <Action title="Collega profilo esistente" disabled={busy || !code.trim()} secondary onPress={() => void activate(true)} />
    </>}
    {error ? <Text style={ui.error} accessibilityRole="alert">{error}</Text> : null}
  </View>;
}
