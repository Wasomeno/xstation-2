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
    "#title, #hero-cta",
    { autoAlpha: 1, scale: 1 },
    { autoAlpha: 0, scale: 0.985, ease: "none", duration: 0.2, immediateRender: false },
    0.08
  );
  passTl.fromTo(
    "#veil, #vignette, #edge-fade",
    { autoAlpha: 1 },
    { autoAlpha: 0, ease: "none", duration: 0.22, immediateRender: false },
    0.12
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
    end: () => "+=" + window.innerHeight * 1.6,
    pin: "#root",
    pinSpacing: false,
    anticipatePin: 1,
    scrub: 0.45,
    invalidateOnRefresh: true,
    animation: passTl,
    onUpdate: (self) => {
      if (self.progress <= 0.001) {
        if (field.mode === "pass") field.setMode("idle");
        return;
      }
      if (field.mode === "idle") field.setMode("pass");
    },
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
  const lines = document.querySelectorAll("#title span");
  field.startIdle();

  if (!gsap) return;
  if (reduce) {
    gsap.set("#site-nav, #title, #hero-cta", { autoAlpha: 1, y: 0 });
    gsap.set(lines, { autoAlpha: 1, y: 0 });
    return;
  }

  gsap.set("#title", { autoAlpha: 1 });
  gsap.set(lines, { autoAlpha: 0, y: 36 });
  gsap.set("#site-nav", { autoAlpha: 0, y: -14 });
  gsap.set("#hero-cta", { autoAlpha: 0, y: 18 });

  const tl = gsap.timeline({ delay: 0.32 });
  tl.to(
    lines,
    { autoAlpha: 1, y: 0, duration: 1.05, ease: "expo.out", stagger: 0.11 },
    0
  );
  tl.to(
    "#site-nav",
    { autoAlpha: 1, y: 0, duration: 0.8, ease: "power2.out" },
    0.18
  );
  tl.to(
    "#hero-cta",
    { autoAlpha: 1, y: 0, duration: 0.85, ease: "expo.out" },
    0.28
  );
}

function applyShot() {
  if (!shot) return false;
  const pinSlot = document.getElementById("pin-slot");
  const workRoot = document.getElementById("work-root");
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

const isShot = applyShot();

if (gsap && ScrollTrigger && !isShot) {
  gsap.registerPlugin(ScrollTrigger);
  gsap.set("#site-nav, #title, #hero-cta", { autoAlpha: 0 });
  const ctx = gsap.context(() => {
    smooth();
    bindPass();
    bindEnter();
    bindFieldPause();
  }, document.body);

  window.addEventListener("load", () => ScrollTrigger.refresh());
  window.addEventListener("pagehide", () => ctx.revert());
} else if (!isShot) {
  smooth();
}

if (!isShot) revealField();
