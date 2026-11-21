# Preparazione integrazioni

L'app contiene un catalogo dimostrativo in `src/catalog.ts` e il tipo di richiesta iniziale in `src/checkout.ts`. L'interfaccia non raccoglie dati di pagamento e non conferma ordini prima che esista un backend.

## Catalogo e ordini

- Collegare il catalogo a una fonte dati che fornisca identificativi, disponibilità, prezzi e immagini aggiornati.
- Il carrello invia al backend solo gli identificativi dei prodotti, le quantità in grammi e la modalità di ritiro o consegna. Il server verifica disponibilità e quantità, ricalcola prezzi e spese, e crea un ordine persistente.
- Per la consegna aggiungere e validare indirizzo, contatti, zona servita, costi e disponibilità; per il ritiro definire gli orari. Raccogliere solo i dati necessari al servizio.
- Gestire l'idempotenza della creazione dell'ordine e dei tentativi di pagamento. L'app deve recuperare lo stato dal backend dopo interruzioni o riaperture.

## Stripe

- Integrare l'SDK React Native ufficiale con la configurazione Expo appropriata e utilizzare una chiave pubblicabile nell'app; le chiavi segrete rimangono esclusivamente sul server.
- Il server crea il PaymentIntent per l'importo verificato e restituisce all'app soltanto i dati necessari per avviare il pagamento. Non fidarsi mai del totale calcolato dal dispositivo.
- Gestire annullamenti, errori e pagamenti in attesa. Confermare l'ordine solo dopo la verifica lato server di un webhook Stripe firmato; rendere l'elaborazione degli eventi idempotente.
- Attivare Apple Pay e Google Pay solo dopo configurazione e verifica delle rispettive disponibilità e dei requisiti della piattaforma.
- Provare l'intero flusso in ambiente di test prima di usare credenziali di produzione.

La scelta del backend, le credenziali, i dettagli della macelleria e le regole commerciali non sono ancora stati forniti. Nessun servizio esterno è stato configurato.
