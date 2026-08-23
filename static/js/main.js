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
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

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

  /* Cal-booking: hentes først når den besøgende trykker.
     Se layouts/partials/cal-embed.html for hvorfor det ikke er et
     almindeligt script i sidehovedet. */
  document.querySelectorAll(".cal-slot").forEach(function (slot) {
    var knap = slot.querySelector(".cal-load");
    if (!knap) return;
    knap.addEventListener("click", function () {
      var ns = slot.getAttribute("data-cal-ns");
      var link = slot.getAttribute("data-cal-link");
      var mount = slot.querySelector(".cal-mount");
      var invite = slot.querySelector(".cal-invite");
      knap.disabled = true;
      knap.textContent = knap.getAttribute("data-loading") || "…";

      /* Cals egen loader-stub, uændret fra deres embed-snippet. */
      (function (C, A, L) { var p = function (a, ar) { a.q.push(ar); }; var d = C.document; C.Cal = C.Cal || function () { var cal = C.Cal; var ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement("script")).src = A; cal.loaded = true; } if (ar[0] === L) { var api = function () { p(api, arguments); }; var namespace = ar[1]; api.q = api.q || []; if (typeof namespace === "string") { cal.ns[namespace] = cal.ns[namespace] || api; p(cal.ns[namespace], ar); p(cal, ["initNamespace", namespace]); } else p(cal, ar); return; } p(cal, ar); }; })(window, "https://app.cal.eu/embed/embed.js", "init");

      Cal("init", ns, { origin: "https://app.cal.eu" });
      Cal.config = Cal.config || {};
      Cal.config.forwardQueryParams = true;

      mount.style.display = "";
      invite.style.display = "none";

      /* Tema skal sættes BÅDE her og i ui() nedenfor — kun ét af stederne
         giver mørkt tema i en lys kortboks. */
      Cal.ns[ns]("inline", {
        elementOrSelector: "#cal-inline-" + ns,
        config: { layout: "month_view", useSlotsViewOnSmallScreen: "true", theme: "light", timeFormat: "24" },
        calLink: link,
      });
      Cal.ns[ns]("ui", {
        hideEventTypeDetails: false,
        layout: "month_view",
        theme: "light",
        styles: { branding: { brandColor: "#4D0E13" } },
      });
    });
  });

})();
