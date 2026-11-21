export type PricedProduct = { id: string; name: string; pricePerKgCents: number; maxGrams: number; available: boolean; archived: boolean };
export type RequestedItem = { productId: string; grams: number; expectedPricePerKgCents: number };

export function quoteItems(items: RequestedItem[], products: PricedProduct[]) {
  if (!items.length || items.length > 50) throw new Error('Il carrello deve contenere da 1 a 50 prodotti.');
  const seen = new Set<string>();
  return items.map(item => {
    if (seen.has(item.productId)) throw new Error('Prodotto duplicato nel carrello.');
    seen.add(item.productId);
    const product = products.find(p => p.id === item.productId);
    if (!product || !product.available || product.archived) throw new Error('Un prodotto non è più disponibile.');
    if (!Number.isSafeInteger(item.grams) || item.grams < 500 || item.grams % 500 !== 0 || item.grams > product.maxGrams) throw new Error(`Quantità non valida per ${product.name}.`);
    const totalCents = Math.floor((product.pricePerKgCents * (item.grams / 500) + 1) / 2);
    if (!Number.isSafeInteger(totalCents)) throw new Error('Importo non valido.');
    return { productId: product.id, name: product.name, grams: item.grams, pricePerKgCents: product.pricePerKgCents, totalCents, priceChanged: item.expectedPricePerKgCents !== product.pricePerKgCents };
  });
}
