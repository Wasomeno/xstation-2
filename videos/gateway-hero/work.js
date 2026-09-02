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

let scroller = null;

function originFrom(el, dest) {
  const from = el.getBoundingClientRect();
  const to = dest.getBoundingClientRect();
  return {
    x: from.left + from.width / 2 - (to.left + to.width / 2),
    y: from.top + from.height / 2 - (to.top + to.height / 2),
    scale: Math.max(0.08, from.width / Math.max(to.width, 1)),
  };
}

function bindThumbs() {
  const look = document.getElementById("look");
  const veil = look && look.querySelector(".look-veil");
  const media = look && look.querySelector(".look-media");
  const img = document.getElementById("look-img");
  const caption = document.getElementById("look-caption");
  const closeBtn = look && look.querySelector(".look-close");
  if (!look || !veil || !media || !img || !caption || !closeBtn) return;

  const inertEls = ["pin-slot", "work-root", "site-nav", "field-stage"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  let open = false;
  let closing = false;
  let lastThumb = null;
  let lookTl = null;
  let restoreFocus = null;
  let token = 0;

  document.querySelectorAll(".thumb").forEach((thumb) => {
    thumb.setAttribute("aria-haspopup", "dialog");
    thumb.setAttribute("aria-expanded", "false");
    thumb.setAttribute("aria-controls", "look");
  });

  function setInert(on) {
    inertEls.forEach((el) => {
      if (on) el.setAttribute("inert", "");
      else el.removeAttribute("inert");
    });
  }

  function syncHero(thumb) {
    const frame = thumb.closest(".space, .stage");
    const hero =
      (frame && frame.querySelector("img.hero")) ||
      (frame && frame.querySelector(".stage-media img"));
    const src = thumb.dataset.src;
    if (!hero || !src) return;
    hero.src = src;
    const label = thumb.getAttribute("aria-label");
    if (label) hero.alt = label;
  }

  function lockPage(on) {
    document.documentElement.classList.toggle("is-looking", on);
    if (on) scroller?.stop();
    else scroller?.start();
    setInert(on);
  }

  function showInstant() {
    if (gsap) {
      gsap.set(veil, { autoAlpha: 1 });
      gsap.set(media, { autoAlpha: 1, x: 0, y: 0, scale: 1 });
      gsap.set(caption, { autoAlpha: 1, y: 0 });
      gsap.set(closeBtn, { autoAlpha: 1, y: 0 });
    } else {
      veil.style.opacity = "1";
      media.style.opacity = "1";
      media.style.transform = "none";
      caption.style.opacity = "1";
      closeBtn.style.opacity = "1";
    }
  }

  function playOpen(thumb) {
    if (!gsap || reduce) {
      showInstant();
      return;
    }

    gsap.set(veil, { autoAlpha: 0 });
    gsap.set(media, { autoAlpha: 0, x: 0, y: 0, scale: 1 });
    gsap.set(caption, { autoAlpha: 0, y: 10 });
    gsap.set(closeBtn, { autoAlpha: 0, y: -8 });

    const origin = originFrom(thumb, media);
    gsap.set(media, {
      x: origin.x,
      y: origin.y,
      scale: origin.scale,
      autoAlpha: 0.55,
    });

    lookTl = gsap.timeline({
      onComplete: () => {
        lookTl = null;
      },
    });
    lookTl.to(veil, { autoAlpha: 1, duration: 0.4, ease: "power2.out" }, 0);
    lookTl.to(
      media,
      { x: 0, y: 0, scale: 1, autoAlpha: 1, duration: 0.72, ease: "expo.out" },
      0.04
    );
    lookTl.to(
      closeBtn,
      { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out" },
      0.22
    );
    lookTl.to(
      caption,
      { autoAlpha: 1, y: 0, duration: 0.45, ease: "power2.out" },
      0.28
    );
  }

  async function openLook(thumb) {
    const src = thumb.dataset.src;
    if (!src || closing) return;
    const mine = ++token;

    syncHero(thumb);

    if (lastThumb && lastThumb !== thumb) {
      lastThumb.setAttribute("aria-expanded", "false");
    }
    lastThumb = thumb;
    thumb.setAttribute("aria-expanded", "true");

    const label = thumb.getAttribute("aria-label") || "";
    img.src = src;
    img.alt = label;
    caption.textContent = label;
    if (typeof img.decode === "function") {
      try {
        await img.decode();
      } catch (_) {
        /* cached or broken; still open */
      }
    }
    if (mine !== token || closing) return;

    if (open) {
      if (!gsap || reduce) return;
      gsap.fromTo(
        media,
        { autoAlpha: 0.7, scale: 0.985 },
        { autoAlpha: 1, scale: 1, duration: 0.35, ease: "expo.out" }
      );
      return;
    }

    restoreFocus = document.activeElement;
    look.hidden = false;
    look.classList.add("is-open");
    open = true;
    lockPage(true);
    playOpen(thumb);
    closeBtn.focus();
  }

  function finishClose() {
    if (gsap) gsap.set([veil, media, caption, closeBtn], { clearProps: "all" });
    look.classList.remove("is-open");
    look.hidden = true;
    open = false;
    closing = false;
    lookTl = null;
    lockPage(false);
    if (lastThumb) lastThumb.setAttribute("aria-expanded", "false");
    const focusEl = restoreFocus;
    restoreFocus = null;
    if (focusEl && typeof focusEl.focus === "function") focusEl.focus();
  }

  function closeLook() {
    if (!open || closing) return;
    closing = true;
    token += 1;
    if (lookTl) lookTl.kill();

    if (!gsap || reduce) {
      finishClose();
      return;
    }

    const origin = lastThumb
      ? originFrom(lastThumb, media)
      : { x: 0, y: 18, scale: 0.96 };

    lookTl = gsap.timeline({ onComplete: finishClose });
    lookTl.to(closeBtn, { autoAlpha: 0, y: -6, duration: 0.18, ease: "power2.in" }, 0);
    lookTl.to(caption, { autoAlpha: 0, y: 8, duration: 0.2, ease: "power2.in" }, 0);
    lookTl.to(
      media,
      {
        x: origin.x,
        y: origin.y,
        scale: origin.scale,
        autoAlpha: 0,
        duration: 0.42,
        ease: "power2.in",
      },
      0.02
    );
    lookTl.to(veil, { autoAlpha: 0, duration: 0.32, ease: "power2.in" }, 0.08);
  }

  function onKey(e) {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeLook();
      return;
    }
    if (e.key !== "Tab") return;
    e.preventDefault();
    closeBtn.focus();
  }

  document.addEventListener("click", (e) => {
    const thumb = e.target.closest(".thumb");
    if (thumb) openLook(thumb);
  });
  veil.addEventListener("click", closeLook);
  closeBtn.addEventListener("click", closeLook);
  document.addEventListener("keydown", onKey);
}

function smooth() {
  if (reduce || shot || typeof window.Lenis !== "function") return null;

  const lenis = new window.Lenis({
    duration: 2.6,
    lerp: 0.032,
    wheelMultiplier: 0.42,
    touchMultiplier: 0.85,
    easing: function (t) {
      return 1 - Math.pow(1 - t, 5);
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
      lenis.scrollTo(el, { offset: -8, duration: 2.4 });
    });
  });

  return lenis;
}


function bindPass() {
  if (reduce || shot || !gsap || !ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  const passTl = gsap.timeline();
  passTl.fromTo(
    "#title-layer",
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
  passTl.fromTo(
    "#hero-copy",
    { autoAlpha: 0, y: 22 },
    { autoAlpha: 1, y: 0, ease: "none", duration: 0.22, immediateRender: false },
    0.32
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

  function stationClass(on) {
    document.documentElement.classList.toggle("is-station", on);
  }

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
      stationClass(self.progress > 0.38);
      if (self.progress <= 0.001) {
        if (field.mode === "pass") field.setMode("idle");
        return;
      }
      if (field.mode === "idle") field.setMode("pass");
    },
    onLeave: () => {
      stationClass(true);
      field.setMode("whisper");
    },
    onEnterBack: () => field.setMode("pass"),
    onLeaveBack: () => {
      stationClass(false);
      field.setMode("idle");
    },
  });

  window.visualViewport?.addEventListener("resize", () => ScrollTrigger.refresh());
  window.addEventListener("orientationchange", () => ScrollTrigger.refresh());

  const at = new URLSearchParams(window.location.search).get("at");
  if (at === "station") {
    function jumpStation() {
      ScrollTrigger.refresh();
      const st = ScrollTrigger.getById("hero-pass");
      if (!st) return;
      const y = st.start + (st.end - st.start) * 0.82;
      if (scroller) scroller.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
      ScrollTrigger.update();
    }
    if (document.readyState === "complete") setTimeout(jumpStation, 80);
    else window.addEventListener("load", () => setTimeout(jumpStation, 80));
  }
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

function bindParallax() {
  if (reduce || shot || !gsap || !ScrollTrigger) return;
  if (window.matchMedia("(max-width: 767px)").matches) return;

  document.querySelectorAll(".space-stage img.hero, .stage-media img").forEach((img) => {
    const trigger = img.closest(".space, .stage");
    if (!trigger) return;
    const app = trigger.classList.contains("is-app");
    gsap.fromTo(
      img,
      {
        yPercent: app ? -7 : -14,
        scale: app ? 1 : 1.08,
      },
      {
        yPercent: app ? 7 : 14,
        scale: 1,
        ease: "none",
        force3D: true,
        scrollTrigger: {
          trigger,
          start: "top bottom",
          end: "bottom top",
          scrub: 0.55,
          invalidateOnRefresh: true,
        },
      }
    );
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

  document.querySelectorAll(".space, .stage").forEach((el) => {
    ScrollTrigger.create({
      trigger: el,
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
    gsap.set("#site-nav, #title", { autoAlpha: 1, y: 0 });
    gsap.set(lines, { autoAlpha: 1, y: 0 });
    gsap.set("#hero-copy", { autoAlpha: 0 });
    return;
  }

  gsap.set("#title", { autoAlpha: 1 });
  gsap.set("#hero-copy", { autoAlpha: 0, y: 28 });
  gsap.set(lines, { autoAlpha: 0, y: 36 });
  gsap.set("#site-nav", { autoAlpha: 0, y: -14 });

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

bindThumbs();

const isShot = applyShot();

if (gsap && ScrollTrigger && !isShot) {
  gsap.registerPlugin(ScrollTrigger);
  gsap.set("#site-nav, #title, #hero-copy", { autoAlpha: 0 });
  const ctx = gsap.context(() => {
    scroller = smooth();
    bindPass();
    bindEnter();
    bindParallax();
    bindFieldPause();
  }, document.body);

  window.addEventListener("load", () => ScrollTrigger.refresh());
  window.addEventListener("pagehide", () => ctx.revert());
} else if (!isShot) {
  scroller = smooth();
}

if (!isShot) revealField();
