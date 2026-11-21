# Macelleria Chiappetta

App mobile Expo e React Native con NativeWind/Tailwind. L'interfaccia comprende home, catalogo, dettaglio prodotto, carrello e riepilogo.

## Avvio

Servono Node.js 20.19.4 o superiore (consigliato Node 22) e npm.

```sh
npm install
npm start
```

Apri l'app con Expo Go oppure usa `npm run android`, `npm run ios` o `npm run web`. Per controllare i tipi: `npm run typecheck`.

## Stato del progetto

Il catalogo in `src/catalog.ts` contiene dati di esempio. Il carrello vive solo in memoria e si azzera alla chiusura. I prezzi indicati sono dimostrativi. La scelta tra ritiro e consegna è solo un'anteprima: il pagamento e l'invio dell'ordine non sono ancora attivi. Non esiste un backend, un sistema di gestione o un'integrazione Stripe configurata.

La struttura di partenza per il collegamento è descritta in [docs/integrazione.md](docs/integrazione.md).

## Aspetto iOS

I controlli e la navigazione usano `expo-glass-effect`: sui dispositivi iOS compatibili viene mostrato Liquid Glass nativo; sugli altri dispositivi viene mostrata una superficie chiara alternativa. Per vedere l'effetto nativo occorre provarlo su un dispositivo o simulatore iOS compatibile.
