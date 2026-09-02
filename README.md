# Wiktoria Gordon Beauty — hjemmeside

Elegant, hurtig **tosproget** one-page-hjemmeside til **Wiktoria Gordon Beauty**
(koreansk lash lift & brynstyling, Horsens). Bygget med [Hugo](https://gohugo.io/) —
statisk, gratis at hoste og lynhurtig. Ingen cookies, ingen tracking, self-hostede fonte
(GDPR-venligt).

- 🇩🇰 **Dansk** på `/`
- 🇬🇧 **Engelsk** på `/en/`
- Sprogskifter (DA · EN) i menuen — skifter automatisk mellem versionerne
- `hreflang`-tags så Google viser det rigtige sprog i søgeresultater

---

## ⚠️ Skal afklares før endelig overdragelse

Det redaktionelle indhold er udfyldt. Følgende skal stadig bekræftes:

| Hvad | Hvor | Bemærk |
|------|------|--------|
| **Klient-samtykke** | fotos i galleri/før-efter | Kunden på billederne skal have givet lov til brug på hjemmesiden. |
| **Sprogkorrektur** | dansk og engelsk indhold | Begge versioner skal have Wiktorias endelige godkendelse. |

---

## To sprog — sådan hænger det sammen

**Alt indhold findes i to versioner: `da:` (dansk) og `en:` (engelsk).**

I `data/`-filerne står de to sprog under hinanden. Ret teksten under det rigtige sprog —
og husk at rette **begge**, hvis du ændrer noget:

```yaml
da:
  hero:
    heading: "Dit smukkeste {jeg} – helt naturligt"
en:
  hero:
    heading: "Your most beautiful {you} — naturally"
```

> Behold rækkefølgen ens under `da:` og `en:` (fx behandlinger i samme orden), så pris,
> varighed og ikon passer sammen.

Korte knap-/menutekster (fx "Book tid", "Menu", "Populær") ligger i **`i18n/da.toml`** og
**`i18n/en.toml`** — én linje pr. sprog.

## Rediger indhold (ingen kodning)

- **`data/site.yaml`** — hero, "Om Wiktoria", priser-tekst, booking og sektionsoverskrifter.
- **`data/services.yaml`** — behandlinger, beskrivelser, **priser**, varighed + tilvalg.
- **`data/reviews.yaml`** — ordrette, ægte kundeanmeldelser.
- **`data/faq.yaml`** — spørgsmål/svar (bruges også til Googles FAQ-visning).
- **`data/gallery.yaml`** — galleriets billeder og billedtekster.
- **`data/seo.yaml`** — Google-titel, meta-beskrivelse og social link-preview pr. sprog.
- **`data/business.yaml`** — virksomhedsoplysninger, CVR og sociale/kontakt-links.
- **`i18n/da.toml` / `i18n/en.toml`** — korte UI-tekster (menu, knapper, footer, 404).

Alle almindelige indholds- og SEO-ændringer kan laves i `/admin/`. Domæne,
login/auth, layout og bookingintegration er bevidst ikke klientfelter.

## Billeder & video

Sitet bruger **rigtige fotos fra Wiktorias Instagram** (rå-materialet ligger i
`ig-posts/`, som **ikke** publiceres). De behandlede versioner ligger i `static/img/`:

- `hero-portrait.jpg` — hero-portræt (hvid blazer, beskåret fri af tekst)
- `about-portrait.jpg` — om-sektionen (studio-portræt, kontrast-forbedret)
- `ba-before.jpg` / `ba-after.jpg` — den interaktive **før/efter-slider**
- `gal-*.jpg` — galleriets fotos (nærbilleder af vipper, resultater, diptych)
- `og-card-v2.png` / `og-card-en-v2.png` (1200×630) — billederne der vises, når linket deles
- `favicon.svg` + `apple-touch-icon.png` (i `static/`) — fane-ikon

Skift almindeligvis billeder gennem `/admin/`; panelet synkroniserer delte
billeder på dansk og engelsk og komprimerer dem automatisk. Ved manuel
udskiftning ligger billedstierne i `data/images.yaml` og `data/gallery.yaml`.

## Kør lokalt

```bash
hugo server
# dansk:   http://localhost:1313/
# engelsk: http://localhost:1313/en/
```

## Byg til produktion

```bash
bash scripts/security-check.sh   # sikkerhedstjek + færdigt site i ./public
```

## Deploy (Cloudflare Pages)

1. Læg mappen i GitHub-repoet, der er forbundet med Cloudflare Pages.
2. Brug build-kommandoen `bash scripts/security-check.sh` og outputmappen `public`.
3. Sæt `HUGO_VERSION=0.163.2` i Cloudflare og forbind det endelige domæne.
4. Ret `baseURL` i `hugo.toml`, når domænet er aktivt.

## Tænd rigtig online-booking senere

Booking er lige nu en **placeholder**, der sender folk til Instagram-DM.
Koden bag den rigtige booking er skrevet og ligger klar: egen tidsvælger,
Cal.com til kalenderen og Vipps MobilePay til depositummet. Den venter kun på
nøglerne til MobilePays ePayment-API, som bestilles på hendes CVR.

Testforløbet, opsætningen og de tre ting, der let bliver gjort forkert, står i
`scripts/booking/PLAN.md`. Læs den, før noget røres.

Hele forløbet kan afprøves lokalt uden nøgler overhovedet:

    bash scripts/booking/dev.sh --stub

Når alle punkter i planen er testet mod Vipps' testmiljø, sættes
`MOBILEPAY_ENV` til `production` og `booking.online: true` på begge sprog. Der
bruges ikke længere et eksternt kalender-embed.

---

## Teknisk

- **Hugo** 0.163.2, multilingual (`da` som standard, `en` i undermappe)
- Fonte: *Cormorant Garamond* + *Jost*, self-hostede i `static/fonts/`
- Struktureret data (JSON-LD): `BeautySalon` + `FAQPage` pr. sprog for bedre Google-visning
- `hreflang` + `og:locale` sat korrekt for begge sprog
- Indhold virker også **uden JavaScript** (godt for søgemaskiner)

### Mappestruktur

```
hugo.toml                 # config + sprog + virksomhedsoplysninger
data/                     # ← AL redigerbar tekst (da: / en:)
i18n/                     # korte UI-tekster pr. sprog
content/_index.md         # dansk forside
content/_index.en.md      # engelsk forside
layouts/                  # skabeloner (behøver du normalt ikke røre)
  partials/sections/      # hver sektion af forsiden
static/
  img/                    # billeder (skift til dine egne)
  fonts/  css/  js/        # design & fonte
  _headers                # CSP, HSTS, noindex og øvrige browser-headere
scripts/security-check.sh # sikkerhedsregressioner + Hugo-produktionsbuild
wrangler.jsonc            # Cloudflare Pages-konfiguration
```

---

## Redigeringspanelet (`/admin/`)

Wiktoria retter selv priser, tekster, SEO, virksomhedslinks, spørgsmål/svar og billeder
i **Sveltia CMS** på `/admin/`. Hvert "gem" bliver en commit på `master`, som
Cloudflare Pages bygger. Der er intet abonnement og ingen betalt tjeneste i
kæden.

| Fil | Rolle |
|---|---|
| `static/admin/index.html` | Siden. Monterer CMS'et i `#nc-root`, så intro-teksten øverst bliver stående |
| `static/admin/admin.css` | Den enkle topbjælke omkring CMS'et; tilpasser sig lyst og mørkt systemtema |
| `content/admin/review.md` + `layouts/_default/admin-review.html` | Samlet DA/EN-teksteditor på `/admin/review/` |
| `static/admin/review.css` + `static/admin/review.js` | Lys/mørk styling, GitHub-login og samlet gemmeflow til teksteditoren |
| `static/admin/guide.html` | Permanent, ikke-indekseret redigeringsvejledning til kunde/marketingperson |
| `static/admin/config.yml` | Hele opsætningen: felter, hjælpetekster, billedbehandling |
| `static/admin/previews.js` | Branded live previews for alle tolv redigeringsområder |
| `static/admin/previews.css` | Preview-layout, typografi og mobiltilpasning |
| `static/admin/sveltia-cms.js` | **Selve CMS'et, version 0.195.0, som fil i repoet** |
| `data/*.yaml` | Indholdet. CMS'et skriver direkte i disse filer |
| `data/images.yaml` | De fire faste billeder (hero, portræt, før, efter) |

### Hvorfor CMS-kernen ligger i repoet

En opdatering opstrøms kan ikke ødelægge panelet fra den ene dag til den
anden. **Opdatering er en bevidst handling:** hent en ny version fra
`https://unpkg.com/@sveltia/cms@<version>/dist/sveltia-cms.js`, læg den her,
kontrollér dens SHA-256, test og commit. Sveltias billedbehandling henter stadig
eksakt versionslåste hjælpepakker fra UNPKG, når et billede behandles. Derfor
begrænser CSP'en UNPKG til `/admin/`, og panelet er ikke beskrevet som helt
offline.

### Nødudgang, hvis Sveltia en dag dør

`config.yml` er skrevet i Decap CMS' format. Skift `<script>`-linjen i
`index.html` til Decap, og panelet virker videre uden at røre configen.

### Billeder behandles i browseren

`media_libraries.default.config.transformations` konverterer alt til WebP,
maks. 2048 px, kvalitet 85, **før** filen committes. Et 4 MB telefonfoto
bliver ~200 KB. `slugify_filename` sikrer, at filnavne med mellemrum og æøå
ikke giver ødelagte URL'er. Uden dette bliver sitet langsomt inden for en
måned, uden at nogen kan se hvorfor.

Alle klientfelter accepterer kun JPEG, PNG og WebP. SVG og eksterne billed-URL'er
er bevidst blokeret, fordi aktive SVG-filer ellers kan køre JavaScript på samme
domæne som editorens GitHub-login.

### To sprog i én fil

`i18n.structure: single_file` betyder, at begge sprog ligger i samme fil med
`da:` og `en:` som øverste nøgler — præcis som filerne allerede så ud.
Wiktoria får en sprogfane frem for to ens formularer.

Felter og lister, der **ikke** skal oversættes, står som `i18n: duplicate`
(pris, varighed, ikon, billede, anmeldelsescitat og rækkefølge). Så kan de to
sprogversioner ikke komme ud af trit — kun den tekst, der faktisk skal
oversættes, er forskellig.

### Klientens arbejdsgang

1. Vælg sektion i `/admin/` (behandlinger, fotos, SEO osv.).
2. Ret både **DA**- og **EN**-fanen, hvor de vises, og kontrollér den visuelle preview ved siden af formularen.
3. Tryk **Save**. Det publicerer normalt via Cloudflare på 1–2 minutter.
4. Kontrollér både `/` og `/en/` bagefter.

På store skærme står formular og preview side om side. På telefon/tablet skifter
redaktøren mellem Edit og Preview i panelet. Previewens egne DA/EN-knapper ændrer
kun det viste sprog; de erstatter ikke oversættelsesfanerne i formularen. Alle ni
CMS-områder har en målrettet preview, og en fejl i preview-koden må ikke forhindre
selve CMS'et i at starte.

Topbjælken linker til en samlet teksteditor, hvor dansk og engelsk kan rettes
side om side og gemmes i én commit. Pilen ved Save i det normale CMS har også
**Save without publishing** til ufærdigt arbejde.
Tekniske booking-id'er er skjult, felter der ikke bruges på sitet er fjernet,
og SEO-tekster har længdevalidering. Ved en buildfejl beholder Cloudflare den
seneste fungerende deploy; ved en almindelig indholdsfejl kan committen rulles
tilbage via Git-historikken.

En ekstern marketingredaktør får sin **egen GitHub-bruger** med Write-adgang
til netop dette repo og logger ind gennem samme `/admin/`. Del aldrig Wiktorias
GitHub- eller Cloudflare-adgangskode. Fjern redaktørens repo-adgang igen ved
afsluttet samarbejde; så er hver ændring fortsat knyttet til en konkret bruger.

Hvis ændringer senere skal godkendes af en anden person før publicering, kan
Sveltias review-flow aktiveres med `publish_mode: editorial_workflow`. Det
opretter en separat GitHub pull request pr. redigering med Draft → In Review →
Ready → Publish. Lad simple workflow være standard, mens Wiktoria redigerer
alene; det er færre trin ved en almindelig pris- eller tekstændring.

### ⚠ Kommentarer i `data/*.yaml` forsvinder ved første gem

CMS'et skriver hele filen om. Alt, en redaktør skal vide, hører derfor i
`hint:`-felterne i `config.yml`, ikke i kommentarer i datafilerne. Alle gemte
datanøgler er dækket af CMS-skemaet, og Hugo-outputtet afhænger ikke af
YAML-formateringen.

### Før panelet virker i produktion

1. `backend.repo` i `config.yml` skal pege på **hendes** GitHub-konto.
2. `backend.base_url` skal pege på en udrullet
   [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) Cloudflare
   Worker i **hendes** Cloudflare-konto, plus en GitHub OAuth-app. Workeren
   findes, fordi ikke-tekniske brugere ellers selv skal håndtere en personlig
   access token. Panelet er sat til `auth_methods: [oauth]`, så PAT-login er
   lukket.

3. Ret `site_url` og `display_url` i `config.yml` fra demo-adressen til det
   endelige domæne. Test derefter login, ét uskadeligt tekst-gem, billed-upload,
   dansk/engelsk publicering og gendannelse af committen.

Gennemfør denne lille test igen ved overdragelse til en ny marketingredaktør og
mindst én gang om året, når den lokalt fastlåste Sveltia-version opdateres.

`/admin/` er lukket ude i `layouts/robots.txt`, har `noindex` i sidehovedet og
`X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` og en separat CSP i
`static/_headers`. Cloudflare **Always Use HTTPS** skal stadig slås til manuelt.

---

## Booking med MobilePay-depositum

Egen tidsvælger, Cal.com til kalenderen og Vipps MobilePay til et **fast
depositum på 200 kr.** Der indsamles fornavn, efternavn og telefonnummer, men
ingen mailadresse og ingen helbredsoplysninger.

Rækkefølgen er **reservér tiden, reservér beløbet, opret bookingen, hæv
beløbet**. Går noget galt undervejs, slippes beslaget på pengene, og kunden
bliver aldrig trukket. Det er ikke en detalje: hæves der først, skal der
refunderes i stedet, og så står der både en betaling og en tilbagebetaling på
kundens kontoudtog for en tid, hun aldrig fik.

    worker/index.js      ruter, validering, opslag af beløb og tid
    worker/payment.js    forløbet, som Durable Object med alarm
    worker/cal.js        kalenderen
    worker/mobilepay.js  betalingen
    static/js/booking.js tidsvælgeren
    static/js/thanks.js  kvitteringen på /tak/

Uden mailadresse er `/tak/` kundens eneste bevis på aftalen. Derfor viser den
tid, behandling, den fulde adresse og en kalenderfil. **Adressen ligger som
Worker-secret `SALON_ADDRESS` og ikke i `data/`**: `/tak/` er en offentlig
side, så alt der bygges ind i den, kan læses af enhver, der åbner adressen.
Sikkerhedstjekket nægter at bygge, hvis adressen dukker op i sitets filer.

Den fulde arkitektur, testlisten og afleveringschecklisten ligger i
`scripts/booking/PLAN.md`. Ældre planer med Stripe, 50 % depositum og et
Cal-embed er udgået og må ikke bruges.

## Efter ændringer i data/

Datafilerne og redigeringssystemet i `/admin/` hænger sammen tre steder, og
ingen af dem fejler højlydt, når de kommer ud af trit: et felt uden et felt i
`config.yml` bliver slettet, når Wiktoria gemmer; en samling uden preview
vises som ren tekst; og en preview kan pege på felter, der er flyttet.

    python3 scripts/cms-check.py

Kør den efter enhver ændring i `data/*.yaml`. Den ligger bevidst uden for
`build.sh`, så et manglende PyYAML på Cloudflare ikke kan stoppe et deploy
over noget, der kun handler om redigeringsoplevelsen.
