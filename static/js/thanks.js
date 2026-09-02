/* Bookingkvitteringen.
 *
 * Siden spørger /api/booking, indtil der er et svar. Det er Workeren, der
 * afgør om der er betalt, ved at spørge MobilePay selv. At browseren er landet
 * her, beviser ingenting: adressen kan skrives i hånden.
 *
 * Den fulde adresse kommer OGSÅ derfra, og først når der er booket. Den står
 * ikke i sidens HTML, netop fordi /tak/ er en offentlig adresse.
 */
(function () {
  "use strict";

  var root = document.getElementById("thanksCard");
  if (!root) return;

  var T = JSON.parse(root.dataset.labels || "{}");
  var LOCALE = root.dataset.locale || "da-DK";

  var states = {
    wait: document.getElementById("thWait"),
    done: document.getElementById("thDone"),
    cancelled: document.getElementById("thCancelled"),
    failed: document.getElementById("thFailed"),
    unknown: document.getElementById("thUnknown")
  };

  function show(which) {
    Object.keys(states).forEach(function (k) {
      if (states[k]) states[k].hidden = k !== which;
    });
  }

  var ref = new URLSearchParams(window.location.search).get("ref") || "";
  if (!/^wg-[0-9a-f]{32}$/.test(ref)) {
    show("unknown");
    return;
  }

  var fmtLong = new Intl.DateTimeFormat(LOCALE, {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen"
  });

  /* --- kalender ---------------------------------------------------------- */

  function icsUrl() {
    return "/api/booking.ics?ref=" + encodeURIComponent(ref);
  }

  function span(data) {
    var start = new Date(data.start);
    return [start, data.end ? new Date(data.end) : new Date(start.getTime() + 3600000)];
  }

  /* Googles format: kompakt UTC uden bindestreger og koloner. */
  function googleUrl(data) {
    var t = span(data);
    var stamp = function (d) {
      return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    };
    return "https://calendar.google.com/calendar/render?" + [
      "action=TEMPLATE",
      "text=" + encodeURIComponent(data.title),
      "dates=" + stamp(t[0]) + "/" + stamp(t[1]),
      "location=" + encodeURIComponent(data.address || ""),
      "details=" + encodeURIComponent(T.prepText || "")
    ].join("&");
  }

  /* Outlook vil have almindelig ISO 8601 MED bindestreger og koloner, altså
     det modsatte af Google. Bland dem ikke sammen: den hyppigste grund til at
     et Outlook-link ikke virker er netop datoformatet. */
  function outlookUrl(data) {
    var t = span(data);
    var iso = function (d) { return d.toISOString().replace(/\.\d{3}/, ""); };
    return "https://outlook.live.com/calendar/deeplink/compose?" + [
      "path=" + encodeURIComponent("/calendar/action/compose"),
      "rru=addevent",
      "subject=" + encodeURIComponent(data.title),
      "startdt=" + encodeURIComponent(iso(t[0])),
      "enddt=" + encodeURIComponent(iso(t[1])),
      "location=" + encodeURIComponent(data.address || ""),
      "body=" + encodeURIComponent(T.prepText || "")
    ].join("&");
  }

  /* --- visning ----------------------------------------------------------- */

  function renderDone(data) {
    document.getElementById("thName").textContent =
      (T.doneHeading || "").replace("{name}", data.firstName || "");
    document.getElementById("thWhen").textContent =
      data.title + " · " + fmtLong.format(new Date(data.start));

    var address = document.getElementById("thAddress");
    address.textContent = data.address || "";
    address.hidden = !data.address;

    /* Tre kalendere. Apple henter .ics-filen, som i øvrigt virker med alle
       andre kalendere end de tre; Google og Outlook åbner deres egen side
       med aftalen udfyldt. Se skabelonen for hvorfor det IKKE er en knap,
       der retter sig efter telefonen. */
    document.getElementById("thCalApple").href = icsUrl();
    document.getElementById("thCalGoogle").href = googleUrl(data);
    document.getElementById("thCalOutlook").href = outlookUrl(data);

    show("done");
  }

  /* --- hentning ---------------------------------------------------------- */

  /* Halvandet minut var for lidt. Kunden skal nå at finde telefonen frem,
     åbne MobilePay og godkende, og hun kan sagtens blive afbrudt undervejs.
     Fem minutter er rigeligt, og at spørge hvert tredje sekund er langt inden
     for det, Vipps selv anbefaler. */
  var tries = 0;
  var SLOW_AFTER = 20;    // ca. et minut
  var MAX_TRIES = 100;    // ca. fem minutter

  /* En serverfejl saa foer PRAECIS ud som "venter stadig": siden proevede
     bare igen og snurrede videre i fem minutter. Nu taelles fejlene, og efter
     et halvt minut i traek gives der besked i stedet for at lade som ingenting.
     Enkelte fejl springes over, for de sker og retter sig selv. */
  var fails = 0;
  var MAX_FAILS = 10;

  /* Hvorfor vi gav op. De to ting er IKKE det samme, og det var en fejl at
     vise den samme besked for begge: en kunde, der var langsom i appen, fik
     "vi kunne ikke finde den booking", hvilket lyder som om pengene er væk. */
  function giveUp(reason) {
    var heading = reason === "unknown" ? T.unknownHeading : T.timeoutHeading;
    var text = reason === "unknown" ? T.unknownText : T.timeoutText;
    var el = states.unknown;
    el.querySelector("h1").textContent = heading || "";
    el.querySelector("p").textContent = text || "";
    show("unknown");
  }

  function poll() {
    fetch("/api/booking?ref=" + encodeURIComponent(ref), {
      headers: { accept: "application/json" }
    })
      .then(function (r) {
        if (r.status === 404 || r.status === 400) throw new Error("unknown");
        if (!r.ok) throw new Error("retry");
        return r.json();
      })
      .then(function (data) {
        fails = 0;
        /* Tegningen har SIN EGEN fangst.
           Uden den ville en fejl i koden — et element, der ikke findes, fordi
           skabelonen og scriptet er kommet ud af trit — blive fanget af
           .catch() nedenfor og opfattet som en netværksfejl. Så prøver siden
           bare igen, og kunden ser en evig spinner i stedet for en besked.
           Præcis dét skete 2/9-2026, da thAddress blev klippet ud af
           skabelonen ved et uheld. At prøve igen hjælper aldrig på den slags. */
        try {
          /* "review" betyder, at bookingen står, men at depositummet ikke kunne
             hæves. Det er Wiktorias sag hos MobilePay, ikke kundens: hun har
             sin tid, og hun skal se en kvittering. */
          if (data.status === "done" || data.status === "booked" || data.status === "review") {
            renderDone(data);
            return;
          }
          if (data.status === "cancelled") { show("cancelled"); return; }
          if (data.status === "failed") { show("failed"); return; }
        } catch (e) {
          if (window.console) console.error("kunne ikke tegne kvitteringen", e);
          giveUp("timeout");
          return;
        }

        /* Stadig undervejs. Efter et minut skiftes teksten, så hun kan se at
           vi venter på HENDE og ikke på os selv. */
        if (++tries === SLOW_AFTER) {
          document.querySelector("#thWait p").textContent = T.waitSlow || T.waitText || "";
        }
        if (tries < MAX_TRIES) {
          window.setTimeout(poll, 3000);
        } else {
          giveUp("timeout");
        }
      })
      .catch(function (err) {
        if (err.message === "unknown") { giveUp("unknown"); return; }
        if (++fails >= MAX_FAILS || ++tries >= MAX_TRIES) { giveUp("timeout"); return; }
        window.setTimeout(poll, 3000);
      });
  }

  show("wait");
  poll();
})();
