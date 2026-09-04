/* Wiktoria Gordon Beauty — interaktion */
(function () {
  "use strict";

  var header = document.getElementById("header");
  var toggle = document.getElementById("navToggle");
  var menu = document.getElementById("navMenu");
  var body = document.body;
  var navLinks = document.querySelectorAll('.nav-links a[href^="#"]');

  /* Sticky header-baggrund efter scroll */
  function onScroll() {
    if (window.scrollY > 24) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
    updateActiveNav();
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* Mobilmenu */
  var labelOpen = (toggle && toggle.dataset.open) || "Menu";
  var labelClose = (toggle && toggle.dataset.close) || "Close";
  function updateActiveNav() {
    var active = null;
    navLinks.forEach(function (link) {
      var target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      var rect = target.getBoundingClientRect();
      if (rect.top <= 150 && rect.bottom > 150) active = link;
    });
    navLinks.forEach(function (link) {
      var isActive = link === active;
      link.classList.toggle("active", isActive);
      if (isActive) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }
  function closeMenu() {
    body.classList.remove("nav-open");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", labelOpen);
    }
  }
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? labelClose : labelOpen);
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && body.classList.contains("nav-open")) {
        closeMenu();
        toggle.focus();
      }
    });
    document.addEventListener("click", function (e) {
      if (body.classList.contains("nav-open") && !menu.contains(e.target) && !toggle.contains(e.target)) closeMenu();
    });
  }

  /* Fade-in ved scroll */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });

    /* Heroen ligger altid over folden og skal ikke afhænge af observeren.
       Den måler ved indlæsning, og skifter layoutet bagefter — fordi
       skrifterne falder på plads, eller fordi billedet ligger øverst på en
       telefon og skubber teksten ned — kan overskriften ende lige under
       observerens nedre kant og aldrig blive vist. Sidens vigtigste
       overskrift må ikke kunne forsvinde på den måde. Animationen kører
       stadig; den udløses bare med det samme i stedet for ved scroll. */
    requestAnimationFrame(function () {
      document.querySelectorAll(".hero .reveal").forEach(function (el) {
        el.classList.add("in");
        io.unobserve(el);
      });
    });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* På telefon vises tre anmeldelser først. Resten åbnes på stedet, så
     siden forbliver kort uden at skjule de udvalgte citater permanent. */
  var reviewsGrid = document.getElementById("reviewsGrid");
  var reviewsToggle = document.getElementById("reviewsToggle");
  var reviewsToggleWrap = document.getElementById("reviewsToggleWrap");
  if (reviewsGrid && reviewsToggle && reviewsToggleWrap) {
    reviewsGrid.classList.add("is-collapsible");
    reviewsToggleWrap.classList.add("is-ready");
    reviewsToggle.addEventListener("click", function () {
      var expanded = reviewsGrid.classList.toggle("is-expanded");
      reviewsToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      reviewsToggle.textContent = expanded ? reviewsToggle.dataset.less : reviewsToggle.dataset.more;
    });
  }

  /* Behandlingskortene er foldet sammen på telefon: beskrivelsen står
     fremme, punkterne under "Læs mere". Knappen er skjult af CSS'en på
     brede skærme, hvor alt allerede står der. Teksten forlader aldrig
     HTML'en, så den kan læses uden JavaScript og af søgemaskiner. */
  document.querySelectorAll(".service-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var card = btn.closest(".service");
      if (!card) return;
      var open = card.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? btn.dataset.less : btn.dataset.more;
    });
  });

  /* Før/efter-slider */
  var baSlider = document.getElementById("baSlider");
  var baRange = document.getElementById("baRange");
  if (baSlider && baRange) {
    var setPos = function (val) {
      baSlider.style.setProperty("--pos", val + "%");
    };
    baRange.addEventListener("input", function () { setPos(baRange.value); });
    /* Direkte træk/klik hvor som helst på billedet */
    var dragging = false;
    var updateFromX = function (clientX) {
      var rect = baSlider.getBoundingClientRect();
      var pct = ((clientX - rect.left) / rect.width) * 100;
      pct = Math.max(0, Math.min(100, pct));
      baRange.value = pct;
      setPos(pct);
    };
    baSlider.addEventListener("pointerdown", function (e) {
      dragging = true;
      baSlider.setPointerCapture(e.pointerId);
      updateFromX(e.clientX);
    });
    baSlider.addEventListener("pointermove", function (e) {
      if (dragging) updateFromX(e.clientX);
    });
    baSlider.addEventListener("pointerup", function () { dragging = false; });
    baSlider.addEventListener("pointercancel", function () { dragging = false; });

    /* Skift mellem før/efter-par. Knapperne er skjult indtil her, så de ikke
       står og ser klikbare ud, hvis scriptet aldrig når at køre. */
    var baTabs = document.getElementById("baTabs");
    var baBefore = document.getElementById("baBefore");
    var baAfter = document.getElementById("baAfter");
    if (baTabs && baBefore && baAfter) {
      var tabs = Array.prototype.slice.call(baTabs.querySelectorAll(".ba-tab"));
      baTabs.classList.add("is-ready");
      /* Hent de øvrige par på forhånd, så skiftet ikke blinker hvidt */
      tabs.forEach(function (t) {
        [t.dataset.before, t.dataset.after].forEach(function (u) {
          var pre = new Image();
          pre.src = u;
        });
      });
      tabs.forEach(function (t) {
        t.addEventListener("click", function () {
          if (t.classList.contains("is-active")) return;
          baBefore.src = t.dataset.before;
          baAfter.src = t.dataset.after;
          tabs.forEach(function (o) {
            o.classList.toggle("is-active", o === t);
            o.setAttribute("aria-pressed", o === t ? "true" : "false");
          });
          baRange.value = 50;
          setPos(50);
        });
      });
    }
  }

  /* Klik på et resultatbillede åbner det i fuld bredde. Strimlen beskærer
     til 4:5, så de brede før/efter-billeder ellers kun ses som en stribe. */
  var lightbox = document.getElementById("lightbox");
  var strip = document.getElementById("resultsStrip");
  if (lightbox && strip) {
    var shots = Array.prototype.slice.call(strip.querySelectorAll(".results-open"));
    var lbImg = document.getElementById("lbImg");
    var lbCap = document.getElementById("lbCap");
    var lbPrev = document.getElementById("lbPrev");
    var lbNext = document.getElementById("lbNext");
    var lbClose = document.getElementById("lbClose");
    var current = 0;
    var opener = null;

    strip.classList.add("is-clickable");

    var show = function (i) {
      current = (i + shots.length) % shots.length;
      var img = shots[current].querySelector("img");
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.alt || "";
      lbCap.textContent = img.alt || "";
    };
    var open = function (i) {
      opener = shots[i];
      show(i);
      lightbox.hidden = false;
      lightbox.setAttribute("aria-hidden", "false");
      document.body.classList.add("no-scroll");
      lbClose.focus();
    };
    var close = function () {
      lightbox.hidden = true;
      lightbox.setAttribute("aria-hidden", "true");
      document.body.classList.remove("no-scroll");
      if (opener) opener.focus();
    };

    shots.forEach(function (b, i) {
      b.addEventListener("click", function () { open(i); });
    });
    lbPrev.addEventListener("click", function () { show(current - 1); });
    lbNext.addEventListener("click", function () { show(current + 1); });
    lbClose.addEventListener("click", close);
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) close();
    });
    document.addEventListener("keydown", function (e) {
      if (lightbox.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") show(current - 1);
      else if (e.key === "ArrowRight") show(current + 1);
      else if (e.key === "Tab") {
        /* Hold tastaturet inde i overlayet, så man ikke taber fokus ned
           bag ved det, mens det er åbent. */
        var f = [lbClose, lbPrev, lbNext];
        var i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
  }

  /* Blødt scroll med kompensation for fast header */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (e) {
      var id = link.getAttribute("href");
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      var top = target.getBoundingClientRect().top + window.scrollY - 70;
      var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: top, behavior: reduced ? "auto" : "smooth" });
      history.replaceState(null, "", id);
    });
  });

  /* Direkte links til en sektion skal også lande under det faste sidehoved.
     Browserens normale hash-scroll sker før fonte og billeder er faldet på
     plads, så positionen bliver ellers upræcis på lange sider. */
  window.addEventListener("load", function () {
    if (!window.location.hash || window.location.hash.length < 2) return;
    var target = document.querySelector(window.location.hash);
    if (!target) return;
    window.setTimeout(function () {
      var top = target.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top: top, behavior: "auto" });
    }, 80);
  });

  /* Den gamle indlejrede Cal-kalender er væk. Bookingen ligger nu på sitet
     selv i static/js/booking.js, og der hentes ikke længere noget fra en
     tredjepart. CSP'en i static/_headers tillader det heller ikke mere, og
     scripts/security-check.sh nægter at bygge, hvis den kommer tilbage:
     en embed henter noget om den besøgende ved sideindlæsning, og så skal
     sitet også have et samtykkebanner. */

})();
