/**
 * Cal.com, det der taler med kalenderen.
 *
 * Nøglen ligger som Worker-secret og forlader aldrig serveren. Alt herinde
 * kaldes fra worker/index.js og worker/payment.js, aldrig fra browseren.
 *
 * VERSIONERNE ER IKKE ENS. Cal versionerer hvert endepunkt for sig, og sender
 * man den forkerte dato med, svarer API'et efter en ældre udgave UDEN at fejle.
 * Så skifter formen på svaret lydløst. Derfor står de tre versioner her som
 * navngivne konstanter i stedet for spredt ud i kaldene.
 */

const CAL = 'https://api.cal.com/v2';

export const TZ = 'Europe/Copenhagen';

/* Slået op i Cals dokumentation 2/9-2026. Ændrer Cal en af dem, ser man det
   som en ændret svarform, ikke som en fejl — tjek datoerne først. */
const V_EVENT_TYPES = '2024-06-14';
const V_SLOTS = '2024-09-04';
const V_BOOKINGS = '2026-02-25';

/**
 * Ét sted til alle kald. Kaster ved alt andet end 2xx, og skriver Cals eget
 * svar i loggen frem for at sende det videre: det kan indeholde detaljer om
 * kontoen, og en besøgende skal ikke kunne aflæse hvad der gik galt indenfor.
 */
async function cal(path, env, { version, method = 'GET', body } = {}) {
  const res = await fetch(CAL + path, {
    method,
    headers: {
      authorization: `Bearer ${env.CAL_API_KEY}`,
      'cal-api-version': version,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('cal', method, path, res.status, text.slice(0, 500));
    const err = new Error(`cal ${res.status}`);
    err.status = res.status;
    err.detail = text.slice(0, 500);
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

/* Slug -> event type-id. Holder så længe isolatet lever.
 *
 * Kun FUNDNE slugs caches. Cachede man også dem der manglede, ville en
 * behandling, der bliver oprettet i Cal bagefter, blive ved med at svare
 * "findes ikke" indtil isolatet døde af sig selv. */
let eventTypeIds = new Map();

export async function eventTypeId(slug, env) {
  if (eventTypeIds.has(slug)) return eventTypeIds.get(slug);

  const data = await cal('/event-types', env, { version: V_EVENT_TYPES });
  const found = new Map((data.data || []).map((e) => [e.slug, e.id]));
  /* Erstat hele kortet frem for at flette: så forsvinder en event type, der
     er slettet i Cal, også herfra. */
  eventTypeIds = found;
  return found.get(slug);
}

/** Ledige tider, som Cal ser dem. Reserverede tider er allerede trukket fra. */
export async function slots(id, from, to, env) {
  const data = await cal(
    `/slots?eventTypeId=${id}&start=${from}&end=${to}` +
      `&timeZone=${encodeURIComponent(TZ)}`,
    env,
    { version: V_SLOTS },
  );
  return data.data || {};
}

/**
 * Læg beslag på tiden, mens kunden er ovre i MobilePay.
 *
 * UDEN DEN HER KAN TO KUNDER BETALE FOR SAMME TID. Bookingen oprettes først
 * efter betaling, så tiden står ledig i hele det minut eller to, betalingen
 * tager. Reservationen lukker det hul: Cal holder tiden ude af /slots, indtil
 * den udløber af sig selv.
 *
 * Den udløber SELV. Går kunden fra det halvvejs, skal ingen rydde op.
 */
export async function reserveSlot(id, startUTC, minutes, env) {
  const data = await cal('/slots/reservations', env, {
    version: V_SLOTS,
    method: 'POST',
    body: { eventTypeId: id, slotStart: startUTC, reservationDuration: minutes },
  });
  return (data.data || {}).reservationUid || null;
}

/** Giv tiden fri igen med det samme, når betalingen ikke blev til noget. */
export async function releaseSlot(uid, env) {
  if (!uid) return;
  try {
    await cal(`/slots/reservations/${encodeURIComponent(uid)}`, env, {
      version: V_SLOTS,
      method: 'DELETE',
    });
  } catch (err) {
    /* Reservationen udløber alligevel af sig selv om få minutter. At den ikke
       kunne slettes nu, må aldrig vælte det kald, der er i gang. */
    console.error('kunne ikke frigive reservation', uid, err.message);
  }
}

/**
 * Opret bookingen. Kaldes FØRST når MobilePay siger, at pengene er godkendt.
 *
 * INGEN MAILADRESSE. Wiktorias eget valg (26/8-2026). Cals attendee-skema
 * kræver kun name og timeZone. Event typerne har slet ikke noget mailfelt:
 * de er sat op som telefonbooking, hvor telefonnummeret er identiteten.
 * Send ikke en mail med her.
 *
 * NAVNET SENDES SOM ÉN STRENG, ikke som {firstName, lastName}.
 * Kontrolleret mod hendes rigtige Cal-konto 2/9-2026: name-feltet står som
 * almindeligt fuldt navn uden variant. Sendes et objekt til et felt, der
 * forventer en streng, svarer Cal 400 med error_required_field.
 *
 * Skiftes event typerne på et tidspunkt til variant "firstAndLastName", skal
 * den her linje laves om SAMTIDIG. Formularen spørger om for- og efternavn
 * hver for sig i begge tilfælde, så det er kun her, forskellen findes.
 */
export async function createBooking(rec, env) {
  const data = await cal('/bookings', env, {
    version: V_BOOKINGS,
    method: 'POST',
    body: {
      eventTypeId: rec.eventTypeId,
      start: rec.startUTC,
      attendee: {
        name: `${rec.firstName} ${rec.lastName}`.trim(),
        timeZone: TZ,
        phoneNumber: rec.phone,
        language: rec.lang === 'en' ? 'en' : 'da',
      },
      bookingFieldsResponses: {
        /* attendeePhoneNumber er påkrævet på event typen. Uden den her svarer
           Cal 400, selvom nummeret også står i attendee ovenfor. */
        attendeePhoneNumber: rec.phone,
      },
      /* Så en booking kan spores tilbage til sin betaling uden at nogen skal
         gætte ud fra klokkeslæt. Står også i MobilePays egen metadata. */
      metadata: { paymentRef: rec.reference },
    },
  });

  const b = data.data || {};
  if (!b.uid) throw new Error('cal svarede uden booking-uid');
  return { uid: b.uid, status: b.status, start: b.start, end: b.end };
}

/**
 * Bekræft bookingen.
 *
 * Event typerne har confirmationPolicy tændt med vilje: de er offentligt
 * bookbare på cal.com/<bruger>/<slug>, og uden bekræftelse kunne enhver, der
 * fandt det link, booke uden om betalingen. Vores egne er betalt, så dem
 * bekræfter vi selv her. Det Wiktoria får til gennemsyn, er præcis det, der
 * IKKE er betalt for.
 */
export async function confirmBooking(uid, env) {
  await cal(`/bookings/${encodeURIComponent(uid)}/confirm`, env, {
    version: V_BOOKINGS,
    method: 'POST',
    body: {},
  });
}
