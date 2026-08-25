# Online booking med MobilePay-depositum

Plan for den integration, der erstatter den manuelle MobilePay-afstemning.
Skrevet 2026-08-25.

## Hvorfor ikke bare Cals Stripe-app

Cal kan tage betaling gennem Stripe, og MobilePay kan tændes i Stripe. Men
MobilePay opkræver **35 kr. om måneden** af danske virksomheder, der tager
MobilePay imod gennem en betalingsudbyder. Går man direkte til MobilePays eget
ePayment-API, er der **ingen månedlig betaling**, kun 0,59 % + 1 kr. pr.
transaktion.

Alle færdige alternativer koster mere: Fresha 105 kr./md., Planway 139 kr./md.
pr. medarbejder, Pamp og Book.dk betalt efter prøveperiode. Derfor bygges
koblingen selv.

## Hvad der skal skaffes først

Begge dele er ventetid, ikke arbejde. Sæt dem i gang før alt andet.

1. **Bekræft at Cals gratis-plan har webhooks og API-nøgler.** Hele
   konstruktionen hviler på det, og det står ikke i dokumentationen. Spørg
   Cals support direkte.

2. **Handelsaftale til Vipps MobilePays ePayment API.** Søges i deres
   business-portal og skal stå i **Wiktorias CVR**, ikke Christians. Giver
   adgang til testmiljøet (Merchant Test) med det samme og til produktion
   efter godkendelse, som kan tage nogle hverdage.

   Nøgler der kommer ud af det: `client_id`, `client_secret`,
   `Ocp-Apim-Subscription-Key` og `Merchant-Serial-Number`.

3. **Cloudflare-konto på den Protonmail-adresse, der overdrages til hende.**
   Domænet skal oprettes dér fra starten, ikke flyttes bagefter.

## Forløbet

1. Kunden vælger en tid i den indlejrede Cal-kalender på sitet.
2. Cal opretter bookingen som **ikke-bekræftet** ("requires confirmation") og
   sender kunden videre til `/betal/?uid=...` via **Redirect on Booking**.
3. `/betal/` kalder Workeren med bookingens `uid`.
4. Workeren slår bookingen op **via Cals API** for at finde behandlingen, og
   regner depositummet ud som 50 % af prisen. Prisen tages fra sitets eget
   `/booking-prices.json`, som genereres af Hugo fra `data/services.yaml`.
5. Workeren opretter en MobilePay-betaling og får en `redirectUrl` retur.
   Bookingen gemmes som afventende i KV med et tidsstempel.
6. Kunden sendes til MobilePay, godkender, og lander på `/tak/`.
7. MobilePay kalder Workeren tilbage. Er betalingen gennemført, **bekræftes
   bookingen via Cals API**, og KV-posten fjernes.
8. En cron-trigger hvert 5. minut aflyser afventende bookinger, der er ældre
   end **30 minutter**. Tiden bliver fri igen.

Kalenderen holdes altså aldrig optaget af en ubetalt tid, og Wiktoria rører
ikke ved noget.

## Regler der ikke må brydes

**Beløbet må aldrig komme fra kunden.** Cal sender bookingdetaljer med som
query-parametre, og de kan redigeres i adresselinjen. Depositummet skal regnes
ud af Workeren efter opslag i Cals API. Ellers kan enhver booke en tid til
900 kr. og betale 1 krone.

**Verificér Cals webhook-signatur.** Cal sender HMAC-SHA256 i headeren
`x-cal-signature-256`. Uden det kan hvem som helst, der gætter URL'en,
bekræfte bookinger uden at betale.

**Verificér betalingen hos MobilePay, ikke i callbacket.** Et callback siger
kun at noget skete. Slå betalingen op med `GET /epayment/v1/payments/{ref}` og
bekræft først bookingen, når MobilePay selv siger den er gennemført.

**Brug idempotensnøgler.** MobilePays API kræver `Idempotency-Key`, og callbacks
kan komme mere end én gang. En booking må ikke kunne udløse to betalinger, og en
betaling må ikke kunne bekræfte den samme booking to gange.

**Ingen helbredsoplysninger i bookingen.** Politikken beder kunden oplyse om
allergier, retinol og Accutane. Det bliver i stolen. Bookingen tager navn,
mail, telefon og behandling — ikke andet.

## Teknisk opsætning

- **Cloudflare Worker** i hendes konto, med en route på `/api/*`.
- **KV namespace** til afventende bookinger.
- **Cron trigger** hvert 5. minut til at rydde op.
- **Secrets** som Worker secrets, aldrig i repoet: MobilePay-nøglerne og
  Cal-API-nøglen.

## Når det virker

- `data/site.yaml` → `booking.online: true` og `onlineEmbed` sat til hendes
  Cal-brugernavn.
- `calSlug` pr. behandling i `data/services.yaml`, så prislistens Book-knapper
  peger direkte på den rigtige tid.
- Prislistens depositum-note passer allerede: der står MobilePay.
- CSP i `static/_headers` skal ændres fra `app.cal.eu` til `app.cal.com` og
  have MobilePays domæne med.
- Test at kalenderen stadig først henter noget ved klik. Det er dét, der
  holder sitet fri for et cookiebanner.

## Kilder

- ePayment API, opret betaling:
  https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/operations/create/
- Cal webhooks og signatur: https://cal.com/docs/core-features/webhooks
- Cal Redirect on Booking:
  https://cal.com/help/event-types/booking-success-page-query-params
- Vipps MobilePay erhvervspriser: https://vippsmobilepay.com/da-DK/pricing
