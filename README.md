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

Nogle ting er **placeholders**, jeg har gættet — tjek dem med Wiktoria:

| Hvad | Hvor | Bemærk |
|------|------|--------|
| **Priser** | `data/services.yaml` | Vejledende gæt — ret til de rigtige priser. |
| **Åbningstider** | `data/site.yaml` → `contact.hours` | Ret til de rigtige tider. |
| **Domæne** | `hugo.toml` → `baseURL` | Sat til `www.wiktoriagordon.dk` — ret til det rigtige domæne. |
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

- **`data/site.yaml`** — hero, "Om Wiktoria", priser-tekst, booking, kontakt, åbningstider.
- **`data/services.yaml`** — behandlinger, beskrivelser, **priser**, varighed + tilvalg.
- **`data/reviews.yaml`** — anmeldelser og samlet vurdering.
- **`data/faq.yaml`** — spørgsmål/svar (bruges også til Googles FAQ-visning).
- **`data/gallery.yaml`** — galleriets billeder og billedtekster.
- **`i18n/da.toml` / `i18n/en.toml`** — korte UI-tekster (menu, knapper, footer, 404).

Virksomhedens faste oplysninger (navn, CVR, Instagram, by — ens på begge sprog) står i
**`hugo.toml`** under `[params]`. Sprog-specifikke ting (tagline, meta-beskrivelse) står
under `[languages.da.params]` og `[languages.en.params]`.

## Billeder & video

Sitet bruger **rigtige fotos fra Wiktorias Instagram** (rå-materialet ligger i
`ig-posts/`, som **ikke** publiceres). De behandlede versioner ligger i `static/img/`:

- `hero-portrait.jpg` — hero-portræt (hvid blazer, beskåret fri af tekst)
- `about-portrait.jpg` — om-sektionen (studio-portræt, kontrast-forbedret)
- `ba-before.jpg` / `ba-after.jpg` — den interaktive **før/efter-slider**
- `gal-*.jpg` — galleriets fotos (nærbilleder af vipper, resultater, diptych)
- `og-card.png` (1200×630) — billedet der vises, når linket deles
- `favicon.svg` + `apple-touch-icon.png` (i `static/`) — fane-ikon

Vil du skifte et billede: læg en ny `.jpg` i `static/img/` og ret stien i
`data/gallery.yaml` (under **både** `da:` og `en:`).
Tip: ~1200 px på den korte led, jpg-kvalitet ~85.

## Kør lokalt

```bash
hugo server
# dansk:   http://localhost:1313/
# engelsk: http://localhost:1313/en/
```

## Byg til produktion

```bash
hugo --gc --minify      # færdigt site i ./public
```

## Deploy (Vercel)

1. Læg mappen i et Git-repo (GitHub/GitLab).
2. Importér i Vercel → den bruger automatisk `vercel.json` (bygger med Hugo 0.163.2).
3. Sæt jeres domæne på i Vercel → Settings → Domains, og ret `baseURL` i `hugo.toml`.

Kan også hostes på Netlify, Cloudflare Pages, GitHub Pages m.fl. — det er bare statiske filer.

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
vercel.json               # deploy-opsætning
```
