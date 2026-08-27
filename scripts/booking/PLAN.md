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

2. **Produktet "Payment Integration" hos Vipps MobilePay.** Hendes
   MyShop-aftale er IKKE nok. MyShop er den færdige løsning, hvor hun
   modtager betalinger manuelt; ePayment-API'et er et andet produkt, der
   bestilles for sig og opretter en salgsenhed med sit eget sæt nøgler.
   MyShop bliver som den er, til betaling i salonen.

   Det bestilles i portalen på hendes CVR. Testnøgler fås med det samme,
   produktion efter godkendelse, som kan tage nogle hverdage.

   **Hun skal ikke sende nøgler eller kodeord.** I stedet tilføjer hun
   Christian som portalbruger med **Assistant**-adgang, så han selv logger
   ind på portal.vippsmobilepay.com og henter dem under "For developers"
   → salgsenheden. Samme mønster som gæstebrugeren på one.com.

   Nøgler der skal bruges: `client_id`, `client_secret`,
   `Ocp-Apim-Subscription-Key` og `Merchant-Serial-Number` (MSN), i både
   test- og produktionsudgave.

3. **Cloudflare-konto på den Protonmail-adresse, der overdrages til hende.**
   Domænet skal oprettes dér fra starten, ikke flyttes bagefter.

## Hvorfor bookingen ikke går gennem Cals egen side

Første udkast lod Cal tage bookingen og sende kunden videre til betaling med
**Redirect on Booking**. Det virker ikke: API'et afviser feltet med 403 og
beskeden *"Redirect on booking is a feature for team plan users."* Alt andet
er testet og virker på gratis-planen — requires confirmation, buffer,
minimum notice og telefonfelt.

Derfor vendes forløbet om: bestillingen sker på hendes eget site, og
bookingen oprettes i Cal **først når depositummet er betalt**.

Det viste sig at være den bedre løsning:

- Ingen ubetalte bookinger findes nogensinde, så der er intet oprydningsjob,
  ingen 30-minutters frist og ingen cron-trigger.
- Intet webhook, og dermed ingen signaturverifikation at få galt i halsen.
- Cals embed forsvinder fra siden. Der er ingen tredjepart tilbage, som
  henter noget om den besøgende, og hele cookiebanner-spørgsmålet bortfalder.
- Bestillingen ser ud som resten af sitet i stedet for som en indlejret
  fremmed kalender.

Prisen er, at tidsvælgeren skal bygges. Det er en afgrænset opgave: hent
ledige tider, vis dem, send valget videre.

## Forløbet

1. Kunden vælger behandling og tid i sitets egen tidsvælger. Tiderne hentes
   fra Cals API gennem Workeren, så nøglen aldrig når browseren.
2. Hun indtaster fornavn, efternavn og telefon og sender af sted.
3. Workeren slår det faste depositum på 200 kr. op i sitets eget
   `/booking-prices.json`, genereret af Hugo fra
   `data/services.yaml`. Beløbet kommer aldrig fra browseren.
4. Workeren opretter en MobilePay-betaling og gemmer det valgte tidspunkt i
   KV under betalingens reference.
5. Kunden sendes til MobilePay, godkender, og lander på `/tak/`.
6. Workeren slår betalingen op hos MobilePay. Er den gennemført, **oprettes
   bookingen i Cal** via API'et og bekræftes med det samme via
   `POST /v2/bookings/{uid}/confirm`. KV-posten fjernes.

Betales der ikke, findes bookingen aldrig. Tiden var aldrig optaget.

## Hvorfor "requires confirmation" er tændt alligevel

Vores egen booking er altid betalt, inden den oprettes, så der skulle
principielt ikke være noget at bekræfte. Den er tændt af en anden grund:

Cals event types er **offentligt bookbare** på `cal.com/<bruger>/<slug>`.
Uden bekræftelse kunne enhver, der finder det link, booke uden om betalingen
og få en bekræftet tid gratis. At skjule event typen hjælper ikke; den kan
stadig bookes direkte på adressen.

Med den tændt lander sådan en booking som ikke-bekræftet, og Wiktoria kan
afvise den. Workeren bekræfter selv de betalte, så hun kun ser det, der ikke
er betalt for.

Event typerne er desuden skjult fra hendes Cal-profil, så den eneste
annoncerede vej til booking er hjemmesiden. Skjult er dog **ikke** en spærre
i sig selv: en skjult event type kan stadig bookes direkte på sin adresse.
Det er bekræftelsen der lukker den vej.

Feltet hedder `confirmationPolicy` og tager et objekt, ikke `requiresConfirmation`
som et ja/nej. API'et accepterer det forkerte navn uden at fejle og ignorerer
det derefter. Det er grunden til at opsætningsscriptet læser sine egne
indstillinger tilbage bagefter.

## Regler der ikke må brydes

**Beløbet må aldrig komme fra kunden.** Cal sender bookingdetaljer med som
query-parametre, og de kan redigeres i adresselinjen. Depositummet skal regnes
ud af Workeren efter opslag i Cals API. Ellers kan enhver booke en tid til
900 kr. og betale 1 krone.

**Verificér betalingen hos MobilePay, ikke i callbacket.** Et callback siger
kun at noget skete. Slå betalingen op med `GET /epayment/v1/payments/{ref}` og
bekræft først bookingen, når MobilePay selv siger den er gennemført.

**Brug idempotensnøgler.** MobilePays API kræver `Idempotency-Key`, og callbacks
kan komme mere end én gang. En booking må ikke kunne udløse to betalinger, og en
betaling må ikke kunne bekræfte den samme booking to gange.

**Ingen helbredsoplysninger i bookingen.** Politikken beder kunden oplyse om
allergier, retinol og Accutane. Det bliver i stolen. Bookingen tager fornavn,
efternavn, telefon og behandling — ikke andet.

**Ingen mailadresse.** Wiktorias eget valg (26/8-2026). Cal understøtter det:
telefon som påkrævet felt, mailfeltet skjult.

Konsekvensen skal håndteres på kvitteringssiden. Uden mail sender Cal ingen
bekræftelse, så kunden har intet at slå op i bagefter. Derfor skal `/tak/`
vise tid, behandling og adresse tydeligt OG tilbyde en kalenderfil, så
aftalen lander i kundens egen telefonkalender. Det er gratis og kræver ingen
tredjepart.

Udeblivelser er dækket af depositummet, som er en stærkere spærre end en
påmindelse. Vil hun senere have SMS-påmindelser, kan Cal det på gratis-planen,
men beskeder til danske numre trækker på et kreditkøb.

## Teknisk opsætning

- **Cloudflare Worker** i hendes konto, med en route på `/api/*`.
- **KV namespace** til betalinger, der afventer svar fra MobilePay.
- **Secrets** som Worker secrets, aldrig i repoet: MobilePay-nøglerne og
  Cal-API-nøglen.

Ingen cron-trigger. Der findes ingen ubetalte bookinger at rydde op efter.

## Når det virker

- `data/site.yaml` → `booking.online: true` på begge sprog.
- `calSlug` pr. behandling i `data/services.yaml`, så prislistens Book-knapper
  peger direkte på den rigtige tid.
- Prislistens depositum-note passer allerede: der står MobilePay.
- Den gamle Cal-embed-tilladelse skal fjernes fra CSP'en i `static/_headers`.
  Test derefter hele MobilePay-redirecten med den strammere politik.
- Test at kalenderen stadig først henter noget ved klik. Det er dét, der
  holder sitet fri for et cookiebanner.

## Hendes krav, 26/8-2026

Fra beskeder samme dag. Skrevet ned her, fordi de ændrer på kvitteringen
og på hvad der skal stå hvor.

- **Adressen er Fredericiagade 11/1, 8700 Horsens.** På sitet må kun
  gadenavnet stå, uden nummer. Den fulde adresse vises først EFTER
  depositummet er betalt.
- **Kvitteringssiden `/tak/` skal indeholde:** fuld adresse, noten om at
  møde op uden mascara, en påmindelse om politikken med link til den, og
  kontaktoplysninger (telefon, Instagram, Facebook).
- **Politikken skal vises FØR man betaler depositum**, og igen bagefter som
  en kort påmindelse om at den kan læses på sitet.
- **Politikken skal have sin egen side** i menuen på linje med behandlinger
  og priser, ikke kun en sektion på forsiden.
- **Hun booker selv kunder i salonen.** De fleste bestiller næste tid, mens
  de stadig sidder i stolen. Hun skal derfor kunne åbne kalenderen og
  ændre ledige tider uden besvær i hverdagen. Løsningen er, at hun blokerer
  tiden i sin egen Google- eller Apple-kalender, og Cal skjuler den
  automatisk. Det er lovet, og det skal testes, før det afleveres.

Afklaret efter denne runde: depositummet er fast 200 kr.; siden er dansk og
engelsk; der indsamles ingen mailadresse; og åbningstiderne er mandag–onsdag
10–19 og torsdag–fredag 10–16. Weekend er som udgangspunkt lukket.

## Kilder

- ePayment API, opret betaling:
  https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/operations/create/
- Cal webhooks og signatur: https://cal.com/docs/core-features/webhooks
- Cal Redirect on Booking:
  https://cal.com/help/event-types/booking-success-page-query-params
- Vipps MobilePay erhvervspriser: https://vippsmobilepay.com/da-DK/pricing
