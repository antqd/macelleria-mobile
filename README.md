# Macelleria Chiappetta

App per ordinare prodotti a peso, pannello per gestire il negozio e API collegate a PostgreSQL. L’app Expo usa lo stesso codice su iOS, Android e web. Il pagamento usa Stripe PaymentSheet sui dispositivi e Payment Element sul web. Il server accetta chiavi e webhook Stripe Test Mode.

| Directory | Contenuto |
| --- | --- |
| Root e `src/` | App Expo, catalogo, carrello, checkout e accesso ospite agli ordini |
| `apps/admin/` | Pannello Next.js App Router con sessione protetta e proxy verso l’API |
| `packages/api/` | API Fastify, prezzi, ordini, Stripe, audit, schema e migrazioni Prisma |

Il progetto mantiene l’entry point Expo in root per conservare l’avvio esistente. Le tre applicazioni hanno dipendenze e ambienti separati. L’API è l’unico accesso al database. Il carrello usa AsyncStorage e i codici ospite usano SecureStore su iOS e Android, oppure lo storage di sessione sul web. L’archivio dell’app conserva fino a 12 ordini. Si può riaprire un ordine su un altro dispositivo usando il codice di recupero. Un profilo facoltativo, protetto da un codice privato distinto, sincronizza lo storico degli ordini collegati.

Lo stato di implementazione e i controlli ancora da eseguire sono in [PROGRESS.md](PROGRESS.md).

## Avvio locale

Servono Node.js 22, npm e un PostgreSQL dedicato allo sviluppo. `docker compose up -d postgres` avvia quello di esempio su `127.0.0.1:55432`. In alternativa, cambia `DATABASE_URL` con il collegamento a un database di sviluppo già disponibile.

1. Copia i tre file `.env.example` come `.env` nella rispettiva directory. Nell’API imposta `ADMIN_BOOTSTRAP_EMAIL` e una password di almeno 16 caratteri.
2. Dalla root esegui `npm install`. Poi esegui `npm --prefix packages/api install` e `npm --prefix apps/admin install`.
3. Esegui `npm --prefix packages/api run db:generate` e `npm --prefix packages/api run db:deploy`.
4. Esegui `npm --prefix packages/api run db:seed` per creare categorie e impostazioni iniziali. In sviluppo, anteponi `SEED_DEMO=1` per inserire anche un catalogo dimostrativo.
5. Esegui `npm --prefix packages/api run admin:create`. Rimuovi le credenziali di bootstrap dal file dopo aver creato l’account.
6. In terminali separati avvia `npm --prefix packages/api run dev`, `npm --prefix apps/admin run dev` e `npm run web`.
7. Apri il pannello su `http://localhost:3000` e l’app web sull’indirizzo mostrato da Expo. Imposta indirizzo e contatti reali nel pannello. Attiva la consegna solo dopo aver aggiunto le zone servite.

Per iOS e Android, usa `npx expo run:ios` o `npx expo run:android` con la relativa toolchain. Su dispositivo fisico imposta `EXPO_PUBLIC_API_URL` con un indirizzo raggiungibile. Usa una build con i moduli nativi di Stripe per il collaudo pagamenti.

## Stripe Test Mode

- Imposta `STRIPE_SECRET_KEY` (`sk_test_…`) nel file dell’API, e `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`) nella root.
- In locale avvia `stripe listen --events payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled,refund.created,refund.updated --forward-to localhost:3001/webhooks/stripe`. Copia il segreto indicato da Stripe CLI in `STRIPE_WEBHOOK_SECRET`, quindi avvia o riavvia l’API.
- Crea un ordine con un importo di almeno € 0,50. Paga con la carta Stripe di test `4242 4242 4242 4242`, data futura e CVC di prova. Controlla che il pagamento venga confermato via webhook e l’ordine compaia nel pannello. Prova poi le transizioni e un rimborso di test.
- Apple Pay richiede un Merchant ID, la configurazione Apple Pay nell’account Stripe e una build iOS con entitlement. Imposta `EXPO_PUBLIC_APPLE_MERCHANT_ID` prima della build. Google Pay è configurato per l’ambiente di test Android.
- Per le notifiche clienti configura il progetto EAS, i certificati APNs o FCM e l’access token Expo Push sul server. Imposta `EXPO_PUBLIC_EAS_PROJECT_ID` e `EXPO_ACCESS_TOKEN`. Il pannello segnala i nuovi ordini mentre è aperto.

## Controlli e preparazione alla pubblicazione

Quando l’ambiente è disponibile, esegui `npm run lint`, `npm run typecheck`, `npm test`, `npm --prefix packages/api run typecheck`, `npm --prefix packages/api test`, `npm --prefix apps/admin run typecheck` e `npm --prefix apps/admin run build`. Le istruzioni per il test integrato, le build e la gestione dei dati sono in [docs/integrazione.md](docs/integrazione.md).
