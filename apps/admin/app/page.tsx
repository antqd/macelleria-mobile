'use client';

import { useEffect, useRef, useState } from 'react';
import { Feedback, Field, Form, read, usePanel } from './components';
import { CatalogPage, type CatalogSection } from './catalog';
import { message, panel, PanelError, type DashboardData } from './data';
import { Dashboard, Detail, OrderList } from './orders';
import { Settings } from './settings';

type Tab = 'dashboard' | 'orders' | 'settings' | CatalogSection;
const tabs: { id: Tab; title: string; icon: string }[] = [
  { id: 'dashboard', title: 'Panoramica', icon: '▦' },
  { id: 'orders', title: 'Ordini', icon: '≡' },
  { id: 'products', title: 'Prodotti', icon: '□' },
  { id: 'daily', title: 'Preparati del giorno', icon: '◷' },
  { id: 'promotions', title: 'Offerte', icon: '%' },
  { id: 'categories', title: 'Categorie', icon: '▤' },
  { id: 'settings', title: 'Impostazioni', icon: '⚙' },
];

function Workspace({ email, logout }: { email: string; logout: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [order, setOrder] = useState('');
  const [notification, setNotification] = useState('');
  const [browserNotify, setBrowserNotify] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const previous = useRef<Set<string> | undefined>(undefined);
  const { value, error } = usePanel<DashboardData>('/dashboard', 20000);

  useEffect(() => {
    setBrowserNotify(typeof Notification !== 'undefined' && Notification.permission === 'granted' && localStorage.getItem('chiappetta-notify') === 'true');
  }, []);
  useEffect(() => {
    if (!value) return;
    const current = new Set(value.recent.map(item => item.id));
    const incoming = previous.current ? value.recent.filter(item => !previous.current?.has(item.id)) : [];
    previous.current = current;
    if (!incoming.length) return;
    const text = incoming.length === 1 ? `Nuovo ordine #${incoming[0].number}` : `${incoming.length} nuovi ordini`;
    setNotification(text);
    if (browserNotify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification('Macelleria Chiappetta', { body: text, tag: incoming[0].id }); } catch { /* The in-app notice is sufficient. */ }
    }
  }, [value, browserNotify]);

  async function changeBrowserNotify() {
    if (browserNotify) {
      localStorage.removeItem('chiappetta-notify');
      setBrowserNotify(false);
      return;
    }
    if (typeof Notification === 'undefined' || await Notification.requestPermission() !== 'granted') {
      throw new Error('Le notifiche del browser non sono disponibili o non sono state consentite.');
    }
    localStorage.setItem('chiappetta-notify', 'true');
    setBrowserNotify(true);
  }

  const open = (id: string) => { setTab('orders'); setOrder(id); window.scrollTo(0, 0); };
  return <div className="appShell">
    <aside className="sidebar">
      <div className="wordmark"><span className="mark" aria-hidden="true">C</span><div><strong>Chiappetta</strong><small>MACELLERIA</small></div></div>
      <nav aria-label="Sezioni del pannello">{tabs.map(item => <button key={item.id} className={item.id === tab ? 'current' : ''} aria-current={item.id === tab ? 'page' : undefined}
        onClick={() => { setTab(item.id); setOrder(''); window.scrollTo(0, 0); }}><span aria-hidden="true">{item.icon}</span>{item.title}</button>)}</nav>
      <div className="account"><small>{email}</small><button onClick={() => {
        setLogoutError('');
        void logout().catch(failure => setLogoutError(message(failure)));
      }}>Esci</button></div>
    </aside>
    <main className="workspace">
      <header><h1>{tabs.find(item => item.id === tab)?.title}</h1></header>
      <Feedback error={logoutError} />
      {notification && <div className="notice"><span role="status">{notification}</span>
        <button className="secondary" onClick={() => { setNotification(''); setTab('orders'); setOrder(''); }}>Vai agli ordini</button>
        <button className="secondary" onClick={() => setNotification('')} aria-label="Chiudi notifica">×</button>
      </div>}
      {tab === 'dashboard' && <><Feedback error={error} loading={!value} />
        {Boolean(value?.failedPayments) && <p className="error" role="status">Pagamenti falliti nelle ultime 24 ore: {value?.failedPayments}. Li trovi nel filtro Pagamenti falliti.</p>}
        <Dashboard data={value} open={open} /></>}
      {tab === 'orders' && (order ? <Detail key={order} id={order} close={() => setOrder('')} /> : <OrderList open={open} />)}
      {tab === 'settings' && <Settings browserNotify={browserNotify} changeBrowserNotify={changeBrowserNotify} />}
      {(tab === 'products' || tab === 'categories' || tab === 'daily' || tab === 'promotions') && <CatalogPage key={tab} section={tab} />}
    </main>
  </div>;
}

export default function Page() {
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void panel<{ email: string }>('/session', 'GET', undefined, controller.signal).then(row => setEmail(row.email)).catch(failure => {
      if (!controller.signal.aborted && !(failure instanceof PanelError && failure.status === 401)) setError(message(failure));
    }).finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    const expire = () => setEmail('');
    window.addEventListener('session-expired', expire);
    return () => { controller.abort(); window.removeEventListener('session-expired', expire); };
  }, []);
  if (!loaded) return <main className="login"><Feedback loading /></main>;
  if (email) return <Workspace email={email} logout={async () => { await panel('/session', 'DELETE'); setEmail(''); }} />;
  return <main className="login">
    <section className="surface section loginCard">
      <div className="wordmark loginBrand"><span className="mark" aria-hidden="true">C</span><div><strong>Chiappetta</strong><small>MACELLERIA</small></div></div>
      <h1>Accedi al pannello</h1>
      <Feedback error={error} />
      <Form saveLabel="Accedi" onSave={async form => {
        setError('');
        const data = await panel<{ email: string }>('/session', 'POST', { email: read(form, 'email'), password: String(form.get('password') ?? '') });
        setEmail(data.email);
      }}>
        <Field label="Email"><input name="email" type="email" autoComplete="username" required /></Field>
        <Field label="Password"><input name="password" type="password" autoComplete="current-password" required /></Field>
      </Form>
    </section>
  </main>;
}
