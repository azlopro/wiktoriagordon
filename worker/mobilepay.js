/**
 * MobilePay, ePayment-API'et.
 *
 * HVORFOR DIREKTE OG IKKE GENNEM STRIPE:
 * MobilePay gennem en betalingsudbyder koster 35 kr. om måneden af danske
 * virksomheder. Direkte på ePayment-API'et er der ingen månedlig betaling,
 * kun pris pr. transaktion. Se scripts/booking/PLAN.md.
 *
 * REKKEFØLGEN ER RESERVÉR, BOOK, HÆV — ikke hæv og fortryd bagefter.
 * En betaling, der er godkendt, har kun lagt beslag på pengene. Går bookingen
 * galt bagefter, annullerer vi beslaget, og kunden er aldrig blevet trukket.
 * Havde vi hævet med det samme, skulle vi refundere i stedet, og så ville der
 * stå en betaling og en tilbagebetaling på hendes kontoudtog for en tid, hun
 * aldrig fik. Se settle() i worker/payment.js.
 *
 * Nøgler ligger som Worker-secrets:
 *   MOBILEPAY_CLIENT_ID, MOBILEPAY_CLIENT_SECRET,
 *   MOBILEPAY_SUBSCRIPTION_KEY, MOBILEPAY_MSN
 * og MOBILEPAY_ENV som almindelig variabel ("test" eller "production").
 */

const HOSTS = {
  test: 'https://apitest.vipps.no',
  production: 'https://api.vipps.no',
};

/* Vipps beder om dem på alle kald. De bruges til at finde vores integration
   frem, når vi selv skriver til deres support. */
const SYSTEM = {
  'Vipps-System-Name': 'wiktoriagordon.dk',
  'Vipps-System-Version': '1.0',
  'Vipps-System-Plugin-Name': 'w-website-booking',
  'Vipps-System-Plugin-Version': '1.0',
};

export const CURRENCY = 'DKK';

/* Testmiljøet er standard. Produktion kræver, at nogen udtrykkeligt skriver
   det. Den vej rundt kan en manglende variabel aldrig komme til at trække
   rigtige penge. */
function host(env) {
  return HOSTS[env.MOBILEPAY_ENV] || HOSTS.test;
}

export function isConfigured(env) {
  return Boolean(
    env.MOBILEPAY_CLIENT_ID &&
      env.MOBILEPAY_CLIENT_SECRET &&
      env.MOBILEPAY_SUBSCRIPTION_KEY &&
      env.MOBILEPAY_MSN,
  );
}

/* Tokenet holder én time i test og et døgn i produktion, og må genbruges hele
   perioden. Det gemmes kun i isolatet: en kold start henter bare et nyt, og
   så slipper vi for at have et gyldigt adgangstoken liggende i KV. */
let cached = null;

async function accessToken(env) {
  const now = Date.now();
  if (cached && cached.expires > now + 60_000) return cached.token;

  const res = await fetch(host(env) + '/accesstoken/get', {
    method: 'POST',
    headers: {
      client_id: env.MOBILEPAY_CLIENT_ID,
      client_secret: env.MOBILEPAY_CLIENT_SECRET,
      'Ocp-Apim-Subscription-Key': env.MOBILEPAY_SUBSCRIPTION_KEY,
      'Merchant-Serial-Number': env.MOBILEPAY_MSN,
      ...SYSTEM,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('mobilepay accesstoken', res.status, text.slice(0, 300));
    throw new Error(`mobilepay accesstoken ${res.status}`);
  }

  const body = JSON.parse(text);
  /* expires_in kommer som en STRENG i Vipps' svar. Uden Number() bliver
     regnestykket nedenfor til tekst, og tokenet ville udløbe med det samme. */
  const seconds = Number(body.expires_in) || 3600;
  cached = { token: body.access_token, expires: now + seconds * 1000 };
  return cached.token;
}

async function api(path, env, { method = 'GET', body, idempotencyKey } = {}) {
  const token = await accessToken(env);
  const res = await fetch(host(env) + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'Ocp-Apim-Subscription-Key': env.MOBILEPAY_SUBSCRIPTION_KEY,
      'Merchant-Serial-Number': env.MOBILEPAY_MSN,
      ...SYSTEM,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('mobilepay', method, path, res.status, text.slice(0, 500));
    const err = new Error(`mobilepay ${res.status}`);
    err.status = res.status;
    err.detail = text.slice(0, 500);
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

/**
 * En reference må være 8-50 tegn og kun bogstaver, tal og bindestreg.
 *
 * Den er TILFÆLDIG med vilje. Den står i adressen på kvitteringssiden, og den
 * er dermed også nøglen til at se hvem der har booket hvad. En løbende
 * nummerering kunne gættes; 32 hex-tegn kan ikke.
 */
export function newReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `wg-${hex}`;
}

/**
 * Opret betalingen og få den adresse, kunden skal sendes hen til.
 *
 * INGEN customer.phoneNumber. Feltet ville forudfylde MobilePays egen side,
 * men det binder samtidig betalingen til præcis det nummer. Taster kunden sit
 * eget nummer forkert i bookingformularen, ville hun så ikke kunne betale med
 * sin egen telefon. Lad MobilePay spørge selv.
 *
 * userFlow WEB_REDIRECT virker både på telefon og computer: appen åbnes hvor
 * den findes, ellers vises MobilePays landingsside.
 */
export async function createPayment({ reference, oere, returnUrl, description }, env) {
  const data = await api('/epayment/v1/payments', env, {
    method: 'POST',
    /* Nøglen ER referencen. Et gentaget kald med samme nøgle giver den samme
       betaling tilbage i stedet for at oprette nummer to. En tilfældig nøgle
       pr. forsøg ville lave dobbeltbetalinger ved et simpelt retry. */
    idempotencyKey: reference,
    body: {
      amount: { currency: CURRENCY, value: oere },
      paymentMethod: { type: 'WALLET' },
      reference,
      userFlow: 'WEB_REDIRECT',
      returnUrl,
      /* Maks. 100 tegn, og det er det kunden ser i sin MobilePay-historik. */
      paymentDescription: description.slice(0, 100),
    },
  });
  if (!data.redirectUrl) throw new Error('mobilepay svarede uden redirectUrl');
  return data.redirectUrl;
}

/**
 * Spørg MobilePay selv, hvordan det gik.
 *
 * ET CALLBACK ER IKKE ET BEVIS. At kunden lander tilbage på /tak/ betyder kun,
 * at browseren blev sendt derhen. Adressen kan skrives i hånden. Derfor er det
 * HER, det afgøres, om der er betalt.
 *
 * state er en af: CREATED, AUTHORIZED, ABORTED, EXPIRED, TERMINATED.
 */
export async function getPayment(reference, env) {
  const data = await api(`/epayment/v1/payments/${encodeURIComponent(reference)}`, env);
  return {
    state: data.state,
    authorizedOere: ((data.aggregate || {}).authorizedAmount || {}).value || 0,
    capturedOere: ((data.aggregate || {}).capturedAmount || {}).value || 0,
  };
}

/** Hæv beløbet. Først her flytter pengene sig. */
export async function capturePayment(reference, oere, env) {
  await api(`/epayment/v1/payments/${encodeURIComponent(reference)}/capture`, env, {
    method: 'POST',
    idempotencyKey: `${reference}-capture`,
    body: { modificationAmount: { currency: CURRENCY, value: oere } },
  });
}

/**
 * Slip beslaget på pengene igen.
 *
 * Bruges når bookingen ikke kunne oprettes alligevel. Kunden bliver aldrig
 * trukket, og der står ingen tilbagebetaling på hendes kontoudtog.
 */
export async function cancelPayment(reference, env) {
  await api(`/epayment/v1/payments/${encodeURIComponent(reference)}/cancel`, env, {
    method: 'POST',
    idempotencyKey: `${reference}-cancel`,
  });
}
