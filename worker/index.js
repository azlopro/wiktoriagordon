/**
 * Bookingens serverdel.
 *
 * Kører foran de statiske filer på /api/*, resten serveres som før.
 *
 * TO TING MÅ ALDRIG KOMME FRA BROWSEREN: nøglerne og beløbet. Nøglerne ligger
 * som Worker-secrets. Beløbet slås op i /booking-prices.json, som Hugo
 * genererer fra prislisten. Kom beløbet fra formularen, kunne enhver booke det
 * store sæt til 900 kr. og betale én krone.
 *
 * Tidspunktet kommer heller ikke fra browseren uden videre. Det bliver holdt op
 * mod Cals egne ledige tider, før der reserveres noget, så en redigeret
 * forespørgsel ikke kan booke uden for åbningstid.
 *
 * Selve forløbet står i worker/payment.js. Her er kun døren ind.
 */

import { handleAuth, handleCallback } from './auth.js';
import * as cal from './cal.js';
import * as mp from './mobilepay.js';

export { Payment } from './payment.js';
import { slotKey, HOLD_MS } from './payment.js';
import { buildIcs } from './ics.js';

const MAX_DAYS = 62; // så ingen kan bede om ledige tider ti år frem
const MAX_BODY = 2048; // en bestilling er små hundrede bytes

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const fail = (status, message) => json({ error: message }, status);

/**
 * Behandlingerne der må bookes.
 *
 * Titlen hentes på kundens eget sprog, men BELØBET tages altid fra den danske
 * fil. De to filer genereres fra samme prisliste og skulle være ens, men
 * "skulle være" er ikke godt nok, når det er penge: så er der ét sted, hvor
 * depositummet står, og ikke to der kan komme ud af trit.
 */
async function treatments(env, lang) {
  const load = async (path) => {
    const res = await env.ASSETS.fetch(new Request(`https://site${path}`));
    if (!res.ok) throw new Error(`${path} mangler`);
    return res.json();
  };
  const da = await load('/booking-prices.json');
  if (lang !== 'en') return da;

  const en = await load('/en/booking-prices.json');
  const merged = {};
  for (const [slug, t] of Object.entries(da.treatments)) {
    /* Titlen fra kundens sprog, resten af posten — altså beløbene — fra dansk. */
    merged[slug] = { ...t, title: (en.treatments[slug] || t).title };
  }
  /* Den engelske fil er grundlaget, fordi ALT tekst skal være på kundens
     sprog: noten i kalenderfilen og ordet "Deposit" i MobilePay-historikken.
     Beløbene lægges tilbage ovenpå fra den danske, som er den ene kilde.
     Blev det gjort omvendt, ville en engelsk kunde få en dansk kalendernote,
     og det gjorde den indtil 2/9-2026. */
  return { ...en, currency: da.currency, depositOere: da.depositOere, treatments: merged };
}

/* --- ledige tider ------------------------------------------------------- */

/** Kun datoer på formen ÅÅÅÅ-MM-DD, og kun et interval der giver mening. */
function parseRange(url) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date().toISOString().slice(0, 10);
  let from = url.searchParams.get('from') || today;
  const to = url.searchParams.get('to');
  if (!iso.test(from) || (to && !iso.test(to))) return null;

  /* Der er ingen ledige tider i fortiden. At spørge om dem er ikke farligt,
     men det er et kald til Cal, som ingen får noget ud af. */
  if (from < today) from = today;

  const start = new Date(`${from}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = to ? new Date(`${to}T00:00:00Z`) : new Date(start.getTime() + 14 * 864e5);
  /* Cals "end" er INKLUSIV, så from == to betyder én enkelt dag og er en
     fuldt gyldig forespørgsel. Kun baglæns intervaller afvises. */
  if (Number.isNaN(end.getTime()) || end < start) return null;
  if ((end - start) / 864e5 > MAX_DAYS) return null;
  return { from, to: end.toISOString().slice(0, 10) };
}

async function slots(url, env) {
  const slug = url.searchParams.get('treatment') || '';
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'da';
  const prices = await treatments(env, lang);
  const treatment = prices.treatments[slug];
  /* Ukendt slug afvises her, så Workeren ikke kan bruges som en åben proxy
     ind i Cal-kontoen. */
  if (!treatment) return fail(400, 'ukendt behandling');

  const range = parseRange(url);
  if (!range) return fail(400, 'ugyldigt datointerval');

  const id = await cal.eventTypeId(slug, env);
  if (!id) return fail(503, 'behandlingen findes ikke i kalenderen endnu');

  const data = await cal.slots(id, range.from, range.to, env);

  /* Kun starttidspunkterne sendes videre. Cals svar indeholder felter, der
     ikke rager den besøgende, og formen kan ændre sig uden varsel. */
  const days = {};
  for (const [day, list] of Object.entries(data)) {
    const times = (list || []).map((s) => s.start).filter(Boolean);
    if (times.length) days[day] = times;
  }

  return json({
    treatment: { slug, title: treatment.title, depositOere: treatment.depositOere },
    timeZone: cal.TZ,
    days,
  });
}

/* --- bestilling --------------------------------------------------------- */

function name(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  return s.length >= 1 && s.length <= 60 ? s : null;
}

/**
 * Telefonnummer på E.164-form.
 *
 * Otte cifre er et dansk nummer uden landekode, og det er sådan folk skriver
 * deres eget. Alt andet skal have landekoden med.
 */
function phone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = `45${d}`;
  if (d.length < 10 || d.length > 15) return null;
  return `+${d}`;
}

async function checkout(request, url, env) {
  if (!mp.isConfigured(env)) return fail(503, 'betaling er ikke sat op endnu');

  /* En grænse pr. IP. Den er per Cloudflare-lokation og dermed ikke en
     nøjagtig optælling, men den er nok til at et script ikke kan sidde og
     oprette betalinger i hendes navn. */
  if (env.CHECKOUT_LIMIT) {
    const ip = request.headers.get('cf-connecting-ip') || 'ukendt';
    const { success } = await env.CHECKOUT_LIMIT.limit({ key: ip });
    if (!success) return fail(429, 'for mange forsøg, prøv igen om lidt');
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail(413, 'for stor forespørgsel');
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, 'ugyldig forespørgsel');
  }

  const lang = body.lang === 'en' ? 'en' : 'da';
  const slug = String(body.treatment || '');
  const prices = await treatments(env, lang);
  const treatment = prices.treatments[slug];
  if (!treatment) return fail(400, 'ukendt behandling');

  const firstName = name(body.firstName);
  const lastName = name(body.lastName);
  const tel = phone(body.phone);
  if (!firstName || !lastName || !tel) return fail(400, 'udfyld navn og telefonnummer');

  const start = new Date(String(body.start || ''));
  if (Number.isNaN(start.getTime())) return fail(400, 'ugyldigt tidspunkt');
  const startUTC = start.toISOString();

  const id = await cal.eventTypeId(slug, env);
  if (!id) return fail(503, 'behandlingen findes ikke i kalenderen endnu');

  /* TIDSPUNKTET SKAL VÆRE ET, CAL SELV TILBYDER.
     Formularen kan redigeres, og uden det her kunne nogen bestille kl. 3 om
     natten eller oven i en tid, der allerede er optaget. Vi spørger om dagen
     omkring valget og kræver et præcist match. */
  const day = startUTC.slice(0, 10);
  const next = new Date(start.getTime() + 864e5).toISOString().slice(0, 10);
  const available = await cal.slots(id, day, next, env);
  const offered = Object.values(available)
    .flat()
    .some((s) => s.start && new Date(s.start).toISOString() === startUTC);
  if (!offered) return fail(409, 'tiden er ikke længere ledig');

  /* LÅSEN PÅ TIDEN. Sidste skridt før der bliver bedt om penge.
     Tjekket ovenfor spørger Cal, om tiden er ledig, men mellem det svar og
     reservationen går der et par hundrede millisekunder, og rammer to
     bestillinger det vindue, siger Cal ja til dem begge. Målt 2/9-2026.
     Her afgøres det i stedet ét sted i verden: der er præcis ét Durable
     Object pr. tid, og kun den første får lov. Se claimSlot() i payment.js. */
  const lock = env.PAYMENT.get(env.PAYMENT.idFromName(slotKey(id, startUTC)));
  if (!(await lock.claimSlot(HOLD_MS))) return fail(409, 'tiden er ikke længere ledig');

  const reference = mp.newReference();
  const path = lang === 'en' ? '/en/thanks/' : '/tak/';
  const returnUrl = `${url.origin}${path}?ref=${reference}`;

  const stub = env.PAYMENT.get(env.PAYMENT.idFromName(reference));
  const { redirectUrl } = await stub.start({
    reference,
    eventTypeId: id,
    slug,
    title: treatment.title,
    depositOere: treatment.depositOere,
    start: startUTC,
    firstName,
    lastName,
    phone: tel,
    lang,
    depositLabel: prices.depositLabel || 'Depositum',
    returnUrl,
  });

  /* Kunden sendes videre med location.href i browseren, IKKE ved at Workeren
     svarer 302 på en formular-post. CSP'ens form-action tillader kun 'self',
     og Chrome tjekker også redirects mod den.

     Referencen sendes med, selvom browseren ikke bruger den til noget: den
     står alligevel i returnUrl et øjeblik efter. Den er her, så en betaling
     kan følges fra det øjeblik den oprettes, uden at skulle graves ud af en
     redirect, der allerede er sket. Det er forskellen på at kunne fejlsøge
     en booking og ikke at kunne. */
  return json({ redirectUrl, reference });
}

/** Kvitteringssidens opslag. Den spørger igen, indtil der er et svar. */
async function bookingStatus(url, env) {
  const ref = url.searchParams.get('ref') || '';
  if (!/^wg-[0-9a-f]{32}$/.test(ref)) return fail(400, 'ugyldig reference');

  const stub = env.PAYMENT.get(env.PAYMENT.idFromName(ref));
  const state = await stub.status();
  if (!state) return fail(404, 'ukendt booking');
  return json(state);
}

/**
 * Kalenderfilen.
 *
 * Serveres som text/calendar fra en rigtig adresse, IKKE som en Blob med
 * download-attribut i browseren. Se worker/ics.js for hvorfor: på en telefon
 * gør "download" præcis det, ordet siger, og kalenderen bliver aldrig åbnet.
 *
 * Content-Disposition er "inline". Med "attachment" ville iOS gemme filen i
 * stedet for at åbne kalenderen.
 */
async function bookingIcs(url, env) {
  const ref = url.searchParams.get('ref') || '';
  if (!/^wg-[0-9a-f]{32}$/.test(ref)) return fail(400, 'ugyldig reference');

  const state = await env.PAYMENT.get(env.PAYMENT.idFromName(ref)).status();
  if (!state) return fail(404, 'ukendt booking');
  /* Ingen fil før der er booket. Ellers kunne en afbrudt betaling lægge en
     aftale i kundens kalender, som ikke findes. */
  if (!['booked', 'done', 'review'].includes(state.status)) {
    return fail(409, 'der er ingen booking endnu');
  }

  const prices = await treatments(env, state.lang);
  return new Response(
    buildIcs({
      reference: ref,
      title: state.title,
      start: state.start,
      end: state.end,
      address: state.address,
      business: prices.businessName,
      note: prices.calendarNote,
    }),
    {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'inline; filename="booking.ics"',
        'cache-control': 'no-store',
      },
    },
  );
}

/* --- ruter -------------------------------------------------------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    /* Login til /admin/. Ligger på /auth og /callback, fordi det er dér
       Sveltia CMS forventer dem, og fordi GitHubs callback-adresse skal
       registreres som en fast URL. */
    if (path === '/auth') return handleAuth(url, env);
    if (path === '/callback') return await handleCallback(request, url, env);

    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      if (request.method === 'GET') {
        if (path === '/api/slots') return await slots(url, env);
        if (path === '/api/booking') return await bookingStatus(url, env);
        if (path === '/api/booking.ics') return await bookingIcs(url, env);
      } else if (request.method === 'POST') {
        if (path === '/api/checkout') return await checkout(request, url, env);
      } else {
        return fail(405, 'metoden er ikke tilladt her');
      }
      return fail(404, 'ukendt endepunkt');
    } catch (err) {
      console.error(path, err);
      return fail(502, 'noget gik galt. Prøv igen om lidt.');
    }
  },
};
