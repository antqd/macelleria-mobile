import React, { Component, useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, AppState, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, imageUri } from './src/api';
import { cartStorageKey, changeQuantity, loadCartState, type Cart } from './src/cart';
import { formatPrice, formatWeight, lineTotal, type Catalog, type Product } from './src/catalog';
import { statusLabels, type GuestOrder, type Order } from './src/checkout';
import CheckoutScreen from './src/CheckoutScreen';
import { guestStorage, requestPushToken } from './src/device';
import Payment from './src/payment';
import ProfileSection from './src/ProfileSection';
import { newCredentials, profileStorageKey, readCode, type Profile } from './src/profile';
import { Action, Field, Glass, Icon, Photo, Weight, ink, line, muted, paper, red, ui, type IconName } from './src/ui';

type Screen = 'home' | 'catalog' | 'product' | 'cart' | 'checkout' | 'orders' | 'order';
const nav: { screen: Screen; label: string; icon: IconName }[] = [
  { screen: 'home', label: 'Home', icon: 'home-outline' },
  { screen: 'catalog', label: 'Prodotti', icon: 'grid-outline' },
  { screen: 'cart', label: 'Carrello', icon: 'bag-outline' },
  { screen: 'orders', label: 'Ordini', icon: 'receipt-outline' },
];
const photos: Record<string, ImageSourcePropType> = {
  preparati: require('./assets/involtini.jpg'),
  tagli: require('./assets/hero.jpg'),
  offerte: require('./assets/hamburger.jpg'),
};
const historyKey = 'chiappetta.guest.v1';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Si è verificato un errore. Riprova.';
const sourceFor = (path: string | null) => path ? { uri: imageUri(path) } : undefined;

function OrderView({ guest, onPaid, profile }: { guest: GuestOrder; onPaid: (id: string) => void; profile?: Profile }) {
  const [order, setOrder] = useState<Order>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [push, setPush] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [linked, setLinked] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const row = await api<Order>(`/orders/${guest.id}`, { token: guest.token, signal });
      if (signal?.aborted) return;
      setOrder(row);
      if (row.paymentStatus === 'PAID') onPaid(row.id);
      setError('');
    } catch (failure) {
      if (!signal?.aborted) setError(errorText(failure));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [guest, onPaid]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => { void refresh(controller.signal); }, submitted ? 5500 : 20000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [refresh, submitted]);

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ clientSecret: string }>(`/orders/${guest.id}/payment`, { method: 'POST', token: guest.token });
      setClientSecret(result.clientSecret);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  async function togglePush(enable: boolean) {
    setBusy(true);
    try {
      const token = enable ? await requestPushToken() : null;
      await api(`/orders/${guest.id}/push`, { method: 'PUT', token: guest.token, body: { token } });
      setPush(enable ? 'Notifiche attivate per questo ordine.' : 'Notifiche disattivate.');
    } catch (failure) {
      setPush(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  if (clientSecret) return <Payment clientSecret={clientSecret} onCancel={() => setClientSecret('')}
    onSubmitted={() => { setClientSecret(''); setSubmitted(true); void refresh(); }} />;
  if (loading) return <ActivityIndicator accessibilityLabel="Caricamento ordine" color={red} />;
  return <View style={styles.stack}>
    {order && <>
      <Text accessibilityRole="header" style={ui.title}>Ordine #{order.number}</Text>
      <Text style={ui.subtitle}>{statusLabels[order.status]}</Text>
      {order.paymentStatus === 'FAILED' && <Text style={ui.error}>Pagamento non riuscito. Se il tentativo è ancora aperto, puoi riprovare.</Text>}
      {order.paymentStatus === 'REFUNDED' && <Text style={ui.copy}>Pagamento rimborsato.</Text>}
      {submitted && order.status === 'PENDING_PAYMENT' && order.paymentStatus !== 'FAILED' && <Text style={ui.copy}>In attesa della conferma del pagamento. Puoi tornare qui dalla sezione Ordini.</Text>}
      <View style={styles.panel}>
        {order.items.map((item, i) => <View key={i} style={styles.split}>
          <Text style={[ui.copy, { flex: 1 }]}>{item.name} · {formatWeight(item.grams)}</Text>
          <Text style={ui.label}>{formatPrice(item.totalCents)}</Text>
        </View>)}
        {order.fulfillment === 'DELIVERY' && <View style={styles.split}><Text style={ui.copy}>Consegna</Text><Text>{formatPrice(order.deliveryFeeCents)}</Text></View>}
        <View style={styles.split}><Text style={ui.subtitle}>{order.paymentStatus === 'PAID' ? 'Totale pagato' : 'Totale ordine'}</Text><Text style={ui.subtitle}>{formatPrice(order.totalCents)}</Text></View>
      </View>
      <Text style={ui.subtitle}>{order.fulfillment === 'PICKUP' ? 'Ritiro in macelleria' : 'Consegna a domicilio'}</Text>
      {order.deliveryHours && <Text style={ui.copy}>{order.deliveryHours}</Text>}
      {order.pickupSnapshot && Object.values(order.pickupSnapshot).filter(Boolean).map((value, i) => <Text key={i} style={ui.copy}>{value}</Text>)}
      {order.status === 'PENDING_PAYMENT' && (!submitted || order.paymentStatus === 'FAILED') &&
        <Action title={busy ? 'Attendi…' : 'Paga l’ordine'} disabled={busy} onPress={() => void pay()} />}
      {Platform.OS !== 'web' && order.status !== 'CANCELLED' && <>
        <Action title="Attiva notifiche per questo ordine" secondary disabled={busy} onPress={() => void togglePush(true)} />
        <Action title="Disattiva notifiche" secondary disabled={busy} onPress={() => void togglePush(false)} />
        {push ? <Text accessibilityLiveRegion="polite" style={ui.copy}>{push}</Text> : null}
      </>}
    </>}
    {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
    <Action secondary title="Aggiorna stato" onPress={() => void refresh()} />
    {order && profile && !guest.profileAccess && <Action secondary title={linked ? 'Ordine salvato nel profilo' : 'Salva nel profilo'} disabled={linked || busy} onPress={() => {
      setBusy(true);
      setError('');
      void api(`/customers/${profile.id}/orders/${order.id}`, { method: 'PUT', token: profile.token, body: { orderToken: guest.token } })
        .then(() => setLinked(true)).catch(failure => setError(errorText(failure))).finally(() => setBusy(false));
    }} />}
    {order && !guest.profileAccess && <>
      <Action secondary title={showRecovery ? 'Nascondi codice' : 'Mostra codice di recupero'} onPress={() => setShowRecovery(value => !value)} />
      {showRecovery && <>
        <Text style={ui.copy}>Chi possiede questo codice può vedere lo stato dell’ordine. Conservalo in un posto sicuro.</Text>
        <Text selectable style={styles.recoveryCode}>{guest.id}.{guest.token}</Text>
      </>}
    </>}
  </View>;
}

function Main() {
  const [screen, setScreen] = useState<Screen>('home');
  const [catalog, setCatalog] = useState<Catalog>();
  const [catalogError, setCatalogError] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [grams, setGrams] = useState(500);
  const [cart, setCart] = useState<Cart>({});
  const [cartLoaded, setCartLoaded] = useState(false);
  const [history, setHistory] = useState<GuestOrder[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile>();
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [recovery, setRecovery] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [guest, setGuest] = useState<GuestOrder>();
  const [cartOrderId, setCartOrderId] = useState<string>();
  const [storageError, setStorageError] = useState('');
  const attempt = useRef<{ body: string; guest: GuestOrder } | null>(null);

  const refreshCatalog = useCallback(async (signal?: AbortSignal) => {
    try {
      const value = await api<Catalog>('/catalog', { signal });
      if (!signal?.aborted) { setCatalog(value); setCatalogError(''); }
    } catch (failure) {
      if (!signal?.aborted) setCatalogError(errorText(failure));
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { void refreshCatalog(controller.signal); };
    refresh();
    const timer = setInterval(refresh, 45000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { controller.abort(); clearInterval(timer); subscription.remove(); };
  }, [refreshCatalog]);

  useEffect(() => {
    void AsyncStorage.getItem(cartStorageKey).then(raw => {
      const saved = loadCartState(raw);
      setCart(saved.cart);
      setCartOrderId(saved.orderId);
    }).catch(() => {
      setStorageError('Impossibile recuperare il carrello salvato.');
    }).finally(() => setCartLoaded(true));
    void guestStorage.get(historyKey).then(raw => {
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      if (Array.isArray(saved)) setHistory(saved.filter(item => typeof item?.id === 'string' && typeof item?.token === 'string'));
    }).catch(() => setStorageError('Impossibile recuperare gli ordini salvati.')).finally(() => setHistoryLoaded(true));
    void guestStorage.get(profileStorageKey).then(value => {
      const saved = value ? readCode(value) : null;
      if (saved) setProfile(saved);
    }).catch(() => setStorageError('Impossibile recuperare il profilo.')).finally(() => setProfileLoaded(true));
  }, []);
  useEffect(() => {
    if (cartLoaded) void AsyncStorage.setItem(cartStorageKey, JSON.stringify({ version: 1, items: cart, orderId: cartOrderId }))
      .catch(() => setStorageError('Non è stato possibile salvare il carrello.'));
  }, [cart, cartLoaded, cartOrderId]);

  const items = Object.values(cart);
  const products = catalog?.products ?? [];
  const selected = products.find(product => product.id === selectedId);
  const category = catalog?.categories.find(value => value.id === categoryId);
  const catalogProducts = products.filter(product => {
    const matchesCategory = !category || (category.slug === 'offerte' ? product.pricePerKgCents < product.regularPricePerKgCents && product.available : product.categoryId === category.id);
    return matchesCategory && (!availableOnly || product.available) && `${product.name} ${product.description}`.toLocaleLowerCase('it').includes(search.trim().toLocaleLowerCase('it'));
  });
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item.expectedPricePerKgCents, item.grams), 0);

  function openCatalog(id = '') {
    setCategoryId(id);
    setSearch('');
    setAvailableOnly(false);
    setScreen('catalog');
    void refreshCatalog();
  }

  const back = useCallback(() => {
    const destinations: Partial<Record<Screen, Screen>> = { product: 'catalog', order: 'orders', checkout: 'cart' };
    setScreen(destinations[screen] ?? 'home');
  }, [screen]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'home') return false;
      back();
      return true;
    });
    return () => subscription.remove();
  }, [back, screen]);

  const onPaid = useCallback((id: string) => {
    if (cartOrderId === id) {
      setCart({});
      setCartOrderId(undefined);
    }
  }, [cartOrderId]);

  async function createOrder(body: Record<string, unknown>) {
    if (!historyLoaded || !profileLoaded) throw new Error('Attendi il caricamento degli ordini.');
    const input = { ...body, ...(profile ? { customerId: profile.id } : {}) };
    const serialized = JSON.stringify(input);
    if (!attempt.current || attempt.current.body !== serialized) {
      const newGuest = await newCredentials();
      const updated = [newGuest, ...history].slice(0, 12);
      await guestStorage.set(historyKey, JSON.stringify(updated));
      setHistory(updated);
      attempt.current = { body: serialized, guest: newGuest };
    }
    const record = attempt.current.guest;
    const { number } = await api<{ number: number }>('/orders', { method: 'POST', body: { ...input, id: record.id }, token: record.token, customerToken: profile?.token });
    const numbered = { ...record, number };
    const updated = [numbered, ...history.filter(item => item.id !== record.id)].slice(0, 12);
    setHistory(updated);
    void guestStorage.set(historyKey, JSON.stringify(updated)).catch(() => {});
    attempt.current = null;
    setGuest(numbered);
    setCartOrderId(record.id);
    setScreen('order');
    return numbered;
  }

  async function restoreOrder() {
    const credentials = readCode(recovery);
    if (!credentials) {
      setRecoveryError('Inserisci il codice di recupero completo.');
      return;
    }
    const { id, token } = credentials;
    setRestoring(true);
    setRecoveryError('');
    try {
      const { number } = await api<Order>(`/orders/${id}`, { token });
      const record = { id, token, number };
      const updated = [record, ...history.filter(order => order.id !== id)].slice(0, 12);
      await guestStorage.set(historyKey, JSON.stringify(updated));
      setHistory(updated);
      setRecovery('');
      setGuest(record);
      setScreen('order');
    } catch (failure) {
      setRecoveryError(errorText(failure));
    } finally {
      setRestoring(false);
    }
  }

  const title = { home: '', catalog: category?.name ?? 'I prodotti', product: 'Dettaglio prodotto', cart: 'Carrello', checkout: 'Checkout', orders: 'I tuoi ordini', order: 'Dettaglio ordine' }[screen];
  const disabledCheckout = !catalog || items.some(item => {
    const product = products.find(row => row.id === item.productId);
    return !product?.available || item.grams > product.maxGrams;
  });

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content" />
    <KeyboardAvoidingView style={styles.frame} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        {screen !== 'home' && <Pressable accessibilityRole="button" accessibilityLabel="Indietro" style={ui.iconButton} onPress={back}><Icon name="chevron-back" /></Pressable>}
        <Text accessibilityRole="header" style={screen === 'home' ? styles.brand : ui.subtitle}>{screen === 'home' ? catalog?.settings?.name ?? 'Macelleria Chiappetta' : title}</Text>
        {screen === 'home' && <Pressable accessibilityRole="button" accessibilityLabel="Apri carrello" style={ui.iconButton} onPress={() => setScreen('cart')}><Icon name="bag-outline" /></Pressable>}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {storageError ? <Text accessibilityRole="alert" style={ui.error}>{storageError}</Text> : null}
        {['home', 'catalog', 'cart'].includes(screen) && catalogError ? <View style={styles.stack}>
          <Text accessibilityRole="alert" style={ui.error}>{catalogError}</Text>
          <Action title="Ricarica il catalogo" secondary onPress={() => void refreshCatalog()} />
        </View> : null}
        {screen === 'home' && <>
          <View style={styles.intro}><Text accessibilityRole="header" style={ui.title}>Scegli cosa portare in tavola</Text></View>
          {!catalog && !catalogError && [1, 2, 3].map(i => <View key={i} style={styles.skeleton} />)}
          {catalog?.categories.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => openCatalog(item.id)} style={styles.category}>
            <Photo source={sourceFor(item.imageUrl) ?? photos[item.slug]} height={115} width={106} />
            <View style={styles.categoryText}><Text style={styles.categoryTitle}>{item.name}</Text><Text style={styles.categoryCopy}>{item.description}</Text></View>
            <View style={{ marginRight: 15 }}><Icon name="arrow-forward" color="#FFF" size={20} /></View>
          </Pressable>)}
          {catalog && !catalog.categories.length && <Text style={ui.copy}>Non ci sono categorie disponibili al momento.</Text>}
        </>}
        {screen === 'catalog' && <>
          <Field label="Cerca prodotti" value={search} onChangeText={setSearch} placeholder="Nome o descrizione" />
          <View style={styles.split}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: availableOnly }} onPress={() => setAvailableOnly(value => !value)} style={styles.filter}>
              <Icon name={availableOnly ? 'checkbox' : 'square-outline'} size={18} color={red} /><Text style={ui.label}>Solo disponibili</Text>
            </Pressable>
            {category && <Pressable accessibilityRole="button" style={styles.filter} onPress={() => openCatalog()}><Text style={[ui.label, { color: red }]}>Tutti i prodotti</Text></Pressable>}
          </View>
          {!catalog && !catalogError && <ActivityIndicator color={red} />}
          {catalog && !catalogProducts.length && <Text style={ui.copy}>Nessun prodotto corrisponde alla ricerca.</Text>}
          {catalogProducts.map(product => <Pressable key={product.id} accessibilityRole="button" accessibilityLabel={`Scegli il peso per ${product.name}`}
            onPress={() => { setSelectedId(product.id); setGrams(500); setScreen('product'); }} style={styles.productRow}>
            <Photo source={sourceFor(product.imageUrl)} width={82} height={92} />
            <View style={styles.productText}>
              <Text style={ui.subtitle}>{product.name}</Text><Text numberOfLines={1} style={ui.copy}>{product.description}</Text>
              <Text style={styles.price}>{formatPrice(product.pricePerKgCents)}/kg {product.available ? '' : ' · Esaurito'}</Text>
              {product.pricePerKgCents < product.regularPricePerKgCents && <Text style={styles.oldPrice}>{formatPrice(product.regularPricePerKgCents)}/kg</Text>}
            </View><View style={{ marginRight: 12 }}><Icon name={product.available ? 'add-circle-outline' : 'chevron-forward'} color={red} /></View>
          </Pressable>)}
        </>}
        {screen === 'product' && (selected ? <>
          <View style={styles.photoWrap}><Photo source={sourceFor(selected.imageUrl)} height={250} /></View>
          <Text style={ui.title}>{selected.name}</Text>
          <Text style={styles.price}>{formatPrice(selected.pricePerKgCents)}/kg</Text>
          {selected.pricePerKgCents < selected.regularPricePerKgCents && <Text style={styles.oldPrice}>{formatPrice(selected.regularPricePerKgCents)}/kg</Text>}
          <Text style={ui.copy}>{selected.description}</Text>
          {!selected.available ? <Text style={ui.error}>Il prodotto è esaurito.</Text> : <>
            <Text style={ui.subtitle}>Quantità</Text>
            <Weight grams={grams} min={500} max={Math.max(0, selected.maxGrams - (cart[selected.id]?.grams ?? 0))} onChange={setGrams} />
            <Text style={ui.copy}>Incrementi di 0,5 kg</Text>
            {grams + (cart[selected.id]?.grams ?? 0) > selected.maxGrams && <Text style={ui.error}>Riduci la quantità già presente nel carrello per poterne aggiungere.</Text>}
            <Action title={`Aggiungi · ${formatPrice(lineTotal(selected.pricePerKgCents, grams))}`}
              disabled={!cartLoaded || grams + (cart[selected.id]?.grams ?? 0) > selected.maxGrams}
              onPress={() => { setCart(previous => changeQuantity(previous, selected, (previous[selected.id]?.grams ?? 0) + grams)); setCartOrderId(undefined); setScreen('cart'); }} />
          </>}
        </> : <Text style={ui.copy}>Questo prodotto non è più nel catalogo.</Text>)}
        {screen === 'cart' && <>
          {!cartLoaded ? <ActivityIndicator color={red} /> : !items.length ? <View style={styles.panel}>
            <Icon name="bag-outline" color={red} size={32} /><Text style={ui.subtitle}>Il carrello è vuoto</Text>
            <Action title="Scopri i prodotti" secondary onPress={() => openCatalog()} />
          </View> : items.map(item => {
            const product = products.find(row => row.id === item.productId);
            const invalid = catalog && (!product?.available || item.grams > product.maxGrams);
            return <View key={item.productId} style={styles.panel}>
              <View style={styles.split}><Text style={[ui.subtitle, { flex: 1 }]}>{product?.name ?? 'Prodotto non disponibile'}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Rimuovi prodotto" style={ui.iconButton}
                  onPress={() => { setCart(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== item.productId))); setCartOrderId(undefined); }}>
                  <Icon name="trash-outline" size={19} color={red} /></Pressable></View>
              <Text style={ui.copy}>{formatPrice(item.expectedPricePerKgCents)}/kg</Text>
              <View style={styles.split}>{product?.available ? <Weight grams={item.grams} min={500} max={product.maxGrams} onChange={value => {
                setCart(previous => changeQuantity(previous, product, value)); setCartOrderId(undefined);
              }} /> : <Text>{formatWeight(item.grams)}</Text>}<Text style={styles.price}>{formatPrice(lineTotal(item.expectedPricePerKgCents, item.grams))}</Text></View>
              {invalid && <Text style={ui.error}>{product?.available ? `Il limite è ora ${formatWeight(product.maxGrams)}. Riduci la quantità.` : 'Rimuovi l’articolo per proseguire.'}</Text>}
            </View>;
          })}
          {items.length > 0 && <><View style={styles.split}><Text style={ui.subtitle}>Subtotale</Text><Text style={ui.subtitle}>{formatPrice(subtotal)}</Text></View>
            <Action title="Continua al checkout" disabled={disabledCheckout} onPress={() => setScreen('checkout')} /></>}
        </>}
        {screen === 'checkout' && catalog && <CheckoutScreen items={items} catalog={catalog} onCreate={createOrder}
          onAcceptPrices={quote => setCart(previous => {
            const next = { ...previous };
            for (const item of quote.lines) if (next[item.productId]) next[item.productId] = { ...next[item.productId], expectedPricePerKgCents: item.pricePerKgCents };
            return next;
          })} />}
        {screen === 'orders' && (!historyLoaded || !profileLoaded ? <ActivityIndicator color={red} /> : <>
          {!history.length && <Text style={ui.copy}>Gli ordini fatti da questo dispositivo compaiono qui.</Text>}
          {history.map((record, index) => <Action key={record.id} secondary title={record.number ? `Ordine #${record.number}` : index === 0 ? 'Apri l’ultimo tentativo' : `Tentativo precedente ${index}`}
            onPress={() => { setGuest(record); setScreen('order'); }} />)}
          <View style={styles.panel}>
            <Text style={ui.subtitle}>Recupera un ordine</Text>
            <Field label="Codice di recupero" value={recovery} autoCapitalize="none" autoCorrect={false}
              maxLength={120} onChangeText={setRecovery} />
            {recoveryError ? <Text style={ui.error} accessibilityRole="alert">{recoveryError}</Text> : null}
            <Action title={restoring ? 'Attendi…' : 'Apri ordine'} disabled={!recovery.trim() || restoring} onPress={() => void restoreOrder()} />
          </View>
          <ProfileSection profile={profile} change={async next => {
            await guestStorage.set(profileStorageKey, next ? `${next.id}.${next.token}` : '');
            setProfile(next);
          }} open={record => { setGuest(record); setScreen('order'); }} />
        </>)}
        {screen === 'order' && guest && <OrderView key={guest.id} guest={guest} onPaid={onPaid} profile={profile} />}
      </ScrollView>
      {nav.some(item => item.screen === screen) && <View style={styles.nav}><Glass>
        <View style={{ flexDirection: 'row' }}>{nav.map(item => <Pressable key={item.screen} accessibilityRole="tab" accessibilityState={{ selected: screen === item.screen }}
          onPress={() => item.screen === 'catalog' ? openCatalog() : setScreen(item.screen)} style={styles.tab}>
          <Icon name={item.icon} color={screen === item.screen ? red : muted} />
          <Text style={{ color: screen === item.screen ? red : muted, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>{item.label}{item.screen === 'cart' && items.length ? ` (${items.length})` : ''}</Text>
        </Pressable>)}</View>
      </Glass></View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

class ErrorBoundary extends Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <SafeAreaView style={[styles.safe, styles.content]}><Text style={ui.error}>Si è verificato un problema nell’app.</Text>
      <Action title="Riapri l’app" onPress={() => this.setState({ failed: false })} /></SafeAreaView>;
  }
}

export default function App() {
  return <SafeAreaProvider><ErrorBoundary><Main /></ErrorBoundary></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: paper },
  frame: { flex: 1, width: '100%', maxWidth: 660, alignSelf: 'center' },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 18, borderBottomWidth: 1, borderColor: line },
  brand: { color: red, fontSize: 16, fontWeight: '900', flex: 1, letterSpacing: 0.5 },
  content: { paddingHorizontal: 18, paddingVertical: 18, gap: 13 },
  intro: { paddingVertical: 7 },
  stack: { gap: 13 },
  category: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden', minHeight: 115, borderRadius: 17, backgroundColor: ink },
  categoryText: { flex: 1, paddingHorizontal: 13, paddingVertical: 8 },
  categoryTitle: { color: '#FFF', fontSize: 19, fontWeight: '800', marginBottom: 4 },
  categoryCopy: { color: '#D8D1CE', fontSize: 13, lineHeight: 17 },
  skeleton: { height: 115, borderRadius: 17, backgroundColor: '#E8E4E1' },
  productRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1, borderColor: line, overflow: 'hidden' },
  productText: { flex: 1, gap: 2, padding: 11 },
  photoWrap: { height: 250, borderRadius: 17, overflow: 'hidden' },
  price: { color: red, fontWeight: '800', fontSize: 16 },
  recoveryCode: { padding: 13, color: ink, backgroundColor: '#FFF', borderRadius: 10, fontSize: 13 },
  oldPrice: { color: muted, textDecorationLine: 'line-through' },
  split: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  filter: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  panel: { backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1, borderColor: line, padding: 13, gap: 9 },
  nav: { paddingHorizontal: 18, paddingVertical: 4 },
  tab: { flex: 1, minHeight: 56, paddingHorizontal: 3, paddingVertical: 7, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
