module.exports = ({ config }) => {
  const merchantIdentifier = process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID;
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  return {
    ...config,
    plugins: [
      ['@stripe/stripe-react-native', {
        enableGooglePay: true,
        ...(merchantIdentifier ? { merchantIdentifier } : {}),
      }],
      'expo-secure-store',
      ['expo-notifications', { defaultChannel: 'orders' }],
    ],
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
  };
};
