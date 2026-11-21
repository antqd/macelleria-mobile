export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
};

export type Product = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  pricePerKgCents: number;
  regularPricePerKgCents: number;
  maxGrams: number;
  available: boolean;
};

export type Catalog = {
  categories: Category[];
  products: Product[];
  settings: {
    name: string;
    address: string | null;
    phone: string | null;
    openingHours: string | null;
    pickupNotes: string | null;
    deliveryHours: string | null;
    privacyPolicyUrl: string | null;
    termsUrl: string | null;
    deliveryEnabled: boolean;
  } | null;
  paymentsEnabled: boolean;
};

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
export const formatPrice = (cents: number) => currency.format(cents / 100);
export const formatWeight = (grams: number) => `${(grams / 1000).toFixed(1).replace('.', ',')} kg`;
export const lineTotal = (price: number, grams: number) => Math.floor((price * (grams / 500) + 1) / 2);
