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

## ⚠️ Skal rettes før siden går live

Nogle oplysninger mangler stadig og skal afklares med Wiktoria:

| Hvad | Hvor | Bemærk |
|------|------|--------|
| **Varigheder** | `data/services.yaml` | Mangler for alle behandlinger og skal udfyldes før online-booking. |
| **Domæne** | `hugo.toml` → `baseURL` | Sat til demo-domænet — ret til det endelige domæne ved lancering. |
| **Klient-samtykke** | fotos i galleri/før-efter | Kunden på billederne skal have givet lov til brug på hjemmesiden. |

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

Booking er lige nu en **placeholder** der sender folk til Instagram-DM. Når I vælger et
system (fx Fresha, Calendly, Setmore):

1. Åbn `data/site.yaml` → `booking` (husk **begge** sprog, `da:` og `en:`).
2. Sæt `online: true`.
3. Indsæt embed-linket i `onlineEmbed: "..."`.

Så viser siden automatisk booking-kalenderen i stedet for DM-knappen.

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
| `static/admin/guide.html` | Permanent, ikke-indekseret redigeringsvejledning til kunde/marketingperson |
| `static/admin/config.yml` | Hele opsætningen: felter, hjælpetekster, billedbehandling |
| `static/admin/previews.js` | Branded live previews for alle ni redigeringsområder |
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

Pilen ved Save har også **Save without publishing** til ufærdigt arbejde.
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

## Booking med depositum (Cal.com + Stripe)

Kunden vælger behandling, betaler 50 % i depositum, og **tiden reserveres først,
når betalingen er gået igennem**. Wiktoria skal aldrig afstemme MobilePay mod
kalenderen i hånden.

### Hvorfor det passer til hendes politik

Cal.com **fjernede automatisk refundering** i version 3.9 (marts 2024, PR #13924).
Et afbud udløser derfor ingen tilbagebetaling — refundering er en bevidst handling
i Stripe. Hendes "50 % non-refundable" holder altså som skrevet.

"Depositummet overføres til næste tid" løses af **ombooking**: flytter kunden
tiden, følger betalingen med. Aflysning er noget andet end ombooking — præcis den
skelnen politikken gør. Test begge dele med en 1-kr-event, før I går live.

### Konti — begge i HENDES navn

1. **Stripe**: stripe.com, CVR 45930238, bankkonto, legitimation. Ca. 15 min.
2. **Cal.com**: konto på `app.cal.eu` (EU-hostet). Forbind hendes kalender, og
   installér Stripe-appen derinde.

### De ni events

Depositum er 50 % af prisen. **Varigheder mangler — de skal komme fra hende.**

| Behandling | Pris | Depositum | Varighed |
|---|---|---|---|
| Koreansk lash lift + farve | 500 kr | 250 kr | ? |
| Brynlaminering + farve | 500 kr | 250 kr | ? |
| Brynlaminering | 450 kr | 225 kr | ? |
| Brynfarve | 400 kr | 200 kr | ? |
| Brynformning | 200 kr | 100 kr | ? |
| Lash lift + brynlaminering + farve | 900 kr | 450 kr | ? |
| Lash lift + brynlaminering | 850 kr | 425 kr | ? |
| Lash lift + brynfarve | 800 kr | 400 kr | ? |
| Lash lift + brynformning | 600 kr | 300 kr | ? |

### Booking-spørgsmål — på hvert event

1. **Telefonnummer** — spørgsmålstypen skal være **Short Text**, ikke "Phone
   number". Cals telefonfelt tvinger amerikansk landekode, og det kan ikke
   rettes. Kendt, uløst fejl.
2. **Er det din første gang hos mig?** — ja/nej.
3. **Allergier, sygdomme, eller brug af retinol eller Accutane?** — langt
   tekstfelt, **påkrævet**. Det er hendes Sikkerheds-punkt gjort til et felt,
   hun kan holde folk op på.
4. **Jeg har læst og accepterer salonens politik** — afkrydsningsfelt,
   **påkrævet**, med link til `/#politik`.

### Grænser pr. event ("Limits & buffers")

Sættes i Cals dashboard, ikke i koden. **Alle fire tal mangler fra hende:**
pause mellem to kunder · hvor langt frem man kan booke · hvor sent man kan
booke · maks. kunder pr. dag. Aflysningsfristen sættes til **24 timer**, så den
matcher politikken.

### Til sidst i sitet

- `data/site.yaml` → `booking.onlineEmbed` = hendes Cal-brugernavn
- `data/site.yaml` → `booking.online` = `true`
- `data/services.yaml` → `calSlug` på hver behandling = eventets slug

Så tænder Book-knapperne i prislisten af sig selv, én pr. behandling, og hver
knap peger på den rigtige tid med det rigtige depositum.

### Kalenderen henter først noget på klik

`layouts/partials/cal-embed.html` viser en knap i stedet for at indlæse Cal med
det samme. **Målt: nul forespørgsler til app.cal.eu ved sideindlæsning.** Fordi
Cal er sitets eneste tredjepart, og fonte og alt andet er selvhostet, betyder
det, at sitet **ikke behøver et cookie-banner**. Lægger man Cal ind som et
almindeligt script, gælder det ikke længere — så skal der bygges et banner.

## Efter ændringer i data/

Datafilerne og redigeringssystemet i `/admin/` hænger sammen tre steder, og
ingen af dem fejler højlydt, når de kommer ud af trit: et felt uden et felt i
`config.yml` bliver slettet, når Wiktoria gemmer; en samling uden preview
vises som ren tekst; og en preview kan pege på felter, der er flyttet.

    python3 scripts/cms-check.py

Kør den efter enhver ændring i `data/*.yaml`. Den ligger bevidst uden for
`build.sh`, så et manglende PyYAML på Cloudflare ikke kan stoppe et deploy
over noget, der kun handler om redigeringsoplevelsen.
