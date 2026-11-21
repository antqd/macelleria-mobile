'use client';

import { useState } from 'react';
import { Feedback, usePanel } from './components';
import { euro, labels, message, panel, time, weight, type DashboardData, type OrderDetail, type OrderRow, type Status } from './data';

export function Dashboard({ data, open }: { data?: DashboardData; open: (id: string) => void }) {
  if (!data) return null;
  const kpis = [
    ['Ordini di oggi', data.todayOrders], ['Da preparare', data.preparing], ['Incasso netto di oggi', euro(data.revenueCents)],
    ['Prodotti attivi', data.activeProducts], ['Offerte attive', data.offers],
  ];
  const max = Math.max(1, ...data.days.map(day => day.count));
  return <>
    <div className="kpis">{kpis.map(([name, value]) => <article key={name} className="surface kpi"><span>{name}</span><strong>{value}</strong></article>)}</div>
    <div className="dashboardGrid">
      <section className="surface section"><h2>Ordini degli ultimi 7 giorni</h2>
        <div className="chart" aria-label="Ordini giornalieri">{data.days.map(day => <div key={day.date} className="barColumn">
          <strong>{day.count}</strong><div className="barTrack"><div className="bar" style={{ height: `${Math.max(day.count ? 8 : 3, day.count / max * 100)}%` }} /></div><small>{day.date.slice(5).replace('-', '/')}</small>
        </div>)}</div>
      </section>
      <section className="surface section"><h2>Ordini recenti</h2>
        {!data.recent.length && <p className="empty">Gli ordini pagati compariranno qui.</p>}
        <div className="recent">{data.recent.map(order => <button type="button" className="rowButton" key={order.id} onClick={() => open(order.id)}>
          <strong>#{order.number}</strong><span>{labels[order.status]}</span><b>{euro(order.totalCents)}</b>
        </button>)}</div>
      </section>
    </div>
  </>;
}

export function OrderList({ open }: { open: (id: string) => void }) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), ...(search ? { search } : {}) });
  if (status === 'FAILED') query.set('payment', status);
  else if (status) query.set('status', status);
  const { value, error } = usePanel<{ orders: OrderRow[]; count: number }>(`/orders?${query}`, 20000);
  return <section className="surface section">
    <form className="toolbar" onSubmit={event => { event.preventDefault(); setSearch(input.trim()); setPage(1); }}>
      <input aria-label="Cerca per numero, nome o telefono" value={input} onChange={event => setInput(event.target.value)} placeholder="Numero, nome o telefono" maxLength={100} />
      <select aria-label="Filtra per stato" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="">Ordini confermati</option>
        <option value="FAILED">Pagamenti falliti</option>
        {Object.entries(labels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
      <button>Cerca</button>
    </form>
    <Feedback error={error} loading={!value} />
    {value && (value.orders.length ? <>
      <div className="tableScroll"><table><thead><tr><th>Ordine</th><th>Cliente</th><th>Prodotti</th><th>Ricezione</th><th>Stato</th><th>Totale</th><th>Data</th></tr></thead>
        <tbody>{value.orders.map(order => <tr key={order.id}>
          <td><button type="button" className="link" onClick={() => open(order.id)}>#{order.number}</button></td>
          <td>{order.customerName}<small>{order.phone}</small></td>
          <td>{order.items.map((item, index) => <small key={index}>{item.name} · {weight(item.grams)}</small>)}</td>
          <td>{order.fulfillment === 'PICKUP' ? 'Ritiro' : 'Consegna'}</td>
          <td><span className="pill">{labels[order.status]}</span></td><td>{euro(order.totalCents)}</td><td>{time(order.createdAt)}</td>
        </tr>)}</tbody></table></div>
      <div className="actions"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Precedente</button>
        <span>Pagina {page}</span><button className="secondary" disabled={page * 25 >= value.count} onClick={() => setPage(page + 1)}>Successiva</button></div>
    </> : <p className="empty">Nessun ordine corrispondente.</p>)}
  </section>;
}

export function Detail({ id, close }: { id: string; close: () => void }) {
  const { value: order, error, reload } = usePanel<OrderDetail>(`/orders/${id}`, 15000);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancel, setCancel] = useState(false);
  const payments = { PENDING: 'In attesa', PAID: 'Pagato', FAILED: 'Fallito', REFUNDED: 'Rimborsato' };

  async function change(status?: Status) {
    setBusy(true);
    setFeedback('');
    try {
      if (status) await panel(`/orders/${id}`, 'PATCH', { status });
      else {
        const result = await panel<{ pending: boolean; refundStatus: string | null }>(`/orders/${id}/cancel`, 'POST');
        if (result.pending) setFeedback(result.refundStatus === 'failed' ? 'Il rimborso è fallito. Verifica il pagamento nel pannello Stripe.' : 'Rimborso in attesa di conferma.');
      }
      setCancel(false);
      await reload();
    } catch (failure) {
      setFeedback(message(failure));
    } finally {
      setBusy(false);
    }
  }
  return <section className="surface section printOrder">
    <div className="actions noPrint"><button className="secondary" onClick={close}>Tutti gli ordini</button><button className="secondary" disabled={!order} onClick={() => window.print()}>Stampa</button></div>
    <Feedback error={error} loading={!order} />
    {order && <>
      <h2>Ordine #{order.number}</h2><p>{time(order.createdAt)} · {labels[order.status]} · {payments[order.paymentStatus]}</p>
      <div className="info">
        <section><h3>Cliente</h3><p>{order.customerName}</p><a href={`tel:${order.phone.replace(/[^\d+]/g, '')}`}>{order.phone}</a></section>
        <section><h3>{order.fulfillment === 'PICKUP' ? 'Ritiro in macelleria' : 'Consegna a domicilio'}</h3>
          {order.deliveryAddress && <><p>{order.deliveryAddress.street} {order.deliveryAddress.streetNumber}</p><p>{order.deliveryAddress.postalCode} {order.deliveryAddress.city}</p><p>{order.deliveryAddress.notes}</p></>}
          {order.pickupSnapshot && <><p>{order.pickupSnapshot.address}</p><p>{order.pickupSnapshot.hours}</p></>}
        </section>
      </div>
      <div className="tableScroll"><table><thead><tr><th>Prodotto</th><th>Peso</th><th>Importo</th></tr></thead>
        <tbody>{order.items.map((item, index) => <tr key={index}><td>{item.name}</td><td>{weight(item.grams)}</td><td>{euro(item.totalCents)}</td></tr>)}</tbody>
      </table></div>
      <p>Subtotale {euro(order.subtotalCents)} · Consegna {euro(order.deliveryFeeCents)}</p>
      <h3>Totale {euro(order.totalCents)}</h3>
      <div className="noPrint">
        <Feedback error={feedback} />
        {order.cancellationRequested && <p>Richiesta di rimborso in corso.</p>}
        <div className="actions">
          {!order.cancellationRequested && order.next.map(status => <button key={status} disabled={busy} onClick={() => void change(status)}>{labels[status]}</button>)}
          {order.paymentStatus === 'PAID' && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(order.status) &&
            <button className="secondary" disabled={busy} onClick={() => setCancel(true)}>{order.cancellationRequested ? 'Controlla il rimborso' : 'Annulla e rimborsa'}</button>}
        </div>
        {cancel && <div className="confirm"><p>Confermi la richiesta di rimborso di {euro(order.totalCents)}?</p>
          <div className="actions"><button disabled={busy} onClick={() => void change()}>Conferma rimborso</button><button className="secondary" disabled={busy} onClick={() => setCancel(false)}>Indietro</button></div>
        </div>}
      </div>
    </>}
  </section>;
}
