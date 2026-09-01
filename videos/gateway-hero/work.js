import { createField } from "./field.js";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shot = new URLSearchParams(window.location.search).get("shot");
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;

const field = createField({
  root: document.getElementById("field"),
  gsap,
  reduce,
});

function bindTabs() {
  document.querySelectorAll(".space-panel").forEach((panel) => {
    panel.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const pane = tab.dataset.pane;
        panel.querySelectorAll(".tab").forEach((t) => {
          const on = t === tab;
          t.classList.toggle("is-on", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        panel.querySelectorAll(".pane").forEach((p) => {
          p.hidden = p.id !== pane;
        });
      });
    });
  });
}

function bindThumbs() {
  document.addEventListener("click", (e) => {
    const thumb = e.target.closest(".thumb");
    if (!thumb) return;
    const space = thumb.closest(".space");
    const hero = space && space.querySelector("img.hero");
    if (hero && thumb.dataset.src) hero.src = thumb.dataset.src;
  });
}

function bindForm() {
  const form = document.getElementById("inquiry-form");
  const status = document.getElementById("inquiry-status");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const note = String(data.get("note") || "").trim();
    if (!name || !email) {
      if (status) status.textContent = "Name and email are required.";
      return;
    }

    const subject = encodeURIComponent("XSTATION brief from " + name);
    const body = encodeURIComponent("Name: " + name + "\nEmail: " + email + "\n\n" + note);
    window.location.href = "mailto:hello@xstation?subject=" + subject + "&body=" + body;
    if (status) status.textContent = "Opening your mail app.";
    form.reset();
  });
}

function smooth() {
  if (reduce || shot || typeof window.Lenis !== "function") return null;

  const lenis = new window.Lenis({
    duration: 1.6,
    lerp: 0.055,
    wheelMultiplier: 0.7,
    touchMultiplier: 1.15,
    easing: function (t) {
      return 1 - Math.pow(1 - t, 3);
    },
    smoothWheel: true,
  });

  if (gsap && ScrollTrigger) {
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (time) {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  } else {
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const el = document.querySelector(href);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: -8, duration: 1.6 });
    });
  });

  return lenis;
}

function bindPass() {
  if (reduce || shot || !gsap || !ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  const passTl = gsap.timeline();
  passTl.fromTo(
    "#title",
    { autoAlpha: 1, scale: 1 },
    { autoAlpha: 0, scale: 0.985, ease: "none", duration: 0.2, immediateRender: false },
    0.08
  );
  passTl.fromTo(
    "#field",
    { perspective: 1100 },
    { perspective: 720, ease: "none", duration: 0.54 },
    0.18
  );
  passTl.to("#field", { perspective: 1100, ease: "none", duration: 0.22 }, 0.78);
  passTl.fromTo(
    "#veil, #vignette, #edge-fade",
    { autoAlpha: 1 },
    { autoAlpha: 0, ease: "none", duration: 0.3 },
    0.32
  );
  passTl.fromTo(
    "#gate-threshold",
    { autoAlpha: 0 },
    { autoAlpha: 1, duration: 0.06, ease: "power2.out" },
    0.52
  );
  passTl.to("#gate-threshold", { autoAlpha: 0, duration: 0.08, ease: "power2.in" }, 0.64);
  passTl.fromTo(
    "#gate-scan",
    { attr: { y: -1.12 } },
    { attr: { y: 1.1 }, ease: "power2.inOut", duration: 0.12 },
    0.52
  );
  passTl.to(
    {},
    {
      duration: 1,
      ease: "none",
      onUpdate: function () {
        field.setProgress(this.progress());
      },
    },
    0
  );

  ScrollTrigger.create({
    id: "hero-pass",
    trigger: "#pin-slot",
    start: "top top",
    end: () => window.innerHeight * 1.6,
    pin: "#root",
    pinSpacing: false,
    scrub: 0.45,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    animation: passTl,
    onEnter: () => field.setMode("pass"),
    onLeave: () => field.setMode("whisper"),
    onEnterBack: () => field.setMode("pass"),
    onLeaveBack: () => field.setMode("idle"),
  });

  window.visualViewport?.addEventListener("resize", () => ScrollTrigger.refresh());
  window.addEventListener("orientationchange", () => ScrollTrigger.refresh());
}

function bindEnter() {
  if (!gsap || !ScrollTrigger) return;
  const blurOn = !reduce && !window.matchMedia("(max-width: 767px)").matches;
  if (reduce) {
    gsap.set(".js-enter, .js-enter-child", { autoAlpha: 1, scale: 1, filter: "none" });
    return;
  }
  document.querySelectorAll(".js-enter").forEach((el) => {
    const kids = el.querySelectorAll(".js-enter-child");
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        start: "top 78%",
        once: true,
      },
    });
    tl.fromTo(
      el,
      { scale: 0.94, autoAlpha: 0, filter: blurOn ? "blur(8px)" : "none" },
      { scale: 1, autoAlpha: 1, filter: "none", duration: 0.9, ease: "expo.out" }
    );
    if (kids.length) {
      tl.fromTo(
        kids,
        { autoAlpha: 0, y: 0, scale: 0.98 },
        { autoAlpha: 1, scale: 1, duration: 0.55, ease: "power2.out", stagger: 0.07 },
        0.12
      );
    }
  });
}

function bindFieldPause() {
  if (reduce || shot || !ScrollTrigger) return;
  let pauseCount = 0;
  function bump(on) {
    pauseCount += on ? 1 : -1;
    if (pauseCount < 0) pauseCount = 0;
    field.setMode(pauseCount > 0 ? "paused" : "whisper");
  }

  ["#kite", "#meridian", "#relay", "#quorum"].forEach((sel) => {
    ScrollTrigger.create({
      trigger: sel,
      start: "top 70%",
      end: "bottom 30%",
      onEnter: () => bump(true),
      onLeave: () => bump(false),
      onEnterBack: () => bump(true),
      onLeaveBack: () => bump(false),
    });
  });
}

function revealField() {
  if (!gsap) {
    field.startIdle();
    return;
  }
  if (reduce) {
    gsap.set("#site-nav, #title", { autoAlpha: 1, y: 0 });
    field.startIdle();
    return;
  }
  gsap.fromTo(
    "#site-nav",
    { autoAlpha: 0, y: -10 },
    { autoAlpha: 1, y: 0, duration: 0.7, ease: "power2.out", delay: 0.08 }
  );
  gsap.fromTo(
    "#title",
    { autoAlpha: 0 },
    { autoAlpha: 1, duration: 0.7, ease: "power1.out", delay: 0.25 }
  );
  field.startIdle();
}

function applyShot() {
  if (!shot) return false;
  const boot = document.getElementById("boot");
  const pinSlot = document.getElementById("pin-slot");
  const workRoot = document.getElementById("work-root");
  if (boot) boot.hidden = true;
  if (pinSlot) pinSlot.style.display = "none";
  if (workRoot) workRoot.style.marginTop = "0";
  const target = document.getElementById(shot);
  if (target) {
    document.querySelectorAll("#work-root > *").forEach((child) => {
      if (child !== target) child.style.display = "none";
    });
  }
  return true;
}

bindTabs();
bindThumbs();
bindForm();

const isShot = applyShot();

if (gsap && ScrollTrigger && !isShot) {
  gsap.registerPlugin(ScrollTrigger);
  gsap.set("#site-nav, #title", { autoAlpha: 0 });
  const ctx = gsap.context(() => {
    smooth();
    bindPass();
    bindEnter();
    bindFieldPause();
  }, document.body);

  window.addEventListener("load", () => ScrollTrigger.refresh());
  window.addEventListener("gateway:reveal", () => ScrollTrigger.refresh());
  window.addEventListener("pagehide", () => ctx.revert());
} else if (!isShot) {
  smooth();
}

if (isShot) {
  /* field stays idle-paused; no startIdle */
} else if (window.__gatewayReady) {
  revealField();
} else {
  window.addEventListener("gateway:reveal", revealField, { once: true });
}
