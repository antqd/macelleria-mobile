'use client';

import { useState } from 'react';
import { Feedback, Field, Form, PhotoField, read, toCents, upload, usePanel } from './components';
import { euro, panel, time, weight, type CatalogData, type Category, type Product, type Promotion } from './data';

export type CatalogSection = 'categories' | 'products' | 'daily' | 'promotions';

function CategoryForm({ current, done }: { current?: Category; done: () => Promise<void> }) {
  return <Form onCancel={() => void done()} onSave={async form => {
    const imageUrl = await upload(form, current?.imageUrl ?? null);
    await panel('/categories', 'PUT', { id: current?.id, data: {
      name: read(form, 'name'), slug: current?.slug ?? read(form, 'slug'), description: read(form, 'description'),
      sortOrder: Number(read(form, 'sortOrder')), active: form.has('active'), imageUrl,
    } });
    await done();
  }}>
    <Field label="Nome"><input name="name" required maxLength={120} defaultValue={current?.name} /></Field>
    {!current && <Field label="Codice breve"><input name="slug" required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="es. specialita" /></Field>}
    <Field label="Descrizione"><textarea name="description" maxLength={1000} defaultValue={current?.description} /></Field>
    <Field label="Ordine di visualizzazione"><input name="sortOrder" type="number" min="0" max="10000" required defaultValue={current?.sortOrder ?? 0} /></Field>
    <PhotoField current={current?.imageUrl ?? null} />
    <label className="toggle"><input type="checkbox" name="active" defaultChecked={current?.active ?? true} /> Visibile nell’app</label>
  </Form>;
}

function ProductForm({ current, categories, defaultCategory, done }: {
  current?: Product; categories: Category[]; defaultCategory?: string; done: () => Promise<void>;
}) {
  return <Form onCancel={() => void done()} onSave={async form => {
    const pricePerKgCents = toCents(form, 'price');
    const imageUrl = await upload(form, current?.imageUrl ?? null);
    await panel('/products', 'PUT', { id: current?.id, data: {
      name: read(form, 'name'), categoryId: read(form, 'category'), description: read(form, 'description'),
      pricePerKgCents, maxGrams: Number(read(form, 'maxGrams')), sortOrder: Number(read(form, 'sortOrder')),
      available: form.has('available'), archived: form.has('archived'), imageUrl,
    } });
    await done();
  }}>
    <Field label="Nome prodotto"><input name="name" required maxLength={120} defaultValue={current?.name} /></Field>
    <Field label="Categoria"><select name="category" required defaultValue={current?.categoryId ?? defaultCategory ?? ''}>
      <option disabled value="">Scegli una categoria</option>
      {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
    </select></Field>
    <Field label="Descrizione"><textarea name="description" maxLength={1000} defaultValue={current?.description} /></Field>
    <Field label="Prezzo al kg (€)"><input name="price" inputMode="decimal" required defaultValue={current ? (current.pricePerKgCents / 100).toFixed(2) : ''} /></Field>
    <Field label="Quantità massima (grammi)"><input name="maxGrams" type="number" min="500" max="100000" step="500" required defaultValue={current?.maxGrams ?? 10000} /></Field>
    <Field label="Ordine di visualizzazione"><input name="sortOrder" type="number" min="0" max="10000" required defaultValue={current?.sortOrder ?? 0} /></Field>
    <PhotoField current={current?.imageUrl ?? null} />
    <label className="toggle"><input type="checkbox" name="available" defaultChecked={current?.available ?? true} /> Disponibile alla vendita</label>
    <label className="toggle"><input type="checkbox" name="archived" defaultChecked={current?.archived ?? false} /> Archivia e nascondi dall’app</label>
  </Form>;
}

function localDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function PromotionForm({ current, products, done }: { current?: Promotion; products: Product[]; done: () => Promise<void> }) {
  return <Form onCancel={() => void done()} onSave={async form => {
    await panel('/promotions', 'PUT', { id: current?.id, data: {
      productId: read(form, 'product'), pricePerKgCents: toCents(form, 'price'), active: form.has('active'),
      startsAt: new Date(read(form, 'startsAt')).toISOString(), endsAt: new Date(read(form, 'endsAt')).toISOString(),
    } });
    await done();
  }}>
    <Field label="Prodotto"><select name="product" required defaultValue={current?.productId ?? ''}>
      <option disabled value="">Scegli un prodotto</option>
      {products.map(product => <option key={product.id} value={product.id}>{product.name} · {euro(product.pricePerKgCents)}/kg</option>)}
    </select></Field>
    <Field label="Prezzo scontato al kg (€)"><input name="price" inputMode="decimal" required defaultValue={current ? (current.pricePerKgCents / 100).toFixed(2) : ''} /></Field>
    <Field label="Inizio (ora del dispositivo)"><input name="startsAt" type="datetime-local" required defaultValue={localDate(current?.startsAt)} /></Field>
    <Field label="Fine (ora del dispositivo)"><input name="endsAt" type="datetime-local" required defaultValue={localDate(current?.endsAt)} /></Field>
    <label className="toggle"><input type="checkbox" name="active" defaultChecked={current?.active ?? true} /> Offerta abilitata</label>
  </Form>;
}

export function CatalogPage({ section }: { section: CatalogSection }) {
  const { value, error, reload } = usePanel<CatalogData>('/catalog');
  const [selection, setSelection] = useState<string>();
  const [search, setSearch] = useState('');
  const done = async () => { setSelection(undefined); await reload(); };
  const daily = value?.categories.find(category => category.slug === 'preparati');
  const products = (value?.products ?? []).filter(product =>
    (section !== 'daily' || product.categoryId === daily?.id) &&
    product.name.toLocaleLowerCase('it').includes(search.trim().toLocaleLowerCase('it')));
  const names = { categories: 'categoria', products: 'prodotto', daily: 'preparato', promotions: 'offerta' };
  const noun = names[section];

  return <section className="surface section">
    <Feedback error={error} loading={!value} />
    {value && <>
      <div className="toolbar">
        {(section === 'products' || section === 'daily') && !selection && <input aria-label="Cerca prodotto" placeholder="Cerca prodotto" value={search} onChange={event => setSearch(event.target.value)} />}
        {!selection && <button
          disabled={(section === 'daily' && !daily) || (section === 'products' && !value.categories.length) || (section === 'promotions' && !value.products.some(product => !product.archived))}
          onClick={() => setSelection('new')}>Aggiungi {noun}</button>}
      </div>
      {section === 'daily' && !daily && <p className="empty">Crea la categoria con codice preparati dalla sezione Categorie.</p>}
      {selection ? <>
        <h2>{selection === 'new' ? 'Aggiungi' : 'Modifica'} {noun}</h2>
        {section === 'categories' && <CategoryForm current={value.categories.find(item => item.id === selection)} done={done} />}
        {(section === 'products' || section === 'daily') && <ProductForm current={value.products.find(item => item.id === selection)} categories={value.categories} defaultCategory={section === 'daily' ? daily?.id : undefined} done={done} />}
        {section === 'promotions' && <PromotionForm current={value.promotions.find(item => item.id === selection)}
          products={value.products.filter(product => !product.archived || product.id === value.promotions.find(item => item.id === selection)?.productId)} done={done} />}
      </> : section === 'categories' ? value.categories.length ? <div className="tableScroll"><table>
        <thead><tr><th>Nome</th><th>Ordine</th><th>Visibilità</th><th>Azioni</th></tr></thead>
        <tbody>{value.categories.map(category => <tr key={category.id}><td><strong>{category.name}</strong><small>{category.description}</small></td>
          <td>{category.sortOrder}</td><td>{category.active ? 'Visibile' : 'Nascosta'}</td><td><button className="link" onClick={() => setSelection(category.id)}>Modifica</button></td></tr>)}</tbody>
      </table></div> : <p className="empty">Nessuna categoria.</p>
      : section === 'promotions' ? value.promotions.length ? <div className="tableScroll"><table>
        <thead><tr><th>Prodotto</th><th>Prezzo al kg</th><th>Periodo</th><th>Stato</th><th>Azioni</th></tr></thead>
        <tbody>{value.promotions.map(offer => {
          const product = value.products.find(item => item.id === offer.productId);
          const status = !offer.active ? 'Disattivata' : Date.parse(offer.endsAt) <= Date.now() ? 'Scaduta' : Date.parse(offer.startsAt) > Date.now() ? 'Programmata' :
            product?.available && !product.archived && offer.pricePerKgCents < product.pricePerKgCents && value.categories.some(category => category.id === product.categoryId && category.active) ? 'Attiva' : 'Non visibile';
          return <tr key={offer.id}><td>{product?.name ?? 'Prodotto rimosso'}</td><td>{euro(offer.pricePerKgCents)}</td>
            <td><small>Da {time(offer.startsAt)}</small><small>A {time(offer.endsAt)}</small></td><td>{status}</td><td><button className="link" onClick={() => setSelection(offer.id)}>Modifica</button></td></tr>;
        })}</tbody>
      </table></div> : <p className="empty">Nessuna offerta.</p>
      : products.length ? <div className="tableScroll"><table>
        <thead><tr><th>Prodotto</th><th>Categoria</th><th>Prezzo al kg</th><th>Peso massimo</th><th>Disponibilità</th><th>Azioni</th></tr></thead>
        <tbody>{products.map(product => <tr key={product.id}>
          <td><div className="photoRow">{product.imageUrl && <img className="miniPhoto" src={`/gateway${product.imageUrl}`} alt="" />}<strong>{product.name}</strong></div></td>
          <td>{value.categories.find(category => category.id === product.categoryId)?.name}</td><td>{euro(product.pricePerKgCents)}</td><td>{weight(product.maxGrams)}</td>
          <td><span className="pill">{product.archived ? 'Archiviato' : product.available ? 'Disponibile' : 'Esaurito'}</span></td>
          <td><button className="link" onClick={() => setSelection(product.id)}>Modifica</button></td>
        </tr>)}</tbody>
      </table></div> : <p className="empty">Nessun prodotto corrispondente.</p>}
    </>}
  </section>;
}
