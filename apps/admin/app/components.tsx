'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { message, panel, PanelError } from './data';

export function usePanel<T>(path: string, pollMs?: number) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState('');
  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await panel<T>(path, 'GET', undefined, signal);
      if (!signal?.aborted) { setValue(data); setError(''); }
    } catch (failure) {
      if (!signal?.aborted) {
        setError(message(failure));
        if (failure instanceof PanelError && failure.status === 401) window.dispatchEvent(new Event('session-expired'));
      }
    }
  }, [path]);
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    const timer = pollMs ? window.setInterval(() => { void reload(controller.signal); }, pollMs) : undefined;
    return () => { controller.abort(); if (timer !== undefined) window.clearInterval(timer); };
  }, [pollMs, reload]);
  return { value, error, reload };
}

export function Feedback({ error, loading = false }: { error?: string; loading?: boolean }) {
  if (error) return <p role="alert" className="error">{error}</p>;
  if (loading) return <p role="status" className="empty">Caricamento…</p>;
  return null;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Form({ onSave, onCancel, children, saveLabel = 'Salva' }: {
  onSave: (data: FormData) => Promise<void>; onCancel?: () => void; children: ReactNode; saveLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <form className="editor" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    void onSave(data).catch(failure => setError(message(failure))).finally(() => setBusy(false));
  }}>
    <fieldset disabled={busy}>{children}</fieldset>
    <Feedback error={error} />
    <div className="actions"><button type="submit">{busy ? 'Attendi…' : saveLabel}</button>
      {onCancel && <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Chiudi</button>}</div>
  </form>;
}

export const read = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
export const toCents = (form: FormData, key: string) => {
  const raw = read(form, key).replace(',', '.');
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(raw)) throw new Error('Inserisci un importo valido in euro.');
  const [euros, cents = ''] = raw.split('.');
  return Number(euros) * 100 + Number(cents.padEnd(2, '0'));
};
export async function upload(form: FormData, current: string | null) {
  const file = form.get('photo');
  if (file instanceof File && file.size) {
    if (file.size > 5 * 1024 * 1024) throw new Error('La foto deve pesare al massimo 5 MB.');
    return (await panel<{ url: string }>('/images', 'POST', file)).url;
  }
  return form.has('removePhoto') ? null : current;
}

export function PhotoField({ current }: { current: string | null }) {
  return <>
    {current && <img className="thumb" src={`/gateway${current}`} alt="Foto attuale" />}
    <Field label="Foto"><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></Field>
    {current && <label className="toggle"><input type="checkbox" name="removePhoto" /> Rimuovi foto</label>}
  </>;
}
