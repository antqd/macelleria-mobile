import { useEffect, useRef, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
import type { PaymentProps } from './payment.types';

const key = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export default function Payment({ clientSecret, onSubmitted, onCancel }: PaymentProps) {
  const node = useRef<HTMLDivElement>(null);
  const form = useRef<{ stripe: Stripe; elements: StripeElements } | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!key?.startsWith('pk_test_')) {
      setError('Pagamento di test non configurato.');
      return;
    }
    let mounted = true;
    let destroy: (() => void) | undefined;
    setReady(false);
    form.current = null;
    void loadStripe(key).then(stripe => {
      if (!mounted || !node.current) return;
      if (!stripe) throw new Error('Impossibile aprire il pagamento.');
      const elements = stripe.elements({ clientSecret, locale: 'it' });
      const payment = elements.create('payment');
      payment.on('ready', () => { if (mounted) setReady(true); });
      payment.mount(node.current);
      form.current = { stripe, elements };
      destroy = () => payment.destroy();
    }).catch(() => { if (mounted) setError('Impossibile aprire il pagamento.'); });
    return () => { mounted = false; destroy?.(); };
  }, [clientSecret]);

  async function confirm() {
    if (!form.current) return;
    setBusy(true);
    setError('');
    try {
      const { stripe, elements } = form.current;
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: 'if_required' });
      if (result.error) setError(result.error.message ?? 'Pagamento non riuscito.');
      else onSubmitted();
    } catch {
      setError('Pagamento non riuscito. Puoi riprovare.');
    } finally {
      setBusy(false);
    }
  }

  return <View style={{ gap: 12 }}>
    <div ref={node} />
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <Button color="#C8101E" title={busy ? 'Attendi…' : 'Conferma pagamento'} onPress={() => void confirm()} disabled={!ready || busy} />
    <Button color="#555" title="Torna all’ordine" onPress={onCancel} disabled={busy} />
  </View>;
}
