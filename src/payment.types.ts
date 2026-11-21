export type PaymentProps = {
  clientSecret: string;
  onSubmitted: () => void;
  onCancel: () => void;
};
