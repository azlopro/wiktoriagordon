/* Tidsvælgeren.
 *
 * Henter ledige tider fra /api/slots, som taler med Cal på serversiden.
 * Hverken Cal-nøglen eller beløbet findes her: beløbet regnes ud af Workeren
 * ud fra prislisten, så en ændret formular ikke kan flytte prisen.
 *
 * Uden JavaScript kører intet af det her, og DM-knapperne står tilbage. Derfor
 * afsløres vælgeren først når scriptet er nået hertil.
 */
(function () {
  "use strict";

  var root = document.getElementById("bookingPicker");
  if (!root) return;

  var T = JSON.parse(root.dataset.treatments || "[]");
  var L = JSON.parse(root.dataset.labels || "{}");
  var LOCALE = root.dataset.locale || "da-DK";
  if (!T.length) return;

  var elTreatment = document.getElementById("bpTreatment");
  var elDays = document.getElementById("bpDays");
  var elTimes = document.getElementById("bpTimes");
  var elTimesStep = document.getElementById("bpTimesStep");
  var elStatus = document.getElementById("bpStatus");
  var elWeek = document.getElementById("bpWeek");
  var elForm = document.getElementById("bpForm");
  var elChosen = document.getElementById("bpChosen");
  var elReach = document.getElementById("bpReach");
  var fallback = document.getElementById("bookingFallback");

  var weekStart = startOfWeek(new Date());
  var slotsByDay = {};
  var chosenDay = null;
  var chosenTime = null;
  var requestToken = 0;

  /* --- datoer ------------------------------------------------------------ */

  function startOfWeek(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    /* Mandag som ugestart, som man regner uger i Danmark. */
    var day = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - day);
    return x;
  }
  function addDays(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function iso(d) {
    /* Lokal dato, ikke UTC: toISOString ville skubbe en dag i sommertid. */
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function sameDay(a, b) {
    return iso(a) === iso(b);
  }

  var fmtDayName = new Intl.DateTimeFormat(LOCALE, { weekday: "short" });
  var fmtDayNum = new Intl.DateTimeFormat(LOCALE, { day: "numeric" });
  var fmtMonth = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
  var fmtTime = new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen",
  });
  var fmtLong = new Intl.DateTimeFormat(LOCALE, {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen",
  });

  /* --- hentning ---------------------------------------------------------- */

  /* reach = tilbyd en vej til hende. Vises når der ikke er noget at vælge,
     uanset om ugen er tom eller kaldet fejlede. */
  function status(text, reach) {
    elStatus.textContent = text || "";
    elStatus.hidden = !text;
    if (elReach) elReach.hidden = !reach;
  }

  function load() {
    var slug = elTreatment.value;
    var from = iso(weekStart);
    var to = iso(addDays(weekStart, 7));
    var token = ++requestToken;

    chosenDay = null;
    chosenTime = null;
    elForm.hidden = true;
    elTimesStep.hidden = true;
    status(L.loading);
    renderDays();

    fetch("/api/slots?treatment=" + encodeURIComponent(slug) +
          "&from=" + from + "&to=" + to, { headers: { accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (data) {
        /* Et langsomt svar på en uge, brugeren har forladt, må ikke overskrive
           det hun kigger på nu. */
        if (token !== requestToken) return;
        slotsByDay = data.days || {};
        var any = Object.keys(slotsByDay).length > 0;
        status(any ? "" : L.empty, !any);
        renderDays();
      })
      .catch(function () {
        if (token !== requestToken) return;
        slotsByDay = {};
        status(L.error, true);
        renderDays();
      });
  }

  /* --- tegning ----------------------------------------------------------- */

  function renderDays() {
    elWeek.textContent = fmtMonth.format(weekStart);
    elDays.textContent = "";
    var today = new Date();

    for (var i = 0; i < 7; i++) {
      var d = addDays(weekStart, i);
      var key = iso(d);
      var has = (slotsByDay[key] || []).length > 0;

      var b = document.createElement("button");
      b.type = "button";
      b.className = "bp-day";
      b.disabled = !has;
      if (sameDay(d, today)) b.classList.add("is-today");
      if (chosenDay === key) b.classList.add("is-active");
      b.setAttribute("aria-pressed", chosenDay === key ? "true" : "false");

      var name = document.createElement("span");
      name.className = "bp-day-name";
      name.textContent = fmtDayName.format(d).replace(".", "");
      var num = document.createElement("span");
      num.className = "bp-day-num";
      num.textContent = fmtDayNum.format(d);
      b.appendChild(name);
      b.appendChild(num);

      (function (key) {
        b.addEventListener("click", function () { pickDay(key); });
      })(key);
      elDays.appendChild(b);
    }
  }

  function pickDay(key) {
    chosenDay = key;
    chosenTime = null;
    elForm.hidden = true;
    renderDays();

    var times = slotsByDay[key] || [];
    elTimes.textContent = "";
    elTimesStep.hidden = times.length === 0;

    times.forEach(function (isoTime) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "bp-time";
      b.textContent = fmtTime.format(new Date(isoTime));
      b.addEventListener("click", function () { pickTime(isoTime, b); });
      elTimes.appendChild(b);
    });
  }

  function pickTime(isoTime, button) {
    chosenTime = isoTime;
    Array.prototype.forEach.call(elTimes.children, function (el) {
      el.classList.toggle("is-active", el === button);
      el.setAttribute("aria-pressed", el === button ? "true" : "false");
    });

    var t = T.filter(function (x) { return x.slug === elTreatment.value; })[0];
    elChosen.textContent = "";
    var line = document.createElement("p");
    line.className = "bp-chosen-line";
    line.textContent = t.title + " · " + fmtLong.format(new Date(isoTime));
    elChosen.appendChild(line);

    elForm.hidden = false;
    elForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* --- hændelser --------------------------------------------------------- */

  elTreatment.addEventListener("change", load);
  document.getElementById("bpPrev").addEventListener("click", function () {
    var earliest = startOfWeek(new Date());
    var candidate = addDays(weekStart, -7);
    /* Der er ingen grund til at kunne bladre bagud i tiden. */
    weekStart = candidate < earliest ? earliest : candidate;
    load();
  });
  document.getElementById("bpNext").addEventListener("click", function () {
    weekStart = addDays(weekStart, 7);
    load();
  });

  elForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!chosenTime) return;
    /* Betalingen kobles på her, når MobilePay-aftalen er godkendt. */
    status("");
  });

  /* Book-knapperne i prislisten fører herned med behandlingen valgt, så man
     ikke skal finde den igen i rullelisten. */
  Array.prototype.forEach.call(document.querySelectorAll(".price-book"), function (link) {
    link.addEventListener("click", function () {
      var slug = link.dataset.treatment;
      if (!slug) return;
      var match = Array.prototype.some.call(elTreatment.options, function (o) {
        return o.value === slug;
      });
      if (!match) return;
      elTreatment.value = slug;
      load();
    });
  });

  /* Vælgeren afsløres først nu, hvor den beviseligt kan bruges. */
  root.classList.add("is-ready");
  if (fallback) fallback.hidden = true;
  load();
})();
