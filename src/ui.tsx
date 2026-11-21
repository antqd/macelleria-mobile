import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View, type ImageSourcePropType, type TextInputProps } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { formatWeight } from './catalog';
import { tapFeedback } from './device';

export const red = '#C8101E';
export const ink = '#0B0B0D';
export const muted = '#68686D';
export const line = '#E9E6E3';
export const paper = '#F7F7F7';
const hasGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color = ink }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function Glass({ children }: { children: ReactNode }) {
  if (hasGlass) return <GlassView glassEffectStyle="regular" colorScheme="light" isInteractive style={ui.glass}>{children}</GlassView>;
  return <View style={[ui.glass, ui.solid]}>{children}</View>;
}

export function Action({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => { tapFeedback(); onPress(); }}
    style={({ pressed }) => [ui.action, secondary && ui.secondary, disabled && ui.disabled, pressed && { opacity: 0.84 }]}>
    <Text style={[ui.actionText, secondary && { color: red }]}>{title}</Text>
  </Pressable>;
}

export function Field({ label, ...input }: TextInputProps & { label: string }) {
  return <View style={{ gap: 5 }}><Text style={ui.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={muted} style={ui.input} {...input} /></View>;
}

export function Weight({ grams, min, max, onChange }: { grams: number; min: number; max: number; onChange: (value: number) => void }) {
  return <View style={ui.weight}>
    {([{ diff: -500, icon: 'remove', label: 'Diminuisci quantità' }, { diff: 500, icon: 'add', label: 'Aumenta quantità' }] as const).map(({ diff, icon, label }, i) => {
      const disabled = diff < 0 ? grams + diff < min : grams + diff > max;
      return <View key={icon} style={ui.weightRow}>
        {i === 1 && <Text style={ui.weightText}>{formatWeight(grams)}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
          onPress={() => { tapFeedback(); onChange(grams + diff); }} style={ui.iconButton}>
          <Icon name={icon} size={19} color={disabled ? '#A8A5A2' : ink} />
        </Pressable>
      </View>;
    })}
  </View>;
}

export function Photo({ source, height = 96, width }: { source?: ImageSourcePropType; height?: number; width?: number }) {
  return <View style={{ height, width, flex: width ? undefined : 1, backgroundColor: '#EAE1DA', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
    {source ? <Image accessible={false} source={source} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      : <Icon name="image-outline" color="#806961" size={25} />}
  </View>;
}

export const ui = StyleSheet.create({
  glass: { borderRadius: 26, overflow: 'hidden' },
  solid: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: line },
  action: { minHeight: 52, padding: 12, backgroundColor: red, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: '#FAEBEB' },
  disabled: { opacity: 0.55 },
  actionText: { color: '#FFF', fontWeight: '700', textAlign: 'center', fontSize: 16 },
  input: { minHeight: 49, paddingHorizontal: 13, paddingVertical: 9, color: ink, fontSize: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: line, borderRadius: 12 },
  label: { fontWeight: '600', color: ink, fontSize: 14 },
  title: { fontSize: 29, fontWeight: '800', color: ink, letterSpacing: -0.8 },
  subtitle: { fontSize: 18, fontWeight: '700', color: ink },
  copy: { color: muted, fontSize: 15, lineHeight: 22 },
  error: { color: '#920B15', fontSize: 15, lineHeight: 22, backgroundColor: '#FAEBEB', borderRadius: 12, padding: 12 },
  weight: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 12, borderWidth: 1, borderColor: line, backgroundColor: '#FFF' },
  weightRow: { flexDirection: 'row', alignItems: 'center' },
  weightText: { minWidth: 70, textAlign: 'center', fontWeight: '700', color: ink },
  iconButton: { width: 45, height: 45, alignItems: 'center', justifyContent: 'center' },
});
