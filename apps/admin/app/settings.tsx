'use client';

import { useState } from 'react';
import { Feedback, Field, Form, read, toCents, usePanel } from './components';
import { euro, panel, type Business, type Zone } from './data';

export function Settings({ browserNotify, changeBrowserNotify }: {
  browserNotify: boolean; changeBrowserNotify: () => Promise<void>;
}) {
  const { value, error, reload } = usePanel<{ settings: Business | null; zones: Zone[] }>('/settings');
  const [editing, setEditing] = useState('');
  const [saved, setSaved] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const settings = value?.settings;
  const zone = value?.zones.find(item => item.postalCode === editing);
  return <>
    <section className="surface section">
      <h2>Informazioni della macelleria</h2>
      <Feedback error={error} loading={!value} />
      {value && <Form saveLabel="Salva impostazioni" onSave={async form => {
        const get = (key: string) => read(form, key) || null;
        await panel('/settings', 'PUT', {
          name: read(form, 'name'), address: get('address'), phone: get('phone'), openingHours: get('openingHours'),
          pickupNotes: get('pickupNotes'), deliveryHours: get('deliveryHours'),
          privacyPolicyUrl: get('privacyPolicyUrl'), termsUrl: get('termsUrl'), deliveryEnabled: form.has('deliveryEnabled'),
        });
        setSaved(true);
        await reload();
      }}>
        <Field label="Nome macelleria"><input required maxLength={120} name="name" defaultValue={settings?.name ?? 'Macelleria Chiappetta'} /></Field>
        <Field label="Indirizzo del negozio"><input name="address" defaultValue={settings?.address ?? ''} /></Field>
        <Field label="Telefono"><input name="phone" type="tel" maxLength={25} defaultValue={settings?.phone ?? ''} /></Field>
        <Field label="Orari di ritiro"><textarea name="openingHours" maxLength={1000} defaultValue={settings?.openingHours ?? ''} /></Field>
        <Field label="Indicazioni per il ritiro"><textarea name="pickupNotes" maxLength={1000} defaultValue={settings?.pickupNotes ?? ''} /></Field>
        <Field label="Orari di consegna"><textarea name="deliveryHours" maxLength={1000} defaultValue={settings?.deliveryHours ?? ''} /></Field>
        <Field label="Link HTTPS all’informativa privacy"><input name="privacyPolicyUrl" type="url" maxLength={500} defaultValue={settings?.privacyPolicyUrl ?? ''} /></Field>
        <Field label="Link HTTPS alle condizioni di vendita"><input name="termsUrl" type="url" maxLength={500} defaultValue={settings?.termsUrl ?? ''} /></Field>
        <label className="toggle"><input type="checkbox" name="deliveryEnabled" defaultChecked={settings?.deliveryEnabled ?? false} /> Consegna a domicilio attiva</label>
      </Form>}
      {saved && <p role="status">Impostazioni salvate.</p>}
    </section>
    <section className="surface section">
      <h2>Zone di consegna</h2>
      {editing ? <Form onCancel={() => setEditing('')} onSave={async form => {
        await panel('/zones', 'PUT', {
          postalCode: read(form, 'postalCode'), city: read(form, 'city'), feeCents: toCents(form, 'fee'),
          minOrderCents: toCents(form, 'minimum'), active: form.has('active'),
        });
        setEditing('');
        await reload();
      }}>
        <Field label="CAP"><input required name="postalCode" inputMode="numeric" pattern="[0-9]{5}" defaultValue={zone?.postalCode} readOnly={Boolean(zone)} /></Field>
        <Field label="Comune"><input required name="city" defaultValue={zone?.city} maxLength={120} /></Field>
        <Field label="Costo della consegna (€)"><input required name="fee" inputMode="decimal" defaultValue={((zone?.feeCents ?? 0) / 100).toFixed(2)} /></Field>
        <Field label="Ordine minimo (€)"><input required name="minimum" inputMode="decimal" defaultValue={((zone?.minOrderCents ?? 0) / 100).toFixed(2)} /></Field>
        <label className="toggle"><input type="checkbox" name="active" defaultChecked={zone?.active ?? true} /> Zona attiva</label>
      </Form> : <>
        {value && <button onClick={() => setEditing('new')}>Aggiungi zona</button>}
        {value?.zones.length ? <div className="tableScroll"><table>
          <thead><tr><th>CAP</th><th>Comune</th><th>Costo</th><th>Minimo</th><th>Stato</th><th>Azioni</th></tr></thead>
          <tbody>{value.zones.map(item => <tr key={item.postalCode}><td>{item.postalCode}</td><td>{item.city}</td>
            <td>{euro(item.feeCents)}</td><td>{euro(item.minOrderCents)}</td><td>{item.active ? 'Attiva' : 'Disattivata'}</td>
            <td><button className="link" onClick={() => setEditing(item.postalCode)}>Modifica</button></td></tr>)}</tbody>
        </table></div> : value && <p className="empty">Non ci sono zone configurate.</p>}
      </>}
    </section>
    <section className="surface section">
      <h2>Notifiche</h2>
      <button className="secondary" onClick={() => {
        setNotificationMessage('');
        void changeBrowserNotify().catch(failure => setNotificationMessage(String(failure.message ?? failure)));
      }}>{browserNotify ? 'Disattiva notifiche del browser' : 'Attiva notifiche del browser'}</button>
      {notificationMessage && <p role="alert" className="error">{notificationMessage}</p>}
    </section>
  </>;
}
