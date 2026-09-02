/**
 * Kalenderfilen til kvitteringen.
 *
 * HVORFOR DEN LAVES HER OG IKKE I BROWSEREN:
 * Første udgave byggede filen som en Blob i JavaScript og hængte den på et
 * <a download>. Det virker på en computer, men på en telefon gør "download"
 * præcis det, ordet siger: filen lander i overførsler, og kalenderen bliver
 * aldrig åbnet. Kunden står med en fil, hun ikke ved hvad hun skal med.
 *
 * Serveres filen derimod fra en rigtig adresse med
 * "Content-Type: text/calendar" og UDEN download-attribut, åbner iOS Safari
 * kalenderens "Tilføj begivenhed" med det samme, og Android lægger den i
 * overførsler, hvor et tryk åbner kalenderen. Det er så godt, som en ics-fil
 * bliver på tværs af telefoner.
 *
 * Rul den ikke tilbage til en Blob med download-attribut.
 */

/* Komma, semikolon og backslash har betydning i formatet og skal undslippes.
   Behandlingsnavnene indeholder plusser, og adressen indeholder komma. */
const esc = (s) =>
  String(s || '')
    .replace(/[\\;,]/g, '\\$&')
    .replace(/\r?\n/g, '\\n');

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Lange linjer skal ombrydes ved 75 oktetter med et mellemrum forrest på
 * fortsættelsen. Uden det afviser strenge kalendere filen, og en adresse plus
 * et langt behandlingsnavn kommer nemt over grænsen.
 */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let chunk = '';
  for (const ch of line) {
    const next = chunk + ch;
    if (new TextEncoder().encode(next).length > (out.length ? 74 : 75)) {
      out.push(chunk);
      chunk = ch;
    } else {
      chunk = next;
    }
  }
  if (chunk) out.push(chunk);
  return out.map((c, i) => (i ? ` ${c}` : c)).join('\r\n');
}

export function buildIcs({ reference, title, start, end, address, business, note }) {
  const from = new Date(start);
  /* Mangler sluttidspunktet, er en time et fornuftigt gæt: det er den
     korteste bloktid i kalenderen. I praksis sender Cal det altid med. */
  const to = end ? new Date(end) : new Date(from.getTime() + 3600000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//wiktoriagordon.dk//booking//DA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${reference}@wiktoriagordon.dk`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(from)}`,
    `DTEND:${stamp(to)}`,
    `SUMMARY:${esc(business ? `${title} · ${business}` : title)}`,
    `LOCATION:${esc(address || '')}`,
    `DESCRIPTION:${esc(note || '')}`,
    /* En påmindelse dagen før. Uden mailadresse er kundens egen kalender det
       eneste, der kan minde hende om tiden. */
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  /* CRLF er ikke valgfrit i formatet. */
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
