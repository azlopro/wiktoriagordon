/* Wiktoria Gordon Beauty — interaktion */
(function () {
  "use strict";

  var header = document.getElementById("header");
  var toggle = document.getElementById("navToggle");
  var menu = document.getElementById("navMenu");
  var body = document.body;

  /* Sticky header-baggrund efter scroll */
  function onScroll() {
    if (window.scrollY > 24) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* Mobilmenu */
  var labelOpen = (toggle && toggle.dataset.open) || "Menu";
  var labelClose = (toggle && toggle.dataset.close) || "Close";
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
      if (e.key === "Escape") closeMenu();
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
      window.scrollTo({ top: top, behavior: "smooth" });
      history.replaceState(null, "", id);
    });
  });
})();
