import './global.css';
import React, { useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { products, Product, formatPrice, formatWeight, lineTotal } from './src/catalog';
import type { Fulfillment } from './src/checkout';

type Screen = 'home' | 'catalog' | 'product' | 'cart' | 'checkout';
const red = '#a51119';
const text = '#171717';
const nativeGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

function GlassSurface({ children, interactive = false }: { children: React.ReactNode; interactive?: boolean }) {
  if (nativeGlass) {
    return <GlassView glassEffectStyle="regular" colorScheme="light" isInteractive={interactive} style={styles.glass}>{children}</GlassView>;
  }
  return <View style={[styles.glass, styles.glassFallback]}>{children}</View>;
}

const styles = StyleSheet.create({
  glass: { borderRadius: 28, overflow: 'hidden' },
  glassFallback: { backgroundColor: 'rgba(255, 255, 255, 0.94)', borderWidth: 1, borderColor: 'rgba(220, 216, 212, 0.85)' },
  floatingNav: { marginHorizontal: 20, marginBottom: 8, shadowColor: '#31221e', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
});

function Icon({ name, size = 24, color = text }: { name: React.ComponentProps<typeof Ionicons>['name']; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}
function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} className={`rounded-xl h-14 items-center justify-center ${disabled ? 'bg-[#c9c4c1]' : 'bg-[#a51119]'}`}><Text className="text-white font-semibold text-base">{title}</Text></Pressable>;
}
function WeightControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <View className="self-start"><GlassSurface interactive><View className="flex-row items-center"><Pressable accessibilityLabel="Diminuisci quantità" onPress={() => onChange(Math.max(0, value - 500))} className="w-10 h-10 items-center justify-center"><Icon name="remove" size={19} /></Pressable><Text className="text-sm font-semibold min-w-[64px] text-center">{formatWeight(value)}</Text><Pressable accessibilityLabel="Aumenta quantità" onPress={() => onChange(value + 500)} className="w-10 h-10 items-center justify-center"><Icon name="add" size={19} /></Pressable></View></GlassSurface></View>;
}
function Main() {
  const [screen, setScreen] = useState<Screen>('home');
  const [selected, setSelected] = useState<Product>(products[0]);
  const [weight, setWeight] = useState(500);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup');
  const lines = products.filter(p => (cart[p.id] ?? 0) > 0);
  const total = lines.reduce((sum, p) => sum + lineTotal(p.pricePerKgCents, cart[p.id]), 0);
  const openProduct = (p: Product) => { setSelected(p); setWeight(500); setScreen('product'); };
  const back = () => setScreen(screen === 'product' ? 'catalog' : screen === 'checkout' ? 'cart' : 'home');
  const title = screen === 'catalog' ? 'I nostri prodotti' : screen === 'cart' ? 'Carrello' : screen === 'checkout' ? 'Riepilogo' : '';
  const nav = (target: Screen, icon: React.ComponentProps<typeof Ionicons>['name'], label: string) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setScreen(target)} className="flex-1 items-center py-3"><Icon name={icon} size={22} color={screen === target ? red : '#777'} /><Text style={{ color: screen === target ? red : '#777' }} className="text-[11px] mt-1">{label}{target === 'cart' && lines.length ? ` (${lines.length})` : ''}</Text></Pressable>;
  return <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-[#faf9f7]"><StatusBar barStyle="dark-content" /><View className="flex-1">
    {screen !== 'home' && <View className="h-16 px-5 flex-row items-center"><View className="mr-4"><GlassSurface interactive><Pressable accessibilityLabel="Indietro" onPress={back} className="w-10 h-10 items-center justify-center"><Icon name="chevron-back" size={21} /></Pressable></GlassSurface></View><Text className="text-xl font-bold flex-1">{title}</Text></View>}
    {screen === 'home' && <ScrollView contentContainerStyle={{ flexGrow: 1 }}><View className="px-6 pt-5"><Text className="text-[#a51119] text-xs font-bold tracking-[2px]">MACELLERIA CHIAPPETTA</Text><Text className="text-[34px] font-bold leading-[41px] mt-9">La qualità di casa,{"\n"}ogni giorno.</Text><Text className="text-[#777] text-base leading-6 mt-3">I nostri preparati freschi, pronti per la tua tavola.</Text></View><Image source={require('./assets/hero.jpg')} className="w-full h-[280px] mt-8" resizeMode="cover" /><View className="px-6 pt-6 pb-8"><Button title="Scopri i prodotti" onPress={() => setScreen('catalog')} /><Text className="text-[#999] text-xs mt-6 text-center">LA TUA MACELLERIA DI FIDUCIA</Text></View></ScrollView>}
    {screen === 'catalog' && <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}><Text className="text-[#777] mb-3">Preparati freschi, ogni giorno.</Text>{products.map(p => <Pressable accessibilityRole="button" key={p.id} onPress={() => openProduct(p)} className="flex-row py-4 items-center border-b border-[#e9e6e3]"><Image source={p.image} className="w-20 h-20 rounded-xl" /><View className="flex-1 ml-4"><Text className="font-bold text-base">{p.name}</Text><Text className="text-[#777] mt-2">{formatPrice(p.pricePerKgCents)} / kg</Text></View><Icon name="chevron-forward" size={19} color="#999" /></Pressable>)}</ScrollView>}
    {screen === 'product' && <View className="flex-1"><ScrollView><Image source={selected.image} className="w-full h-[285px]" resizeMode="cover" /><View className="px-6 pt-6"><Text className="font-bold text-[27px]">{selected.name}</Text><Text className="text-[#a51119] font-semibold text-lg mt-1">{formatPrice(selected.pricePerKgCents)} / kg</Text><Text className="text-[#777] text-base leading-6 mt-4">{selected.description}</Text><Text className="font-semibold mt-8 mb-3">Quantità</Text><WeightControl value={weight} onChange={v => setWeight(Math.max(500, v))} /><Text className="text-[#999] text-xs mt-2">Incrementi di 0,5 kg</Text></View></ScrollView><View className="px-6 pb-4 pt-4"><Button title={`Aggiungi · ${formatPrice(lineTotal(selected.pricePerKgCents, weight))}`} onPress={() => { setCart(c => ({ ...c, [selected.id]: (c[selected.id] ?? 0) + weight })); setScreen('cart'); }} /></View></View>}
    {screen === 'cart' && <View className="flex-1 px-5">{lines.length === 0 ? <View className="flex-1 items-center justify-center"><Icon name="bag-outline" size={42} color="#bbb" /><Text className="font-bold text-lg mt-4">Il carrello è vuoto</Text><Pressable onPress={() => setScreen('catalog')}><Text className="text-[#a51119] font-semibold mt-4">Scopri i prodotti</Text></Pressable></View> : <><ScrollView>{lines.map(p => <View key={p.id} className="flex-row py-4 border-b border-[#e9e6e3]"><Image source={p.image} className="w-[72px] h-[72px] rounded-xl" /><View className="flex-1 ml-4"><Text className="font-bold">{p.name}</Text><Text className="text-[#777] text-sm mt-1">{formatPrice(p.pricePerKgCents)} / kg</Text><View className="mt-3"><WeightControl value={cart[p.id]} onChange={value => setCart(c => ({ ...c, [p.id]: value }))} /></View></View><Text className="font-semibold">{formatPrice(lineTotal(p.pricePerKgCents, cart[p.id]))}</Text></View>)}</ScrollView><View className="flex-row justify-between py-5"><Text className="font-semibold">Totale indicativo</Text><Text className="font-bold text-lg">{formatPrice(total)}</Text></View><View className="pb-4"><Button title="Continua" onPress={() => setScreen('checkout')} /></View></>}</View>}
    {screen === 'checkout' && <View className="flex-1 px-5"><ScrollView><Text className="font-bold text-lg mt-3">Come vuoi ricevere l’ordine?</Text>{([{ id: 'pickup', title: 'Ritiro in macelleria', icon: 'storefront-outline' }, { id: 'delivery', title: 'Consegna a domicilio', icon: 'bicycle-outline' }] as const).map(option => <Pressable accessibilityRole="radio" accessibilityState={{ checked: fulfillment === option.id }} key={option.id} onPress={() => setFulfillment(option.id)} className="flex-row items-center py-5 border-b border-[#e9e6e3]"><Icon name={option.icon} size={22} /><Text className="flex-1 ml-4 font-semibold">{option.title}</Text><Icon name={fulfillment === option.id ? 'radio-button-on' : 'radio-button-off'} color={fulfillment === option.id ? red : '#bbb'} size={21} /></Pressable>)}<Text className="font-bold text-lg mt-9 mb-3">Il tuo ordine</Text>{lines.map(p => <View key={p.id} className="flex-row justify-between py-2"><Text className="text-[#666] flex-1">{p.name} · {formatWeight(cart[p.id])}</Text><Text>{formatPrice(lineTotal(p.pricePerKgCents, cart[p.id]))}</Text></View>)}<View className="flex-row justify-between border-t border-[#e9e6e3] mt-3 pt-4"><Text className="font-bold">Totale indicativo</Text><Text className="font-bold">{formatPrice(total)}</Text></View><Text className="text-[#777] leading-5 text-sm mt-6">Il pagamento e l’invio dell’ordine saranno disponibili a breve.</Text></ScrollView><View className="pb-4"><Button title="Pagamento non ancora disponibile" disabled onPress={() => {}} /></View></View>}
    {(['home', 'catalog', 'cart'] as Screen[]).includes(screen) && <View style={styles.floatingNav}><GlassSurface interactive><View className="flex-row">{nav('home', 'home-outline', 'Home')}{nav('catalog', 'grid-outline', 'Prodotti')}{nav('cart', 'bag-outline', 'Carrello')}</View></GlassSurface></View>}
  </View></SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><Main /></SafeAreaProvider>; }
