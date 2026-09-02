/**
 * Kører bookingkvitteringen igennem alle dens tilstande, på begge sprog,
 * uden en browser.
 *
 * HVORFOR DEN FINDES:
 * Kvitteringen fejler stille. Rammer scriptet et element, der ikke findes,
 * kaster det en TypeError midt i et løfte, og den bliver fanget af den samme
 * catch, der håndterer netværksfejl. Så prøver siden bare igen, og den
 * besøgende ser en spinner, der aldrig stopper — uden en fejl nogen steder.
 *
 * Det skete tre gange i træk 2/9-2026, og hver gang var det kunden, der fandt
 * det. Testen her kører static/js/thanks.js mod en minimal DOM bygget af den
 * HTML, Hugo faktisk producerer, og svarer med opdigtede API-svar.
 *
 * BEGGE SPROG, fordi den engelske kvittering er lige så meget kundens eneste
 * bevis som den danske.
 *
 * Kør efter enhver ændring i thanks.js eller thanks.html:
 *     node scripts/booking/test-kvittering.mjs
 * Den køres også af scripts/security-check.sh ved hvert build.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = readFileSync(join(ROOT, 'static', 'js', 'thanks.js'), 'utf8');

const SIDER = [
  ['dansk', join(ROOT, 'public', 'tak', 'index.html')],
  ['engelsk', join(ROOT, 'public', 'en', 'thanks', 'index.html')],
];

/* Elementer, scriptet SKAL kunne finde. Mangler ét, kaster koden midt i en
   hændelse, og kunden ser en evig spinner. */
const PAAKRAEVET = [
  'thanksCard', 'thWait', 'thDone', 'thCancelled', 'thFailed', 'thUnknown',
  'thName', 'thWhen', 'thAddress', 'thCalApple', 'thCalGoogle', 'thCalOutlook',
];

/* --- en DOM, der kun kan det, kvitteringen bruger ----------------------- */

class El {
  constructor(id) {
    this.id = id;
    this._text = '';
    this.hidden = false;
    this.href = '';
    this.dataset = {};
    this.kids = [];
  }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  querySelector(sel) {
    const kid = this.kids.find((c) => c.tag === sel);
    if (!kid) throw new Error(`querySelector(${sel}) fandt intet i #${this.id}`);
    return kid;
  }
  querySelectorAll() { return []; }
}

function domFra(markup) {
  const ids = new Set(
    [...markup.matchAll(/id=(?:"([^"]+)"|([\w-]+))(?=[\s>])/g)].map((m) => m[1] || m[2]),
  );
  const nodes = new Map();
  for (const id of ids) {
    const el = new El(id);
    /* giveUp() skriver i overskrift og afsnit i de her to bokse. */
    if (id === 'thUnknown' || id === 'thWait') {
      el.kids.push(Object.assign(new El(`${id}-h1`), { tag: 'h1' }));
      el.kids.push(Object.assign(new El(`${id}-p`), { tag: 'p' }));
    }
    nodes.set(id, el);
  }

  const card = nodes.get('thanksCard');
  if (card) {
    /* Hugo skriver JSON-attributter i ENKELTE anførselstegn, fordi indholdet
       selv indeholder dobbelte. Alle former skal kunne læses. */
    const attr = (n) => {
      const m = markup.match(new RegExp(`data-${n}=(?:'([^']*)'|"([^"]*)"|([^\\s>]+))`));
      return m ? (m[1] ?? m[2] ?? m[3]) : '';
    };
    card.dataset.labels = attr('labels')
      .replace(/&#34;|&quot;/g, '"')
      .replace(/&amp;/g, '&');
    card.dataset.locale = attr('locale') || 'da-DK';
  }
  return nodes;
}

/* --- kørsel ------------------------------------------------------------- */

const REF = `wg-${'a'.repeat(32)}`;

async function koer(nodes, svar) {
  const fejl = [];
  const document = {
    getElementById: (id) => nodes.get(id) || null,
    querySelector: (sel) => {
      if (sel === '#thWait p') return nodes.get('thWait').querySelector('p');
      throw new Error(`querySelector(${sel}) er ikke understøttet i testen`);
    },
  };
  const log = { error: (...a) => fejl.push(a.join(' ')) };
  const sandbox = {
    document,
    window: {
      location: { search: `?ref=${REF}`, origin: 'https://www.wiktoriagordon.dk' },
      setTimeout: () => {},
      console: log,
    },
    navigator: { userAgent: 'Mozilla/5.0 (iPhone)', platform: 'iPhone', maxTouchPoints: 5 },
    URLSearchParams, Intl, Date, encodeURIComponent, Array, Object, JSON,
    console: log,
    setTimeout: () => {},
    fetch: async () => ({
      ok: svar.ok !== false,
      status: svar.status || 200,
      json: async () => svar.body,
    }),
  };
  sandbox.window.document = document;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  /* fetch er asynkron: scriptet er kørt igennem, men svaret ligger stadig som
     et løfte i køen. Der skal gives plads til at det bliver behandlet, før der
     måles på, hvad siden viser. */
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  return fejl;
}

const TILSTANDE = ['thWait', 'thDone', 'thCancelled', 'thFailed', 'thUnknown'];

/* --- prøverne ----------------------------------------------------------- */

const DONE = {
  status: 'done',
  title: 'Koreansk lash lift',
  start: '2026-09-09T11:00:00.000Z',
  end: '2026-09-09T12:00:00.000Z',
  firstName: 'Anna',
  lang: 'da',
  address: 'Teststræde 11, 1. sal, 8700 Horsens',
};

const PROEVER = [
  ['betalt og booket', { body: DONE }, 'thDone'],
  ['booket, ikke hævet endnu', { body: { ...DONE, status: 'booked' } }, 'thDone'],
  ['hævning til gennemsyn', { body: { ...DONE, status: 'review' } }, 'thDone'],
  ['kunden fortrød', { body: { ...DONE, status: 'cancelled' } }, 'thCancelled'],
  ['tiden blev taget', { body: { ...DONE, status: 'failed' } }, 'thFailed'],
  ['ukendt reference', { ok: false, status: 404, body: {} }, 'thUnknown'],
  ['venter stadig', { body: { ...DONE, status: 'pending' } }, 'thWait'],
  ['uden adresse endnu', { body: { ...DONE, address: undefined } }, 'thDone'],
  ['uden sluttid', { body: { ...DONE, end: null } }, 'thDone'],
];

let fejlede = 0;
const sig = (ok, tekst) => {
  console.log(`  ${ok ? 'ok   ' : 'FEJL '} ${tekst}`);
  if (!ok) fejlede++;
};

for (const [sprog, sti] of SIDER) {
  console.log(`\n${sprog}`);
  let markup;
  try {
    markup = readFileSync(sti, 'utf8');
  } catch {
    sig(false, `${sti} er ikke bygget`);
    continue;
  }

  const nodes = domFra(markup);
  const mangler = PAAKRAEVET.filter((id) => !nodes.has(id));
  for (const id of mangler) sig(false, `#${id} findes ikke i den byggede side`);
  if (mangler.length) continue;

  const nulstil = () => {
    for (const el of nodes.values()) { el.hidden = false; el._text = ''; el.href = ''; }
  };

  for (const [navn, svar, forventet] of PROEVER) {
    nulstil();
    let fejl;
    try {
      fejl = await koer(nodes, svar);
    } catch (e) {
      sig(false, `${navn}: kastede ${e.message}`);
      continue;
    }
    const vist = TILSTANDE.filter((id) => nodes.get(id).hidden === false);
    if (vist.length !== 1 || vist[0] !== forventet) {
      sig(false, `${navn}: viste [${vist}], forventede ${forventet}`);
    } else if (fejl.length) {
      sig(false, `${navn}: skrev i loggen: ${fejl.join(' | ')}`);
    } else {
      sig(true, `${navn} -> ${forventet}`);
    }
  }

  /* Kvitteringen er kundens eneste bevis. Står tid, adresse eller
     kalenderlinket tomt, er den ikke noget værd. */
  nulstil();
  await koer(nodes, { body: DONE });
  sig(nodes.get('thName').textContent.includes('Anna'), 'navnet i overskriften');
  sig(nodes.get('thWhen').textContent.includes(DONE.title), 'behandling og tid');
  sig(nodes.get('thAddress').textContent === DONE.address, 'adressen vises');
  sig(nodes.get('thAddress').hidden === false, 'adressen er ikke skjult');
  sig(nodes.get('thCalApple').href.includes('/api/booking.ics?ref='), 'Apple peger på .ics');
  sig(/dates=\d{8}T\d{6}Z\/\d{8}T\d{6}Z/.test(nodes.get('thCalGoogle').href),
    'Google har kompakt UTC');
  sig(/startdt=2026-09-09T11%3A00%3A00Z/.test(nodes.get('thCalOutlook').href),
    'Outlook har ISO med koloner');

  /* Adressen må ALDRIG stå i sidens HTML: kvitteringen er en offentlig side,
     og adressen udleveres først af Workeren, når der er betalt. */
  sig(!/Fredericiagade\s*\d/.test(markup), 'adressen er ikke bygget ind i siden');

  /* Teksterne skal være på sidens eget sprog. Uden det her kunne en engelsk
     kunde få danske knapper, uden at nogen opdagede det. */
  const t = JSON.parse(nodes.get('thanksCard').dataset.labels || '{}');
  const dansk = /[æøå]/i.test(`${t.addressHeading} ${t.calendarHint} ${t.doneText}`);
  sig(sprog === 'dansk' ? dansk : !dansk, 'teksterne er på sidens eget sprog');
}

console.log();
if (fejlede) {
  console.log(`${fejlede} fejl. Kvitteringen er ikke klar.`);
  process.exit(1);
}
console.log('Kvitteringen opfører sig rigtigt i alle tilstande, på begge sprog.');
