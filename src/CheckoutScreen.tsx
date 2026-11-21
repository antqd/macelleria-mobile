import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { ApiError, api } from './api';
import { formatPrice, formatWeight, type Catalog } from './catalog';
import type { Fulfillment, GuestOrder, Item, Quote } from './checkout';
import { Action, Field, Icon, ink, line, red, ui } from './ui';

const fields = {
  firstName: '', lastName: '', phone: '', street: '', streetNumber: '', postalCode: '', city: '', notes: '',
};

export default function CheckoutScreen({ items, catalog, onCreate, onAcceptPrices }: {
  items: Item[];
  catalog: Catalog;
  onCreate: (body: Record<string, unknown>) => Promise<GuestOrder>;
  onAcceptPrices: (quote: Quote) => void;
}) {
  const [fulfillment, setFulfillment] = useState<Fulfillment>(catalog.settings?.address ? 'PICKUP' : 'DELIVERY');
  const [form, setForm] = useState(fields);
  const [quote, setQuote] = useState<Quote>();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { settings } = catalog;
  const pickup = fulfillment === 'PICKUP';
  const methodAvailable = Boolean(pickup ? settings?.address : settings?.deliveryEnabled);
  const contactValid = form.firstName.trim() && form.lastName.trim() && form.phone.replace(/\D/g, '').length >= 6;
  const addressValid = pickup || (form.street.trim() && form.streetNumber.trim() && /^\d{5}$/.test(form.postalCode.trim()) && form.city.trim());

  function invalidate() {
    setQuote(undefined);
    setAccepted(false);
    setError('');
  }
  const updateField = (name: keyof typeof fields, value: string) => {
    setForm(previous => ({ ...previous, [name]: value }));
    invalidate();
  };
  const quoteBody = {
    fulfillment, items,
    ...(!pickup ? { city: form.city, postalCode: form.postalCode } : {}),
  };

  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (!quote) {
        setQuote(await api<Quote>('/quote', { method: 'POST', body: quoteBody }));
        return;
      }
      await onCreate({
        ...quoteBody, expectedTotalCents: quote.totalCents,
        firstName: form.firstName, lastName: form.lastName, phone: form.phone,
        ...(!pickup ? { street: form.street, streetNumber: form.streetNumber, notes: form.notes } : {}),
      });
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setQuote(undefined);
        setAccepted(false);
      }
      setError(failure instanceof Error ? failure.message : 'Impossibile continuare.');
    } finally {
      setBusy(false);
    }
  }

  return <View style={{ gap: 15 }}>
    <Text style={ui.subtitle}>Come vuoi ricevere l’ordine?</Text>
    {([
      { key: 'PICKUP', label: 'Ritiro in macelleria', enabled: Boolean(settings?.address), icon: 'storefront-outline' },
      { key: 'DELIVERY', label: 'Consegna a domicilio', enabled: Boolean(settings?.deliveryEnabled), icon: 'bicycle-outline' },
    ] as const).map(method => <Pressable key={method.key} disabled={!method.enabled || busy} accessibilityRole="radio"
      accessibilityState={{ checked: fulfillment === method.key, disabled: !method.enabled }}
      onPress={() => { setFulfillment(method.key); invalidate(); }}
      style={{ backgroundColor: '#FFF', opacity: method.enabled ? 1 : 0.55, borderRadius: 13, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: fulfillment === method.key ? red : line }}>
      <Icon name={method.icon} /><Text style={[ui.label, { flex: 1 }]}>{method.label}{method.enabled ? '' : ' · non disponibile'}</Text>
      <Icon name={fulfillment === method.key ? 'radio-button-on' : 'radio-button-off'} color={fulfillment === method.key ? red : ink} />
    </Pressable>)}
    {pickup ? [settings?.address, settings?.openingHours, settings?.phone, settings?.pickupNotes].filter(Boolean).map((value, i) =>
      <Text key={i} style={ui.copy}>{value}</Text>) : settings?.deliveryHours ? <Text style={ui.copy}>{settings.deliveryHours}</Text> : null}
    <Text style={[ui.subtitle, { marginTop: 8 }]}>I tuoi dati</Text>
    <Field label="Nome" autoComplete="given-name" value={form.firstName} maxLength={100} editable={!busy} onChangeText={value => updateField('firstName', value)} />
    <Field label="Cognome" autoComplete="family-name" value={form.lastName} maxLength={100} editable={!busy} onChangeText={value => updateField('lastName', value)} />
    <Field label="Telefono" autoComplete="tel" keyboardType="phone-pad" value={form.phone} maxLength={24} editable={!busy} onChangeText={value => updateField('phone', value)} />
    {!pickup && <>
      <Field label="Via" value={form.street} maxLength={100} editable={!busy} onChangeText={value => updateField('street', value)} />
      <Field label="Numero civico" value={form.streetNumber} maxLength={20} editable={!busy} onChangeText={value => updateField('streetNumber', value)} />
      <Field label="CAP" autoComplete="postal-code" keyboardType="number-pad" value={form.postalCode} maxLength={5} editable={!busy} onChangeText={value => updateField('postalCode', value)} />
      <Field label="Comune" value={form.city} maxLength={100} editable={!busy} onChangeText={value => updateField('city', value)} />
      <Field label="Note per la consegna (facoltative)" multiline value={form.notes} maxLength={500} editable={!busy} onChangeText={value => updateField('notes', value)} />
    </>}
    {quote && <View style={{ gap: 7, borderTopWidth: 1, borderColor: line, paddingTop: 16 }}>
      <Text style={ui.subtitle}>Riepilogo</Text>
      {quote.lines.map(item => <Text key={item.productId} style={ui.copy}>{item.name} · {formatWeight(item.grams)} · {formatPrice(item.totalCents)}</Text>)}
      {!pickup && <Text style={ui.copy}>Consegna {formatPrice(quote.deliveryFeeCents)}</Text>}
      <Text style={ui.subtitle}>Totale {formatPrice(quote.totalCents)}</Text>
      {quote.priceChanged && !accepted && <>
        <Text accessibilityRole="alert" style={ui.error}>Il prezzo di uno o più prodotti è cambiato. Controlla il riepilogo aggiornato.</Text>
        <Action secondary title="Accetta i nuovi prezzi" onPress={() => { onAcceptPrices(quote); setAccepted(true); }} />
      </>}
    </View>}
    {[
      { label: 'Informativa privacy', url: settings?.privacyPolicyUrl },
      { label: 'Condizioni di vendita', url: settings?.termsUrl },
    ].map(({ label, url }) => url?.startsWith('https://') ? <Pressable key={label} accessibilityRole="link"
      style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => void Linking.openURL(url).catch(() => setError('Impossibile aprire il link.'))}>
      <Text style={[ui.label, { color: red }]}>{label}</Text>
    </Pressable> : null)}
    {error ? <Text accessibilityRole="alert"  style={ui.error}>{error}</Text> : null}
    {!catalog.paymentsEnabled && <Text style={ui.copy}>Il pagamento non è disponibile in questo momento.</Text>}
    <Action title={busy ? 'Attendi…' : quote ? 'Continua al pagamento' : 'Verifica il totale'}
      disabled={busy || !methodAvailable || !contactValid || !addressValid || !items.length || Boolean(quote?.priceChanged && !accepted) || Boolean(quote && !catalog.paymentsEnabled)}
      onPress={() => void submit()} />
  </View>;
}
