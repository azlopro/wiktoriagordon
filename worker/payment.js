/**
 * Én booking under betaling, som et Durable Object.
 *
 * HVORFOR IKKE BARE KV:
 * Forløbet har fire trin, der skal ske i rækkefølge og præcis én gang:
 * reservér tiden, opret betalingen, opret bookingen, hæv beløbet. Kunden
 * lander på /tak/ og spørger "er der betalt?", og alarmen nedenfor spørger om
 * det samme, hvis hun aldrig kom tilbage. To samtidige svar på det spørgsmål
 * må ikke kunne oprette to bookinger.
 *
 * KV kan ikke det. Der er ingen lås, og skrivninger er kun i sidste ende
 * konsistente, så "læs, tjek, skriv" er et væddemål. Et Durable Object er
 * derimod ét sted i verden pr. betaling, med sin egen lager, der er stærkt
 * konsistent. Racet findes ikke længere, i stedet for at være gjort
 * usandsynligt.
 *
 * DET ER GRATIS. SQLite-baserede Durable Objects er med på Workers' fri plan.
 *
 * OG DER ER INGEN CRON. Alarmen herunder hører til den enkelte betaling og
 * stilles, når betalingen oprettes. Det er dét, der rydder op efter en kunde,
 * der godkendte i appen og så lukkede browseren: ingen liste at gennemgå,
 * ingen tidsplan at vedligeholde, ingenting der kører når der ikke er noget
 * at lave.
 */

import { DurableObject } from 'cloudflare:workers';
import * as cal from './cal.js';
import * as mp from './mobilepay.js';

/* Hvor længe tiden holdes, mens kunden er ovre i MobilePay. Rigeligt til en
   betaling, kort nok til at en fortrudt bestilling ikke spærrer tiden for
   andre en hel eftermiddag. */
const HOLD_MINUTES = 10;
export const HOLD_MS = HOLD_MINUTES * 60_000;

/* Første alarm ligger lige efter, at reservationen er løbet ud. Er der stadig
   ikke betalt til den tid, bliver der det heller ikke. */
const FIRST_ALARM_MS = (HOLD_MINUTES + 1) * 60_000;

/* Hævningen kan fejle forbigående. Den prøves igen, ikke i det uendelige. */
const CAPTURE_RETRY_MS = 5 * 60_000;
const CAPTURE_MAX_TRIES = 6;

/* Kvitteringen skal kunne genindlæses i et stykke tid, men navnet og
   telefonnummeret skal ikke ligge her for evigt. Efter en uge er bookingen i
   Cal det eneste, der er tilbage. */
const PURGE_MS = 7 * 24 * 60 * 60_000;

const TERMINAL = new Set(['done', 'cancelled', 'failed', 'review']);

/** Navnet på tidens eget objekt. Skal regnes ud ét sted, ellers rammer
    Workeren og betalingen hver sit objekt, og låsen holder ingenting. */
export const slotKey = (eventTypeId, startUTC) => `slot:${eventTypeId}:${startUTC}`;

export class Payment extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /* Alt, der ændrer noget, står i kø her.
       Durable Objects serialiserer omkring lagerkald, men IKKE omkring et
       fetch, der venter på Cal eller MobilePay. To samtidige kald til status()
       kunne derfor begge nå forbi "er der booket?" og begge booke. Køen gør
       den slags umulig, fordi objektet kun findes ét sted. */
    this.queue = Promise.resolve();
  }

  run(job) {
    const result = this.queue.then(job);
    /* Køen må aldrig knække på en fejl, ellers står alle senere kald i stå. */
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  /* ------------------------------------------------------------------ *
   * Slot-låsen.
   *
   * Det HER objekt er ikke en betaling, men en tid. Det slås op under navnet
   * "slot:<event type>:<tidspunkt>" i stedet for under en betalingsreference,
   * og så er der præcis ét af det i verden pr. tid, ligesom der er præcis ét
   * pr. betaling. Samme klasse, fordi det sparer en migration og en klasse
   * mere at forklare ved overdragelsen; de to roller rører aldrig hinandens
   * nøgler i lageret.
   *
   * HVORFOR DEN ER NØDVENDIG:
   * Cals reservation lukker det lange vindue, hvor kunden står i MobilePay i
   * et par minutter. Den lukker IKKE det korte: checkout spørger først Cal
   * "er tiden ledig?" og reserverer bagefter, og rammer to bestillinger de
   * par hundrede millisekunder imellem, siger Cal ja til dem begge. Målt
   * 2/9-2026: to samtidige bestillinger på samme tid gik begge igennem.
   *
   * Pengene var aldrig i fare — den, der tabte, ville få sin betaling
   * annulleret og aldrig blive trukket. Men hun ville have betalt først og
   * fået besked bagefter, og det er en dårligere oplevelse end et nej med det
   * samme.
   * ------------------------------------------------------------------ */

  /** Læg beslag på tiden. Falsk betyder, at en anden nåede det først. */
  async claimSlot(ttlMs) {
    return this.run(async () => {
      const until = await this.ctx.storage.get('slotUntil');
      if (until && until > Date.now()) return false;
      await this.ctx.storage.put('slotUntil', Date.now() + ttlMs);
      return true;
    });
  }

  /** Giv tiden fri igen, så snart det står klart, at der ikke blev betalt. */
  async releaseSlotClaim() {
    return this.run(() => this.ctx.storage.delete('slotUntil'));
  }

  /* ------------------------------------------------------------------ */

  async load() {
    return (await this.ctx.storage.get('rec')) || null;
  }

  /**
   * Giv tiden helt fri: både Cals reservation og vores egen lås.
   *
   * De to hører sammen og skal slippes samtidig. Slippes kun den ene, står
   * tiden enten som ledig i vælgeren men afvises ved bestilling, eller
   * omvendt.
   */
  async freeSlot(rec) {
    /* Begge dele udløber af sig selv om få minutter, så en fejl her koster
       højst at tiden er spærret lidt for længe. Den må ALDRIG vælte det kald,
       den står i: gør den det, når betalingen aldrig frem til en slutstatus,
       og kunden sidder tilbage med en side, der venter for evigt. */
    try {
      await cal.releaseSlot(rec.reservationUid, this.env);
      const id = this.env.PAYMENT.idFromName(slotKey(rec.eventTypeId, rec.startUTC));
      await this.env.PAYMENT.get(id).releaseSlotClaim();
    } catch (err) {
      console.error('kunne ikke frigive tiden', rec.reference, err.message);
    }
  }

  /* Samme grund: en annullering, der fejler, må ikke forhindre os i at skrive
     ned, at det gik galt. Beløbet er kun reserveret og forsvinder af sig selv,
     hvis det aldrig bliver hævet. */
  async cancelQuietly(rec) {
    try {
      await mp.cancelPayment(rec.reference, this.env);
    } catch (err) {
      console.error('kunne ikke annullere betaling', rec.reference, err.message);
    }
  }

  async save(rec) {
    await this.ctx.storage.put('rec', rec);
    return rec;
  }

  /* ------------------------------------------------------------------ */

  /**
   * Trin 1: læg beslag på tiden, og opret betalingen.
   *
   * Rækkefølgen er med vilje. Reservationen først: kan tiden ikke holdes, er
   * der ingen grund til at bede nogen om penge. Kan betalingen så ikke
   * oprettes, gives tiden fri igen med det samme.
   */
  async start(input) {
    return this.run(async () => {
      const existing = await this.load();
      /* Referencen er tilfældig, så den her kan kun ske ved et gentaget kald
         med samme reference. Så skal kunden have den samme betaling igen, ikke
         en ny. */
      if (existing) return { redirectUrl: existing.redirectUrl };

      const startUTC = new Date(input.start).toISOString();
      const reservationUid = await cal.reserveSlot(
        input.eventTypeId,
        startUTC,
        HOLD_MINUTES,
        this.env,
      );

      const rec = {
        ...input,
        startUTC,
        reservationUid,
        status: 'pending',
        bookingUid: null,
        captureTries: 0,
        createdAt: Date.now(),
      };

      try {
        rec.redirectUrl = await mp.createPayment(
          {
            reference: rec.reference,
            oere: rec.depositOere,
            returnUrl: rec.returnUrl,
            /* Det her står i kundens egen MobilePay-historik, så ordet
               følger hendes sprog og ikke vores. */
            description: `${rec.depositLabel || 'Depositum'} · ${rec.title}`,
          },
          this.env,
        );
      } catch (err) {
        await cal.releaseSlot(reservationUid, this.env);
        await this.env.PAYMENT.get(
          this.env.PAYMENT.idFromName(slotKey(input.eventTypeId, startUTC)),
        ).releaseSlotClaim();
        throw err;
      }

      await this.save(rec);
      await this.ctx.storage.setAlarm(Date.now() + FIRST_ALARM_MS);
      return { redirectUrl: rec.redirectUrl };
    });
  }

  /** Det kvitteringssiden spørger om, gentagne gange, mens den venter. */
  async status() {
    const rec = await this.run(() => this.settle());
    if (!rec) return null;

    const out = {
      status: rec.status,
      title: rec.title,
      start: rec.startUTC,
      end: rec.endUTC || null,
      firstName: rec.firstName,
      lang: rec.lang,
    };

    /* DEN FULDE ADRESSE UDLEVERES FØRST HER, og kun når der er booket.
       Wiktorias krav 26/8-2026: offentligt står kun gadenavnet uden nummer.
       Derfor står adressen som Worker-secret og IKKE i data/ eller i sitets
       HTML — /tak/ er en almindelig offentlig side, og alt der bliver bygget
       ind i den, kan læses af enhver, der åbner adressen. */
    if (rec.status === 'booked' || rec.status === 'done' || rec.status === 'review') {
      out.address = this.env.SALON_ADDRESS || '';
    }
    return out;
  }

  /**
   * Hele afgørelsen, ét sted, og sikker at kalde igen.
   *
   * Kaldes både af kunden på /tak/ og af alarmen. Hvert trin er skrevet, så
   * det kan gentages uden at gøre noget to gange: bookingen springes over, når
   * der allerede står et uid, og hævningen bruger en fast idempotensnøgle.
   */
  async settle() {
    let rec = await this.load();
    if (!rec || TERMINAL.has(rec.status)) return rec;

    if (!rec.bookingUid) {
      /* MobilePay bliver spurgt, ikke browseren. At kunden er landet på /tak/
         betyder kun, at nogen åbnede den adresse. */
      const payment = await mp.getPayment(rec.reference, this.env);

      if (payment.state === 'CREATED') return rec; // stadig undervejs

      /* ABORTED, EXPIRED eller TERMINATED: hun fortrød, eller tiden løb ud. */
      if (payment.state !== 'AUTHORIZED') {
        await this.freeSlot(rec);
        return this.save({ ...rec, status: 'cancelled' });
      }

      /* Beløbet er vores eget, så det her kan kun slå til, hvis noget er helt
         galt. Book aldrig på en betaling, der ikke dækker depositummet. */
      if (payment.authorizedOere < rec.depositOere) {
        console.error('for lille beløb godkendt', rec.reference, payment.authorizedOere);
        await this.cancelQuietly(rec);
        await this.freeSlot(rec);
        return this.save({ ...rec, status: 'failed', error: 'beløb' });
      }

      try {
        const booking = await cal.createBooking(rec, this.env);
        /* Sluttidspunktet gemmes, fordi kalenderfilen på kvitteringen skal
           bruge det. Behandlingens længde står i Cal, ikke i prislisten, hvor
           varigheden er et interval til mennesker ("45-60 min."). */
        rec = await this.save({
          ...rec,
          bookingUid: booking.uid,
          endUTC: booking.end || null,
          status: 'booked',
        });
      } catch (err) {
        /* Tiden blev revet væk, eller Cal er nede. Pengene er kun reserveret,
           så beslaget slippes, og kunden bliver ALDRIG trukket. Det er hele
           grunden til, at der ikke hæves før her. */
        console.error('kunne ikke oprette booking', rec.reference, err.detail || err.message);
        await this.cancelQuietly(rec);
        await this.freeSlot(rec);
        return this.save({ ...rec, status: 'failed', error: 'booking' });
      }

      try {
        await cal.confirmBooking(rec.bookingUid, this.env);
      } catch (err) {
        /* Bookingen ER oprettet. Bliver den ikke bekræftet, lander den bare
           hos Wiktoria til godkendelse, og det er en ulejlighed, ikke et tab.
           Den må ikke vælte hævningen nedenfor. */
        console.error('kunne ikke bekræfte booking', rec.bookingUid, err.message);
      }

      /* Reservationen og låsen har gjort deres; bookingen holder nu tiden. */
      await this.freeSlot(rec);
    }

    /* Først her flytter pengene sig. */
    try {
      await mp.capturePayment(rec.reference, rec.depositOere, this.env);
      return this.save({ ...rec, status: 'done' });
    } catch (err) {
      console.error('kunne ikke hæve', rec.reference, err.detail || err.message);
      /* Kunden HAR sin tid. At beløbet ikke kunne hæves, er Wiktorias sag og
         ikke kundens, så kvitteringen viser stadig en gyldig booking.
         Alarmen prøver igen. */
      return this.save({ ...rec, captureTries: (rec.captureTries || 0) + 1 });
    }
  }

  /**
   * Sikkerhedsnettet.
   *
   * Kunden kan godkende i MobilePay-appen og så lukke browseren. Så kommer
   * ingen nogensinde tilbage til /tak/, og uden det her ville der stå en
   * godkendt betaling uden booking. Det er den situation, alarmen findes for.
   */
  async alarm() {
    await this.run(async () => {
      let rec = await this.load();
      if (!rec) return;

      if (!TERMINAL.has(rec.status)) {
        rec = (await this.settle()) || rec;
      }

      if (rec.status === 'pending') {
        /* Reservationen er udløbet, og der er stadig ikke betalt. Betalingen
           annulleres, så den ikke bliver ved med at stå åben hos MobilePay. */
        await this.cancelQuietly(rec);
        await this.freeSlot(rec);
        rec = await this.save({ ...rec, status: 'cancelled' });
      }

      if (rec.status === 'booked') {
        /* Hævningen fejler stadig. Prøv igen om lidt, men ikke evigt. */
        if ((rec.captureTries || 0) < CAPTURE_MAX_TRIES) {
          await this.ctx.storage.setAlarm(Date.now() + CAPTURE_RETRY_MS);
          return;
        }
        console.error(
          'depositum kunne ikke hæves, se betalingen i Vipps-portalen:',
          rec.reference,
        );
        rec = await this.save({ ...rec, status: 'review' });
      }

      /* Færdig på den ene eller den anden måde. Nu skal navn og telefonnummer
         bare ud igen, når kvitteringen ikke længere skal kunne åbnes. */
      const purgeAt = (rec.createdAt || Date.now()) + PURGE_MS;
      if (Date.now() >= purgeAt) {
        await this.ctx.storage.deleteAll();
        return;
      }
      await this.ctx.storage.setAlarm(purgeAt);
    });
  }
}
