# Online booking med MobilePay-depositum

Sådan hænger bookingen sammen, og hvad der mangler, før den kan tændes.
Skrevet 25/8-2026, rettet igennem 2/9-2026 efter et gennemsyn af logikken og
et tjek af Vipps' og Cals dokumentation.

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

Det er ventetid, ikke arbejde. Sæt det i gang før alt andet.

**Produktet "Payment Integration" hos Vipps MobilePay.** Hendes MyShop-aftale
er IKKE nok. MyShop er den færdige løsning, hvor hun modtager betalinger
manuelt; ePayment-API'et er et andet produkt, der bestilles for sig og
opretter en salgsenhed med sit eget sæt nøgler. MyShop bliver som den er, til
betaling i salonen.

Det bestilles i portalen på hendes CVR. Testnøgler fås med det samme,
produktion efter godkendelse, som kan tage nogle hverdage.

**Hun skal ikke sende nøgler eller kodeord.** I stedet tilføjer hun Christian
som portalbruger med **Assistant**-adgang, så han selv logger ind på
portal.vippsmobilepay.com og henter dem under "For developers" →
salgsenheden. Samme mønster som gæstebrugeren på one.com.

Nøgler der skal bruges: `client_id`, `client_secret`,
`Ocp-Apim-Subscription-Key` og `Merchant-Serial-Number` (MSN), i både test-
og produktionsudgave.

Cals gratis-plan er allerede bekræftet: API-nøgler virker, og alt det, der
bruges her, kan lade sig gøre uden abonnement.

## Hvorfor bookingen ikke går gennem Cals egen side

Første udkast lod Cal tage bookingen og sende kunden videre til betaling med
**Redirect on Booking**. Det virker ikke: API'et afviser feltet med 403 og
beskeden *"Redirect on booking is a feature for team plan users."* Alt andet
er testet og virker på gratis-planen.

Derfor vendes forløbet om: bestillingen sker på hendes eget site, og
bookingen oprettes i Cal **først når depositummet er godkendt**.

Det viste sig at være den bedre løsning:

- Ingen ubetalte bookinger findes nogensinde, så der er intet oprydningsjob.
- Cals embed forsvinder fra siden. Der er ingen tredjepart tilbage, som
  henter noget om den besøgende, og hele cookiebanner-spørgsmålet bortfalder.
- Bestillingen ser ud som resten af sitet i stedet for som en indlejret
  fremmed kalender.

Prisen er, at tidsvælgeren skulle bygges. Den står i
`layouts/partials/sections/booking-picker.html` og `static/js/booking.js`.

## Forløbet

1. Kunden vælger behandling og tid i sitets egen tidsvælger. Tiderne hentes
   fra Cals API gennem Workeren, så nøglen aldrig når browseren.
2. Hun indtaster fornavn, efternavn og telefon. Lige over knappen står
   depositummet og et link til politikken, som skal kunne læses INDEN der
   betales.
3. `POST /api/checkout`:
   - beløbet slås op i sitets eget `/booking-prices.json`, aldrig i formularen
   - tidspunktet holdes op mod Cals egne ledige tider
   - **tiden reserveres i Cal** i 10 minutter
   - betalingen oprettes hos MobilePay, som **reserverer** beløbet
   - alt gemmes i et Durable Object med betalingens reference som navn
4. Kunden sendes til MobilePay, godkender, og lander på `/tak/?ref=…`.
5. Kvitteringssiden spørger `/api/booking`, som gør resten:
   - **spørger MobilePay**, om betalingen er godkendt
   - opretter bookingen i Cal og bekræfter den med det samme
   - giver reservationen fri
   - **hæver først nu beløbet**

Betales der ikke, findes bookingen aldrig, og tiden gives fri af sig selv.

## De tre ting, der let bliver gjort forkert

Alle tre var fejl i den første udgave af den her plan. De er rettet i koden nu,
men de er nemme at lave om igen ved et uheld.

### 1. Tiden skal reserveres, mens kunden betaler

Bookingen oprettes efter betalingen, så tiden står ledig i hele det minut
eller to, betalingen tager. **To kunder kan nå at betale for samme tid.** Den
ene får så en betaling og ingen booking.

Der skal TO ting til, og det tog en måling at opdage:

**Cals reservation** (`POST /v2/slots/reservations`) lukker det lange vindue.
Står kunde A i MobilePay, er tiden væk fra vælgeren for alle andre, og
reservationen udløber af sig selv. Se `reserveSlot()` i `worker/cal.js`.

**Vores egen lås** lukker det korte. Checkout spørger først Cal "er tiden
ledig?" og reserverer bagefter, og imellem de to kald går der et par hundrede
millisekunder. Ved målingen 2/9-2026 gik to samtidige bestillinger på samme
tid BEGGE igennem: Cal siger ja til to reservationer på samme tid.

Derfor er der et Durable Object pr. TID, ikke kun pr. betaling, slået op under
`slot:<event type>:<tidspunkt>`. Der er præcis ét af det i verden, så kun den
første bestilling får lov. Se `claimSlot()` i `worker/payment.js`. Efter
rettelsen gav tre samtidige bestillinger én betaling og to gange 409.

Pengene var aldrig i fare i den mellemliggende udgave — den, der tabte, ville
få sin betaling annulleret og aldrig blive trukket. Men hun ville have betalt
først og fået beskeden bagefter.

### 2. Rækkefølgen er reservér, book, hæv

En godkendt betaling har kun lagt beslag på pengene. Går bookingen galt
bagefter, **annulleres beslaget, og kunden er aldrig blevet trukket**. Havde vi
hævet med det samme, skulle vi refundere i stedet, og så ville der stå både en
betaling og en tilbagebetaling på hendes kontoudtog for en tid, hun aldrig fik.

Det betyder også, at der SKAL hæves til sidst. En betaling, der kun er
godkendt, flytter ingen penge. Se `settle()` i `worker/payment.js`.

### 3. Kunden kommer måske aldrig tilbage

Hun kan godkende i MobilePay-appen og så lukke browseren. Så er der ingen, der
åbner `/tak/`, og uden videre ville der stå en godkendt betaling uden booking.

Det klares af en **alarm på det Durable Object, der hører til betalingen**. Den
stilles når betalingen oprettes og gør arbejdet færdigt, hvis ingen andre
gjorde det. Derfor er der stadig ingen cron-trigger og ingen liste at gennemgå:
oprydningen hører til den enkelte betaling og forsvinder sammen med den.

## Hvorfor et Durable Object og ikke KV

Forløbet skal ske i rækkefølge og præcis én gang. Kunden på `/tak/` spørger
"er der betalt?", og alarmen spørger om det samme. To samtidige svar må ikke
kunne oprette to bookinger.

KV kan ikke det: ingen lås, og skrivninger er kun i sidste ende konsistente, så
"læs, tjek, skriv" er et væddemål. Et Durable Object er ét sted i verden pr.
betaling med stærkt konsistent lager. Racet findes ikke længere i stedet for at
være gjort usandsynligt.

SQLite-baserede Durable Objects er med på Workers' fri plan. Derfor står der
`new_sqlite_classes` og ikke `new_classes` i `wrangler.jsonc`; med det sidste
ville deployet blive afvist på en konto uden abonnement.

## Hvorfor "requires confirmation" er tændt alligevel

⚠️ **Den har fået en anden grund til, og den er vigtigere end den oprindelige.**
Cal-issue #25009: bookinger oprettet med `POST /v2/bookings` bliver `accepted`,
men skrives ALDRIG ind i den forbundne kalender. Åbent siden november 2025.
En tidligere rettelse (#16512) fik synkroniseringen til at virke for
godkendelses-forløbet, og vores flow er præcis dét: opret som pending,
bekræft bagefter.

Målt 2/9-2026: en booking oprettet og bekræftet ad den vej lander korrekt i
kalenderen med adresse, telefonnummer og påmindelse.

**Slår nogen `confirmationPolicy` fra, fordi den ser overflødig ud, holder
bookingerne op med at komme i hendes kalender. Uden en fejlmeddelelse.**


Vores egen booking er altid betalt, inden den oprettes, så der skulle
principielt ikke være noget at bekræfte. Den er tændt af en anden grund:

Cals event types er **offentligt bookbare** på `cal.com/<bruger>/<slug>`.
Uden bekræftelse kunne enhver, der finder det link, booke uden om betalingen
og få en bekræftet tid gratis. At skjule event typen hjælper ikke; den kan
stadig bookes direkte på adressen.

Med den tændt lander sådan en booking som ikke-bekræftet, og Wiktoria kan
afvise den. Workeren bekræfter selv de betalte, så hun kun ser det, der ikke
er betalt for.

Feltet hedder `confirmationPolicy` og tager et objekt, ikke `requiresConfirmation`
som et ja/nej. API'et accepterer det forkerte navn uden at fejle og ignorerer
det derefter. Det er grunden til at opsætningsscriptet læser sine egne
indstillinger tilbage bagefter.

## Regler der ikke må brydes

**Beløbet må aldrig komme fra kunden.** Formularen kan redigeres. Depositummet
slås op i `/booking-prices.json`, som Hugo genererer fra prislisten, og
BELØBET tages altid fra den danske udgave, selv når kunden bruger den engelske
side. Ellers kunne de to filer komme ud af trit om penge.

**Tidspunktet må heller ikke.** Det holdes op mod Cals egne ledige tider i
`checkout()`, før der reserveres noget. Uden det kunne nogen bestille kl. 3 om
natten.

**Verificér betalingen hos MobilePay, ikke i callbacket.** At kunden lander på
`/tak/` betyder kun, at nogen åbnede den adresse. Slå betalingen op med
`GET /epayment/v1/payments/{ref}` og gør først noget, når MobilePay selv siger
den er godkendt.

**Brug idempotensnøgler.** MobilePays API kræver `Idempotency-Key`, og nøglen
skal være UDLEDT AF REFERENCEN og ikke tilfældig. En tilfældig nøgle pr. forsøg
laver dobbeltbetalinger ved et simpelt retry.

**Send kunden af sted med `location.href`, ikke med en formular.** CSP'ens
`form-action` er `'self'`, og Chrome tjekker også redirects mod den. Postes der
en formular til Workeren, som svarer 302 til MobilePay, bliver det blokeret.

**Ingen helbredsoplysninger i bookingen.** Politikken beder kunden oplyse om
allergier, retinol og Accutane. Det bliver i stolen. Bookingen tager fornavn,
efternavn, telefon og behandling, ikke andet.

**Ingen mailadresse.** Wiktorias eget valg (26/8-2026). Cal understøtter det:
`attendee.email` er valgfri, og med mailfeltet skjult på event typen laver Cal
selv en telefon-afledt pladsholder.

**Den fulde adresse må ikke bygges ind i sitet.** `/tak/` er en offentlig side.
Adressen ligger som Worker-secret `SALON_ADDRESS` og udleveres af
`/api/booking` FØRST når der er booket. `scripts/security-check.sh` nægter at
bygge, hvis den dukker op i `data/`, `layouts/`, `static/` eller `content/`.

## Teknisk opsætning

- **Cloudflare Worker** i hendes konto. Kører først på `/api/*`, `/auth` og
  `/callback`; resten af sitet serveres som statiske filer uden om koden.
- **Durable Object** `Payment`, ét pr. betaling. Ingen KV, ingen cron.
- **Rate limit** på `/api/checkout`, 8 forsøg pr. minut pr. IP.
- **Secrets**, aldrig i repoet:

      npx wrangler secret put CAL_API_KEY
      npx wrangler secret put MOBILEPAY_CLIENT_ID
      npx wrangler secret put MOBILEPAY_CLIENT_SECRET
      npx wrangler secret put MOBILEPAY_SUBSCRIPTION_KEY
      npx wrangler secret put MOBILEPAY_MSN
      npx wrangler secret put SALON_ADDRESS

- **`MOBILEPAY_ENV`** i `wrangler.jsonc` er den eneste kontakt med rigtige
  penge. Står der ikke `production`, rammer alt `apitest.vipps.no`.

### Filerne

    worker/index.js      ruter, validering, opslag af beløb og tid
    worker/payment.js    forløbet, som Durable Object med alarm
    worker/cal.js        kalenderen: tider, reservation, booking, bekræftelse
    worker/mobilepay.js  betalingen: token, opret, slå op, hæv, annullér
    static/js/booking.js tidsvælgeren
    static/js/thanks.js  kvitteringen

## Sådan køres det lokalt

    bash scripts/booking/dev.sh --stub

Opdigtet fra ende til anden, ingen nøgler nødvendige. Hele forløbet fra
tidsvælger til kvittering kan klikkes igennem, inklusive ventetilstanden.
Brug den til alt, der handler om, hvordan siderne opfører sig.

    bash scripts/booking/dev.sh

Rigtige tider fra Cal. Kræver `scripts/booking/.env`.

⚠️ **Betalingen kan ikke køres helt igennem lokalt.** MobilePay kræver https på
`returnUrl`, og localhost er http. Den del skal testes på et rigtigt deploy mod
`apitest.vipps.no`.

## Hvad der står i Cal lige nu

Læst tilbage fra hendes rigtige konto 2/9-2026 med:

    python3 scripts/booking/setup-cal.py --check

Den ændrer ingenting. Kør den igen efter enhver rettelse i Cal.

De ni event types findes, og de tre vigtigste ting er rigtige: `confirmationPolicy`
er `always`, telefonnummer er påkrævet, og varslet er 12 timer. **Der er slet
intet mailfelt**, fordi de er sat op som telefonbooking. Det er bedre end
planlagt: der er ikke engang et skjult felt at komme til at udfylde.

Resten står anderledes end `setup-cal.py` går ud fra. Ingen af delene er
nødvendigvis forkert, men de skal afgøres, og scriptet skal rettes til bagefter.

| | I Cal | Scriptet går ud fra |
|---|---|---|
| Varigheder | 30–120 min, forskellige | 60 og 120 |
| Buffer efter | 15 min | 0 |
| Skjult fra profilen | nej | ja |
| Navnefelt | ét fuldt navn | for- og efternavn |
| Sted | Cal Video | ikke sat |

**Navnefeltet er allerede håndteret.** `worker/cal.js` sender navnet som én
streng, fordi det er dét, Cal faktisk forventer. Skiftes feltet til
for- og efternavn, skal koden laves om samtidig; det står i en note i filen.

### Fire ting der SKAL rettes i Cal, før der åbnes

✅ **Nummer 2 og 3 er rettet 2/9-2026** med `setup-cal.py --apply`, sammen med
`hidden`. Nummer 1 og 4 står tilbage; nummer 1 kan kun rettes i hånden.

⚠️ **Faldgrube fundet samme dag:** sendes `bookingFields` UDEN en email-post,
genskaber Cal sit eget standardfelt som SYNLIGT OG PÅKRÆVET. Hele "ingen
mailadresse"-beslutningen kan altså rulles tilbage af ét `--apply`. Feltet
skal sendes med som `hidden: True`. Det står nu i scriptet, og `verify()`
regner et synligt mailfelt som en fejl.

1. **Den forbundne kalender er `spectrumfxdesigns@gmail.com`.** Det er
   Christians egen. Bookinger lander dér, og det er dén kalender, Cal tjekker
   for konflikter. Wiktoria kan altså ikke blokere en tid ved at gøre det i sin
   egen kalender, som hun har fået lovet. Skal skiftes til hendes.
2. **Åbningstiderne er mandag–fredag 09–17.** Aftalen er mandag–onsdag 10–19 og
   torsdag–fredag 10–16. Skemaet hedder "Working hours" og er hendes standard.
3. **Behandlingerne er sat op som Cal Video.** Det er fysiske tider i en salon.
   Skal være fremmøde. Bemærk at adressen så kommer til at stå på event typen i
   Cal; det er fint, den er ikke offentlig, men den skal stemme med
   `SALON_ADDRESS`.
4. **Den gamle CAL_API_KEY som Worker-secret er den, der blev tilbagekaldt.**
   Den skal sættes igen med den nye nøgle, ellers svarer `/api/slots` 502.

### Småting i hendes Cal-profil

Ikke teknisk vigtigt, men det er dét, hun selv og hendes kunder ser.

- Navnet står som "Wiktoria Goron". Der mangler et d.
- Tidsformatet er 12-timers. Sitets egen tidsvælger tvinger 24-timers, så
  kunden ser det rigtige, men alt hun selv kigger på i Cal viser AM/PM.
- Profilteksten siger "Trusted by +160 women". Sitet må ikke bære et
  anmeldelsestal, der ikke kan dokumenteres; `scripts/security-check.sh`
  afviser den slags i repoet. Cal-profilen er uden for den kontrol, men det er
  den samme påstand.

## Testrunden 2/9-2026

Kørt live mod hendes rigtige Cal-konto og MobilePays testmiljø
(`apitest.vipps.no`, MSN 2068956, Reserve Capture).

**Bestået:**

- Adgangstoken hentes og genbruges
- Ledige tider hentes fra kalenderen; depositummet slås korrekt op til 200 kr.
- Tiden reserveres i Cal, mens kunden betaler
- Betaling oprettes, kunden sendes til `pay-mt.mobilepay.dk`
- **Booking UDEN mailadresse virker.** Cal laver selv pladsholderen
  `4552615380@sms.cal.com` ud fra telefonnummeret. Der indsamles ingen mail
  noget sted, og bookingen bærer stadig et rigtigt telefonnummer.
- **Navnet som én streng virker.** "Test Testesen" kom rigtigt ind. Havde det
  været sendt som `{firstName, lastName}`, ville Cal have svaret 400.
- Bookingen oprettes og **bekræftes** af Workeren selv (`status: accepted`),
  så Wiktoria kun ser det, der ikke er betalt for
- Depositummet hæves; forløbet ender i `done`
- `metadata.paymentRef` binder bookingen til betalingen
- Tiden forsvinder fra tidsvælgeren bagefter, også nabotiderne, fordi
  bufferen på 15 min regnes med
- **Kvitteringen genindlæst fem gange gav én booking.** Idempotensen holder.
- **Alarmen gør arbejdet alene.** En betaling blev godkendt i appen, hvorefter
  browseren blev lukket, før den nåede `/tak/`. Tolv minutter senere stod
  bookingen i Cal som bekræftet, og beløbet var hævet, uden at nogen havde
  åbnet kvitteringen. Det er den vej, der findes for kunder, der lægger
  telefonen fra sig.
- **Tre samtidige bestillinger på samme tid gav én betaling og to gange 409.**
- **Sikkerhedsnettet:** en betaling, der aldrig blev godkendt, gik af sig selv
  fra `pending` til `cancelled`, tiden blev givet fri, ingen booking, ingen
  penge flyttet
- Afvisninger: ukendt behandling 400, ugyldig reference 400, ukendt booking 404
- CSP strammet uden at ødelægge forsiden eller CMS'et

**Fundet og rettet undervejs:**

- `bookingFieldsResponses.name` sendte et objekt til et felt, der forventer en
  streng. Hver eneste booking ville være blevet afvist. Se `worker/cal.js`.
- En forespørgsel på én enkelt dag (`from == to`) gav 400, fordi der blev
  krævet `end > start`, mens Cals `end` er inklusiv.

**Fundet i selve testen, og rettet:**

- To samtidige bestillinger på samme tid gik begge igennem. Cals reservation
  alene lukker ikke det vindue. Se punkt 1 ovenfor.
- Hele sitet lå også på `w-website.wiktoriagordon.workers.dev` uden `noindex`.

**Fundet på telefonen, og rettet:**

- Kalenderknappen hentede bare en fil ned. Filen blev bygget som en Blob i
  browseren og hængt på et `<a download>`, og på en telefon gør "download"
  præcis det, ordet siger: filen lander i overførsler, og kalenderen bliver
  aldrig åbnet. Kunden står med en fil, hun ikke ved hvad hun skal med, og
  uden mailadresse er det hendes eneste aftale.

  Nu serveres den fra `GET /api/booking.ics` med `text/calendar` og
  `Content-Disposition: inline`, og linket har ingen download-attribut. Så
  åbner iOS kalenderens "Tilføj begivenhed" direkte, og Android lægger den i
  overførsler, hvor et tryk åbner kalenderen. Se `worker/ics.js`.
  Filen har også fået en påmindelse dagen før; uden mail er kundens egen
  kalender det eneste, der kan minde hende om tiden.

**Fundet ved brug på en rigtig telefon, og rettet:**

- Kvitteringen gav op efter halvandet minut og skrev *"Vi kunne ikke finde den
  booking"*. En kunde, der lige har betalt 200 kr., læser det som at pengene er
  væk. Den venter nu fem minutter, siger efter et minut at den venter på HENDE,
  og skelner mellem en ukendt reference og et udløbet vindue.
- **En serverfejl så præcis ud som "venter stadig".** Siden prøvede bare igen
  og snurrede videre, uanset hvad der var galt. Ti fejl i træk giver nu besked.
- **Oprydning kunne forhindre en slutstatus.** Fejlede `cancelPayment` eller
  frigivelsen af tiden på en fejlsti, slap undtagelsen ud af `settle()`, og
  betalingen blev aldrig skrevet ned som `failed` eller `cancelled`. Så stod
  den som `pending` for evigt, og kunden så en side, der ventede uendeligt.
  Begge dele er nu pakket ind: de udløber alligevel af sig selv.
- Logning slået til i `wrangler.jsonc`. Uden den var en fejl i bookingen
  usynlig bagefter, og det var netop dét, der gjorde ovenstående svært at
  finde. Loggen står i dashboardet under Workers → w-website → Logs.

**Afklaret undervejs:**

- **Vores egen reservation blokerer IKKE vores egen booking.** Testet direkte
  mod Cal 2/9-2026: reservér en tid, book den samme tid, den går igennem.
  Det var punkt 3 på listen herunder.

**Mangler stadig:**

- Kalenderfilen åbnet på en rigtig telefon efter rettelsen

## Det der skal testes mod testmiljøet

Rækkefølgen betyder noget: de tre første kan afsløre, at Cal opfører sig
anderledes end dokumentationen lover, og så skal resten laves om.

1. **Booking uden mailadresse.** `attendee.email` er dokumenteret som valgfri,
   men der er to åbne fejlrapporter hos Cal, der rører præcis den her sti
   (issue #25432 om skjult mailfelt, #24851 om `error_required_field`).
2. **Navnet som objekt.** Event typerne bruger `variant: firstAndLastName`,
   så `bookingFieldsResponses.name` sendes som `{firstName, lastName}`. Bliver
   det afvist, står svaret i loggen.
3. ✅ **Booking oven på vores egen reservation.** Testet 2/9-2026: reservationen
   holder andre ude, men ikke os selv. Bookingen går igennem.
4. Betal og kom tilbage: bookingen står i Cal som bekræftet, og beløbet er
   hævet i Vipps-portalen.
5. Fortryd i MobilePay: ingen booking, ingen hævning, tiden ledig igen.
6. **Luk browseren efter godkendelse.** Bookingen skal alligevel stå der efter
   godt ti minutter. Det er alarmen, der beviser sig selv.

   ✅ **Den modsatte vej er kørt 2/9-2026 mod testmiljøet:** en betaling, der
   ALDRIG blev godkendt, gik af sig selv fra `pending` til `cancelled`, tiden
   blev givet fri i Cal igen, og der blev ikke oprettet nogen booking. Selve
   alarmen virker altså; det der mangler, er den samme vej med en godkendt
   betaling.
7. **To faner på samme tid.** Begge betaler; kun én får en booking, og den
   anden er ikke blevet trukket.
8. Genindlæs `/tak/` et par gange. Der må ikke komme en booking mere.
9. Kalenderfilen kan hentes og lander rigtigt i telefonens kalender. Tjek at
   CSP'en ikke spærrer for downloaden.
10. **Hun blokerer en tid i sin egen Google- eller Apple-kalender**, og den
    forsvinder fra tidsvælgeren. Det er lovet, og det skal ses virke.
11. Prøv at bestille en tid, der ikke findes, ved at rette i forespørgslen.
    Den skal afvises med 409.

## Når det virker

- **Sluk workers.dev-adressen.** `"workers_dev": false` i `wrangler.jsonc`.
  Så længe den er tændt, ligger hele sitet også på
  `w-website.wiktoriagordon.workers.dev`. Den har fået `noindex` i `_headers`,
  men en adresse, der ikke findes, er bedre end en, der beder pænt.

- `MOBILEPAY_ENV` sættes til `production` i `wrangler.jsonc`.
- Produktionsnøglerne lægges ind med `wrangler secret put`.
- `data/site.yaml` → `booking.online: true` på begge sprog.
- Prislistens depositum-note passer allerede: der står MobilePay.
- Cal-embedden og dens CSP-undtagelse er allerede væk, og
  `scripts/security-check.sh` nægter at bygge, hvis de kommer tilbage.

## Hendes krav, 26/8-2026

Fra beskeder samme dag.

- **Adressen er Fredericiagade 11/1, 8700 Horsens.** På sitet må kun
  gadenavnet stå, uden nummer. Den fulde adresse vises først EFTER
  depositummet er betalt. ✅ Løst med `SALON_ADDRESS` som Worker-secret.
- **Kvitteringssiden `/tak/` skal indeholde:** fuld adresse, noten om at
  møde op uden mascara, en påmindelse om politikken med link til den, og
  kontaktoplysninger (telefon, Instagram, Facebook). ✅
- **Politikken skal vises FØR man betaler depositum**, og igen bagefter som
  en kort påmindelse. ✅
- **Politikken skal have sin egen side** i menuen. ✅
- **Hun booker selv kunder i salonen.** De fleste bestiller næste tid, mens
  de stadig sidder i stolen. Løsningen er, at hun blokerer tiden i sin egen
  Google- eller Apple-kalender, og Cal skjuler den automatisk. Skal testes,
  se punkt 10 ovenfor.

Afklaret: depositummet er fast 200 kr.; siden er dansk og engelsk; der
indsamles ingen mailadresse; åbningstiderne er mandag–onsdag 10–19 og
torsdag–fredag 10–16.

**Brynopmåling & formning betales fuldt ud forud.** Behandlingen koster 200 kr.
og depositummet er 200 kr., så depositummet ER hele prisen, og det refunderes
ikke. Bekræftet 2/9-2026. Sådan gør koden det allerede; clampen i
`layouts/index.bookingprices.json` sørger for, at depositummet aldrig kan
overstige prisen.

**Adressen udleveres kun efter betalt depositum.** Bekræftet 2/9-2026. Den
ligger som Worker-secret og bygges aldrig ind i en side.

## Det ene sted, hun skal holde øje

Går alt galt på én gang, kan en booking stå oprettet, mens depositummet ikke
kunne hæves. Kunden har sin tid og ser en gyldig kvittering, som hun skal, men
pengene mangler. Workeren prøver igen seks gange over en halv time og skriver
derefter i loggen:

    depositum kunne ikke hæves, se betalingen i Vipps-portalen: wg-…

Det er den eneste situation, der kræver en hånd. Den har ikke sin egen besked
til hende, fordi der ikke indsamles en mailadresse noget sted i systemet.

## Kilder

Alle slået op 2/9-2026.

- ePayment, opret betaling:
  https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/operations/create/
- ePayment, betalingstilstande:
  https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/operations/payment-states/
- ePayment, hæv:
  https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/operations/capture/
- Adgangstoken (1 time i test, 24 timer i produktion):
  https://developer.vippsmobilepay.com/docs/APIs/access-token-api/standard-authentication/
- Cal, opret booking (`cal-api-version: 2026-02-25`):
  https://cal.com/docs/api-reference/v2/bookings/create-a-booking
- Cal, reservér tid (`cal-api-version: 2024-09-04`):
  https://cal.com/docs/api-reference/v2/slots/reserve-a-slot
- Durable Objects på fri plan:
  https://developers.cloudflare.com/durable-objects/
- Vipps MobilePay erhvervspriser: https://vippsmobilepay.com/da-DK/pricing
