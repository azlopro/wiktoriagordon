/**
 * Bookingens serverdel.
 *
 * Kører foran de statiske filer på /api/*, resten serveres som før.
 *
 * Formålet er at holde to ting væk fra browseren: Cal-nøglen, og beløbet.
 * Nøglen ligger som Worker-secret. Beløbet slås op i /booking-prices.json,
 * som Hugo genererer fra prislisten, så en manipuleret forespørgsel ikke kan
 * flytte prisen på en behandling.
 */

const CAL = 'https://api.cal.com/v2';
const TZ = 'Europe/Copenhagen';
const MAX_DAYS = 62;          // så ingen kan bede om ledige tider ti år frem

/* Cal versionerer sine endepunkter hver for sig. */
const V_EVENT_TYPES = '2024-06-14';
const V_SLOTS = '2024-09-04';

/* Slug -> event type-id. Holder så længe isolatet lever; en kold start henter
   den bare igen. Ingen grund til at gemme den varigt. */
let eventTypeIds = null;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const fail = (status, message) => json({ error: message }, status);

async function cal(path, key, version) {
  const res = await fetch(CAL + path, {
    headers: {
      authorization: `Bearer ${key}`,
      'cal-api-version': version,
      accept: 'application/json',
    },
  });
  if (!res.ok) {
    /* Aldrig videresende Cals svar råt: det kan indeholde detaljer om kontoen,
       og en besøgende skal ikke kunne aflæse hvad der gik galt indenfor. */
    console.error('cal', path, res.status, (await res.text()).slice(0, 300));
    throw new Error(`cal ${res.status}`);
  }
  return res.json();
}

/** Behandlingerne der må bookes, med deres beløb, hentet fra sitets egen fil. */
async function treatments(env) {
  const res = await env.ASSETS.fetch(new Request('https://site/booking-prices.json'));
  if (!res.ok) throw new Error('booking-prices.json mangler');
  return res.json();
}

async function eventTypeId(slug, env) {
  if (!eventTypeIds) {
    const data = await cal('/event-types', env.CAL_API_KEY, V_EVENT_TYPES);
    eventTypeIds = new Map((data.data || []).map((e) => [e.slug, e.id]));
  }
  return eventTypeIds.get(slug);
}

/** Kun datoer på formen ÅÅÅÅ-MM-DD, og kun et interval der giver mening. */
function parseRange(url) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = url.searchParams.get('from') || new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get('to');
  if (!iso.test(from) || (to && !iso.test(to))) return null;
  const start = new Date(`${from}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = to
    ? new Date(`${to}T00:00:00Z`)
    : new Date(start.getTime() + 14 * 864e5);
  if (Number.isNaN(end.getTime()) || end <= start) return null;
  if ((end - start) / 864e5 > MAX_DAYS) return null;
  return { from, to: end.toISOString().slice(0, 10) };
}

async function slots(url, env) {
  const slug = url.searchParams.get('treatment') || '';
  const prices = await treatments(env);
  const treatment = prices.treatments[slug];
  /* Ukendt slug afvises her, så Workeren ikke kan bruges som en åben proxy
     ind i Cal-kontoen. */
  if (!treatment) return fail(400, 'ukendt behandling');

  const range = parseRange(url);
  if (!range) return fail(400, 'ugyldigt datointerval');

  const id = await eventTypeId(slug, env);
  if (!id) return fail(503, 'behandlingen findes ikke i kalenderen endnu');

  const data = await cal(
    `/slots?eventTypeId=${id}&start=${range.from}&end=${range.to}` +
      `&timeZone=${encodeURIComponent(TZ)}`,
    env.CAL_API_KEY,
    V_SLOTS,
  );

  /* Kun starttidspunkterne sendes videre. Cals svar indeholder felter, der
     ikke rager den besøgende, og formen kan ændre sig uden varsel. */
  const days = {};
  for (const [day, list] of Object.entries(data.data || {})) {
    const times = (list || []).map((s) => s.start).filter(Boolean);
    if (times.length) days[day] = times;
  }

  return json({
    treatment: { slug, title: treatment.title, depositOere: treatment.depositOere },
    timeZone: TZ,
    days,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET') return fail(405, 'kun GET');

    try {
      if (url.pathname === '/api/slots') return await slots(url, env);
      return fail(404, 'ukendt endepunkt');
    } catch (err) {
      console.error(err);
      return fail(502, 'kunne ikke hente ledige tider');
    }
  },
};
