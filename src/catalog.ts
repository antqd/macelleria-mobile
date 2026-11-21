import type { ImageSourcePropType } from 'react-native';

export type Product = {
  id: string;
  name: string;
  description: string;
  pricePerKgCents: number;
  image: ImageSourcePropType;
};

// Catalogo dimostrativo: in futuro i prodotti saranno forniti dal backend.
export const products: Product[] = [
  { id: 'involtini', name: 'Involtini di vitello', pricePerKgCents: 1800, image: require('../assets/involtini.jpg'), description: 'Preparati a mano, pronti da cuocere.' },
  { id: 'hamburger', name: 'Hamburger di manzo', pricePerKgCents: 1600, image: require('../assets/hamburger.jpg'), description: 'Manzo selezionato, macinato fresco ogni giorno.' },
  { id: 'polpette', name: 'Polpette della casa', pricePerKgCents: 1500, image: require('../assets/polpette.jpg'), description: 'Preparate secondo la ricetta della casa.' },
  { id: 'spiedini', name: 'Spiedini misti', pricePerKgCents: 1800, image: require('../assets/spiedini.jpg'), description: 'Preparati freschi ogni giorno.' },
];

export const formatPrice = (cents: number) => `€ ${(cents / 100).toFixed(2).replace('.', ',')}`;
export const formatWeight = (grams: number) => `${(grams / 1000).toFixed(1).replace('.', ',')} kg`;
export const lineTotal = (pricePerKgCents: number, grams: number) => Math.round(pricePerKgCents * grams / 1000);
