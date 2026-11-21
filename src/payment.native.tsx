import { useEffect, useState } from 'react';
import { Button, Linking, Platform, Text, View } from 'react-native';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import type { PaymentProps } from './payment.types';

const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const merchantId = process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID;

function Sheet({ clientSecret, onSubmitted, onCancel }: PaymentProps) {
  const { initPaymentSheet, presentPaymentSheet, handleURLCallback } = useStripe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const handle = (url: string) => {
      if (url.startsWith('macelleriachiappetta://stripe-redirect')) void handleURLCallback(url).catch(() => {});
    };
    void Linking.getInitialURL().then(url => { if (url) handle(url); }).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => subscription.remove();
  }, [handleURLCallback]);

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const init = await initPaymentSheet({
        merchantDisplayName: 'Macelleria Chiappetta',
        paymentIntentClientSecret: clientSecret,
        returnURL: 'macelleriachiappetta://stripe-redirect',
        allowsDelayedPaymentMethods: false,
        ...(Platform.OS === 'ios' && merchantId ? { applePay: { merchantCountryCode: 'IT' } } : {}),
        ...(Platform.OS === 'android' ? { googlePay: { merchantCountryCode: 'IT', testEnv: true } } : {}),
      });
      if (init.error) throw new Error(init.error.localizedMessage || 'Impossibile aprire il pagamento.');
      const result = await presentPaymentSheet();
      if (result.error && result.error.code !== 'Canceled') throw new Error(result.error.localizedMessage || 'Pagamento non riuscito. Puoi riprovare.');
      if (!result.error) onSubmitted();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Pagamento non riuscito.');
    } finally {
      setBusy(false);
    }
  }
  return <View style={{ gap: 10 }}>
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <Button color="#C8101E" title={busy ? 'Attendi…' : 'Apri pagamento sicuro'} disabled={busy} onPress={() => void pay()} />
    <Button color="#555" title="Torna all’ordine" disabled={busy} onPress={onCancel} />
  </View>;
}

export default function Payment(props: PaymentProps) {
  if (!publishableKey?.startsWith('pk_test_')) return <View><Text>Pagamento di test non configurato.</Text><Button title="Torna all’ordine" onPress={props.onCancel} /></View>;
  return <StripeProvider publishableKey={publishableKey} merchantIdentifier={merchantId} urlScheme="macelleriachiappetta"><Sheet {...props} /></StripeProvider>;
}
