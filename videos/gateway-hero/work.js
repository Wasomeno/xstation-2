import { createCluster } from "./cluster.js?v=surface-24";

const reducedMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
const reduce = reducedMotionMedia.matches;
const shot = new URLSearchParams(window.location.search).get("shot");
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const ENHANCED_MOTION_QUERY = "(min-width: 64rem) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const smoothScrollMedia = window.matchMedia("(min-width: 64rem) and (hover: hover) and (pointer: fine)");

const cluster = createCluster({
  canvas: document.getElementById("nadi-cluster"),
  active: true,
});

function bindHeroEntry() {
  if (!gsap) return () => {};

  const brand = document.getElementById("brand");
  const titleLines = document.querySelectorAll("#doctrine-title .hero-title-line > span");
  const lead = document.getElementById("doctrine-lead");
  const scope = document.getElementById("hero-scope");
  const actions = document.querySelectorAll("#hero-copy .station-actions .station-cta");
  const animatedElements = [brand, ...titleLines, lead, scope, ...actions].filter(Boolean);
  let timeline = null;

  if (!reduce) {
    gsap.set(brand, { autoAlpha: 0, y: -12 });
    gsap.set(titleLines, {
      autoAlpha: 0,
      yPercent: 110,
      rotate: 1.2,
      transformOrigin: "0% 100%",
    });
    gsap.set(lead, { autoAlpha: 0, y: 22 });
    gsap.set(scope, { autoAlpha: 0, y: 14 });
    gsap.set(actions, { autoAlpha: 0, y: 16, scale: 0.97 });
  }

  function reveal() {
    gsap.set("#site-nav, #hero-copy", { autoAlpha: 1, y: 0 });

    if (reduce) {
      gsap.set(animatedElements, { autoAlpha: 1, clearProps: "transform" });
      return;
    }

    timeline = gsap.timeline({ defaults: { ease: "power3.out" } })
      .to(brand, { autoAlpha: 1, y: 0, duration: 0.62 }, 0.08)
      .to(titleLines, {
        autoAlpha: 1,
        yPercent: 0,
        rotate: 0,
        duration: 0.9,
        stagger: 0.09,
        ease: "expo.out",
      }, 0.18)
      .to(lead, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.42)
      .to(scope, { autoAlpha: 1, y: 0, duration: 0.62 }, 0.5)
      .to(actions, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.62,
        stagger: 0.07,
      }, 0.56);
  }

  reveal();

  return () => {
    timeline?.kill();
  };
}

function smooth() {
  if (
    reducedMotionMedia.matches
    || shot
    || !smoothScrollMedia.matches
    || typeof window.Lenis !== "function"
  ) return null;

  // Keep page traversal close to native; ScrollTrigger owns the hero choreography.
  const lenis = new window.Lenis({
    lerp: 0.09,
    wheelMultiplier: 0.85,
    touchMultiplier: 1,
    smoothWheel: true,
  });

  let ticker = null;
  let rafId = 0;
  if (gsap && ScrollTrigger) {
    lenis.on("scroll", ScrollTrigger.update);
    ticker = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(ticker);
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (time) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);
  }

  const anchorBindings = [];
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    const onClick = (e) => {
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const el = document.querySelector(href);
      if (!el) return;
      e.preventDefault();
      // Anchor jumps use one short, deterministic timing model instead of the global lerp.
      lenis.scrollTo(el, { offset: -8, duration: 0.95, lerp: 0 });
    };
    a.addEventListener("click", onClick);
    anchorBindings.push([a, onClick]);
  });

  lenis.__nadiDestroy = () => {
    if (ticker) gsap.ticker.remove(ticker);
    if (rafId) cancelAnimationFrame(rafId);
    anchorBindings.forEach(([anchor, handler]) => anchor.removeEventListener("click", handler));
    lenis.destroy?.();
  };

  return lenis;
}

let smoothInstance = null;
let smoothStarted = false;

function startSmooth() {
  if (smoothStarted) return smoothInstance;
  smoothStarted = true;
  smoothInstance = smooth();
  if (!smoothInstance) smoothStarted = false;
  return smoothInstance;
}

const VOICE_SECTIONS = new Set([
  "hero",
  "root",
  "system",
  "work",
  "bikinkonten",
  "lubna",
  "crm-ai-agent",
  "hireassess",
  "arkiv",
  "codev",
  "coframe",
  "cofinance",
  "clients",
  "contact",
]);
const voiceActionLog = { entries: [], index: -1 };

function recordVoiceAction(entry) {
  if (!voiceActionLog.entries.length) {
    voiceActionLog.entries.push({ action: "position", top: window.scrollY, focus: document.activeElement });
    voiceActionLog.index = 0;
  }
  voiceActionLog.entries.splice(voiceActionLog.index + 1);
  voiceActionLog.entries.push(entry);
  voiceActionLog.index = voiceActionLog.entries.length - 1;
}

function currentVoiceSection() {
  // A short, top-aligned section can leave the viewport center inside the next one.
  const entry = voiceActionLog.entries[voiceActionLog.index];
  const atActionPosition = entry?.section && Math.abs(window.scrollY - entry.top) < 2;
  let current = null;
  let distance = Infinity;
  for (const id of VOICE_SECTIONS) {
    if (id === "root") continue;
    const el = document.getElementById(id);
    if (!el) continue;
    const bounds = el.getBoundingClientRect();
    if (!bounds.height || bounds.top >= window.innerHeight || bounds.top + bounds.height <= 0) continue;
    if (atActionPosition && id === entry.section) return id;
    const centerDistance = Math.max(bounds.top - window.innerHeight / 2, window.innerHeight / 2 - bounds.top - bounds.height, 0);
    if (centerDistance < distance) { current = id; distance = centerDistance; }
  }
  return current;
}

function showSection(id, focusContact = false, record = true) {
  const sectionId = id === "root" ? "hero" : id;
  if (!VOICE_SECTIONS.has(sectionId)) return false;
  const el = document.getElementById(sectionId);
  if (!el) return false;
  const target = focusContact ? el.querySelector('.project-cta, .inquiry-email') : el;
  if (!target) return false;
  showSection._focus = focusContact ? target : null;
  const duration = reduce ? 0.05 : 1.15;
  const bounds = target.getBoundingClientRect();
  const headerHeight = document.getElementById("site-nav")?.getBoundingClientRect().height || 0;
  const voiceSurface = document.getElementById("voice-surface");
  // The surface is hidden outright on phones, where a display:none element
  // still answers getBoundingClientRect with zeroes.
  const voiceRect = voiceSurface && !voiceSurface.hidden
    ? voiceSurface.getBoundingClientRect()
    : null;
  const voiceTop = voiceRect?.height ? voiceRect.top - 12 : window.innerHeight;
  const availableHeight = Math.max(0, voiceTop - headerHeight);
  const centeredOffset = -(headerHeight + Math.max(0, (availableHeight - bounds.height) / 2));
  const offset = focusContact ? centeredOffset
    : sectionId === "work" ? -(headerHeight + 16)
    : sectionId === "hero" ? 0 : centeredOffset;
  if (record) recordVoiceAction({ action: focusContact ? "contact" : "show", section: sectionId, top: window.scrollY + bounds.top + offset });
  if (smoothInstance) {
    smoothInstance.scrollTo(target, { offset, duration });
  } else {
    window.scrollTo({ top: window.scrollY + bounds.top + offset, behavior: reduce ? "auto" : "smooth" });
  }
  document.querySelectorAll(".is-voice-shown").forEach((node) => node.classList.remove("is-voice-shown"));
  target.classList.add("is-voice-shown");
  if (focusContact) target.focus({ preventScroll: true });
  window.clearTimeout(showSection._timer);
  showSection._timer = window.setTimeout(() => target.classList.remove("is-voice-shown"), 1800);
  return true;
}

function runPageAction(decision) {
  if (decision.action === "back") {
    const index = voiceActionLog.index - 1;
    const entry = voiceActionLog.entries[index];
    if (!entry) return false;
    showSection._focus = null;
    if (entry.action === "show" || entry.action === "contact") {
      if (!showSection(entry.section, entry.action === "contact", false)) return false;
    } else {
      if (smoothInstance) smoothInstance.scrollTo(entry.top, { duration: reduce ? 0.05 : 1.15 });
      else window.scrollTo({ top: entry.top, behavior: reduce ? "auto" : "smooth" });
      entry.focus?.focus({ preventScroll: true });
    }
    voiceActionLog.index = index;
    return true;
  }
  if (decision.action === "next") {
    const order = [...VOICE_SECTIONS].filter(id => id !== "root");
    const current = currentVoiceSection();
    const index = order.indexOf(current);
    if (index < 0 || index >= order.length - 1) return false;
    return showSection(order[index + 1]);
  }
  if (decision.action === "explore") {
    const order = [...VOICE_SECTIONS].filter(id => !["root", "system", "contact"].includes(id));
    const current = currentVoiceSection();
    const index = order.indexOf(current === "system" ? "hero" : current);
    if (index < 0 || index >= order.length - 1) return false;
    return showSection(order[index + 1]);
  }
  const id = decision.section === "current" ? currentVoiceSection() : decision.section;
  if (!VOICE_SECTIONS.has(id)) return false;
  if (decision.action === "show" || decision.action === "contact") {
    return showSection(id, decision.action === "contact" || id === "contact");
  }
  const section = document.getElementById(id);
  if (decision.action === "whatsapp") {
    const cta = section?.querySelector('.project-cta, .inquiry-email');
    if (!cta || !cta.href.startsWith("https://wa.me/")) return false;
    recordVoiceAction({ action: "whatsapp", section: id, top: window.scrollY, focus: document.activeElement });
    // Same-tab navigation works without a transient click gesture from speech.
    window.location.assign(cta.href);
    return true;
  }
  return false;
}

window.xstationShowSection = showSection;
window.xstationPageAction = runPageAction;
window.voiceActionLog = voiceActionLog;

function stopSmooth() {
  smoothInstance?.__nadiDestroy?.();
  smoothInstance = null;
  smoothStarted = false;
}

function bindSmoothStart() {
  if (shot || typeof window.Lenis !== "function") return () => {};

  const sync = () => {
    if (!reducedMotionMedia.matches && smoothScrollMedia.matches) startSmooth();
    else stopSmooth();
  };

  sync();

  smoothScrollMedia.addEventListener("change", sync);
  reducedMotionMedia.addEventListener("change", sync);
  return () => {
    smoothScrollMedia.removeEventListener("change", sync);
    reducedMotionMedia.removeEventListener("change", sync);
    stopSmooth();
  };
}

function bindHeroScroll() {
  if (!gsap || !ScrollTrigger) return;

  const heroCopy = document.getElementById("hero-copy");
  const brandLogo = document.querySelector("#site-nav .brand-logo");
  const chapters = [...document.querySelectorAll(".chapter-panel")];
  if (heroCopy) gsap.set(heroCopy, { autoAlpha: 1, y: 0 });
  if (chapters.length) gsap.set(chapters, { autoAlpha: 0, y: 0 });

  if (!reduce) {
    const depth = { progress: 0 };
    const flash = { progress: 0 };
    const timeline = gsap.timeline({
      defaults: { duration: 1, ease: "none" },
      scrollTrigger: {
        id: "nadi-hero-depth",
        trigger: "#pin-slot",
        start: "top top",
        endTrigger: "#system",
        end: "top 12%",
        scrub: true,
        invalidateOnRefresh: true,
      },
      onUpdate: () => {
        cluster.setProgress(depth.progress);
        cluster.setFlashProgress(flash.progress);
        if (brandLogo) {
          const bounds = brandLogo.getBoundingClientRect();
          document.body.classList.toggle(
            "glare-passed-brand",
            cluster.isFlashCoveringPoint(
              bounds.left + bounds.width / 2,
              bounds.top + bounds.height / 2,
            ),
          );
        }
        if (heroCopy) {
          gsap.set(heroCopy, { opacity: Math.max(0, 1 - flash.progress * 2.4) });
        }
      },
    });

    timeline
      .to(depth, { progress: 1 }, 0)
      .to(flash, { progress: 1, duration: 0.7 }, 0.3);

    if (heroCopy) {
      timeline.to(heroCopy, {
        x: () => window.innerWidth * (window.innerWidth < 768 ? 0.025 : 0.0375),
        y: () => -Math.min(window.innerHeight * 0.1, 96),
        force3D: true,
      }, 0);
    }
  } else {
    cluster.setProgress(0);
    cluster.setFlashProgress(0);
    document.body.classList.remove("glare-passed-brand");
  }

  ScrollTrigger.create({
    id: "nadi-cluster-cover",
    trigger: "#system",
    start: "top top",
    end: "max",
    onEnter: () => {
      // The system section is transparent and reads the canvas as its ground.
      // A fast scroll can reach it before the scrubbed glare finishes, so the
      // glare is completed and painted before the loop stops; otherwise the
      // frozen frame is the dark hero sky sitting behind a light section.
      cluster.setFlashProgress(1);
      requestAnimationFrame(() => requestAnimationFrame(() => cluster.setActive(false)));
    },
    onLeaveBack: () => cluster.setActive(true),
  });
}

function bindHeroSystemSnap() {
  if (reduce || shot || !gsap || !ScrollTrigger) return () => {};

  const pinSlot = document.getElementById("pin-slot");
  const system = document.getElementById("system");
  if (!pinSlot || !system) return () => {};

  let activeTarget = null;
  let transitionToken = 0;
  let nativeTween = null;
  let touchStartY = null;
  let touchLastY = null;

  const targetY = (target) => window.scrollY + target.getBoundingClientRect().top;

  const commitTo = (target, targetIndex) => {
    if (activeTarget === targetIndex) return;
    activeTarget = targetIndex;
    const token = ++transitionToken;

    if (targetIndex === 1) cluster.setActive(true);

    if (smoothInstance) {
      smoothInstance.scrollTo(target, {
        duration: 1,
        easing: (t) => t * t * (3 - 2 * t),
        lerp: 0,
        lock: true,
        force: true,
        onComplete: () => {
          if (token === transitionToken) activeTarget = null;
        },
      });
      return;
    }

    nativeTween?.kill();
    const scrollState = { y: window.scrollY };
    nativeTween = gsap.to(scrollState, {
      y: targetY(target),
      duration: 1,
      ease: "power1.inOut",
      overwrite: true,
      onUpdate: () => window.scrollTo(0, scrollState.y),
      onComplete: () => {
        if (token === transitionToken) activeTarget = null;
        nativeTween = null;
      },
    });
  };

  const handleIntent = (direction, event) => {
    const y = window.scrollY;
    const systemTop = targetY(system);
    const goingToSystem = direction > 0 && y < systemTop - 2;
    const goingToHero = direction < 0 && y > 2 && y <= systemTop + 2;
    if (!goingToSystem && !goingToHero) return false;

    event.preventDefault();
    event.stopImmediatePropagation();
    commitTo(goingToSystem ? system : pinSlot, goingToSystem ? 1 : 0);
    return true;
  };

  const onWheel = (event) => {
    if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    handleIntent(Math.sign(event.deltaY), event);
  };

  const onTouchStart = (event) => {
    if (event.touches.length !== 1) return;
    touchStartY = event.touches[0].clientY;
    touchLastY = touchStartY;
  };

  const onTouchMove = (event) => {
    if (event.touches.length !== 1 || touchStartY === null || touchLastY === null) return;
    const currentY = event.touches[0].clientY;
    const travel = touchStartY - currentY;
    const delta = touchLastY - currentY;
    touchLastY = currentY;
    if (Math.abs(travel) < 8 || Math.abs(delta) < 1) return;
    handleIntent(Math.sign(delta), event);
  };

  const resetTouch = () => {
    touchStartY = null;
    touchLastY = null;
  };

  const onKeyDown = (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, button, [contenteditable]")) return;

    const down = event.key === "ArrowDown" || event.key === "PageDown" || (event.key === " " && !event.shiftKey);
    const up = event.key === "ArrowUp" || event.key === "PageUp" || (event.key === " " && event.shiftKey);
    if (down || up) handleIntent(down ? 1 : -1, event);
  };

  window.addEventListener("wheel", onWheel, { passive: false, capture: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
  window.addEventListener("touchend", resetTouch, { passive: true, capture: true });
  window.addEventListener("touchcancel", resetTouch, { passive: true, capture: true });
  window.addEventListener("keydown", onKeyDown, { capture: true });

  return () => {
    transitionToken += 1;
    nativeTween?.kill();
    window.removeEventListener("wheel", onWheel, { capture: true });
    window.removeEventListener("touchstart", onTouchStart, { capture: true });
    window.removeEventListener("touchmove", onTouchMove, { capture: true });
    window.removeEventListener("touchend", resetTouch, { capture: true });
    window.removeEventListener("touchcancel", resetTouch, { capture: true });
    window.removeEventListener("keydown", onKeyDown, { capture: true });
  };
}

function bindProductsTitle() {
  if (!gsap || !ScrollTrigger) return;

  const indexLines = document.querySelectorAll("#index-title .index-line > span");
  if (!indexLines.length) return;

  if (reduce) {
    gsap.set(indexLines, { autoAlpha: 1, yPercent: 0 });
    return;
  }

  gsap.set(indexLines, {
    autoAlpha: 0,
    yPercent: 105,
  });

  ScrollTrigger.create({
    id: "products-title-enter",
    trigger: "#index-title",
    start: "top 86%",
    once: true,
    onEnter: () => {
      gsap.to(indexLines, {
        autoAlpha: 1,
        yPercent: 0,
        duration: 0.72,
        stagger: 0.1,
        ease: "power3.out",
      });
    },
  });
}

function navBandHeight() {
  const nav = document.getElementById("site-nav");
  return Math.round(nav?.getBoundingClientRect().height || 72);
}

function bindHeaderState() {
  const nav = document.getElementById("site-nav");
  const hero = document.getElementById("hero");

  if (!nav || !hero) return () => {};

  const heroObserver = new IntersectionObserver(([entry]) => {
    nav.classList.toggle("is-scrolled", !entry.isIntersecting);
  }, {
    rootMargin: "-25% 0px -70% 0px",
    threshold: 0,
  });
  heroObserver.observe(hero);

  // The header only keeps its light-on-dark treatment while the dark hero sits
  // under it. Every section below the hero is a light surface, so the header has
  // to switch back to ink there instead of turning invisible.
  const darkSections = [hero];
  const overDark = new Set(darkSections);

  const darkObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) overDark.add(entry.target);
      else overDark.delete(entry.target);
    });
    document.body.classList.toggle("nav-on-dark", overDark.size > 0);
  }, {
    rootMargin: `0px 0px -${Math.max(window.innerHeight - navBandHeight(), 0)}px 0px`,
    threshold: 0,
  });
  darkSections.forEach((section) => darkObserver.observe(section));

  const sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible?.target === contact) setCurrent("contact");
    else if (visible?.target === work) setCurrent("work");
  }, {
    rootMargin: "-20% 0px -55% 0px",
    threshold: [0, 0.2, 0.5],
  });

  if (work) sectionObserver.observe(work);
  if (contact) sectionObserver.observe(contact);

  return () => {
    heroObserver.disconnect();
    darkObserver.disconnect();
    sectionObserver.disconnect();
  };
}

function bindBrandVisibility() {
  if (shot || !gsap) return () => {};

  const nav = document.getElementById("site-nav");
  const brand = document.getElementById("brand");
  const brandLabel = brand?.querySelector("em");
  const brandMask = brand?.querySelector(".brand-mask");
  if (!nav || !brand || !brandLabel || !brandMask) return () => {};

  let visible = true;
  let lastY = window.scrollY;
  let ticking = false;

  function setVisible(nextVisible) {
    if (nextVisible === visible) return;
    visible = nextVisible;
    nav.style.pointerEvents = nextVisible ? "auto" : "none";
    brand.style.pointerEvents = nextVisible ? "auto" : "none";

    if (reduce) {
      gsap.set(nav, { yPercent: 0, autoAlpha: nextVisible ? 1 : 0 });
      gsap.set([brandMask, brandLabel], {
        autoAlpha: nextVisible ? 1 : 0,
        yPercent: 0,
      });
      return;
    }

    // The whole header leaves on the way down and comes back on the first
    // upward move, with the wordmark keeping its own staggered lift.
    gsap.to(nav, {
      yPercent: nextVisible ? 0 : -100,
      duration: nextVisible ? 0.42 : 0.32,
      ease: nextVisible ? "power3.out" : "power2.in",
      overwrite: "auto",
    });

    gsap.to([brandMask, brandLabel], {
      autoAlpha: nextVisible ? 1 : 0,
      yPercent: nextVisible ? 0 : -115,
      duration: nextVisible ? 0.46 : 0.34,
      ease: nextVisible ? "power3.out" : "power2.in",
      stagger: nextVisible ? 0.055 : 0.035,
      overwrite: true,
    });
  }

  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const delta = y - lastY;
    const band = navBandHeight();

    if (y <= band || delta < -2) setVisible(true);
    else if (delta > 2 && y > band * 1.5) setVisible(false);

    lastY = y;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  return () => window.removeEventListener("scroll", onScroll);
}

function bindInquiryEntry() {
  const section = document.getElementById("contact");
  if (!section || !gsap || !ScrollTrigger) return;

  const titleLines = section.querySelectorAll(".inquiry-title-line > span");
  const support = section.querySelector(".inquiry-support");

  if (reduce) {
    gsap.set([titleLines, support], { autoAlpha: 1, y: 0, yPercent: 0 });
    return;
  }

  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: "top 78%",
      once: true,
    },
  });

  timeline
    .fromTo(
      titleLines,
      { autoAlpha: 0, yPercent: 108 },
      {
        autoAlpha: 1,
        yPercent: 0,
        duration: 0.92,
        ease: "expo.out",
        stagger: 0.09,
      }
    )
    .fromTo(
      support,
      { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, duration: 0.64, ease: "power3.out" },
      0.34
    );
}

function bindEnter(compact = false) {
  if (!gsap || !ScrollTrigger) return;
  if (reduce) {
    gsap.set(".js-enter, .js-enter-child, .space-stage", { autoAlpha: 1, x: 0, y: 0, scale: 1, filter: "none" });
    return;
  }

  document.querySelectorAll("#work-root .space").forEach((section) => {
    const panel = section.querySelector(".space-panel.js-enter");
    const media = section.querySelector(".space-stage");
    if (!panel) return;

    const flip = section.classList.contains("is-flip");
    const mediaFrom = compact ? 0 : flip ? 16 : -16;
    const kids = [...panel.querySelectorAll(".js-enter-child")];
    const stack = kids.filter((el) => !el.classList.contains("project-cta"));
    const cta = kids.filter((el) => el.classList.contains("project-cta"));

    // Panel itself: no scale, no blur — stay clear for the stack.
    gsap.set(panel, { autoAlpha: 1, scale: 1, filter: "none" });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top 78%",
        once: true,
      },
    });

    if (media) {
      tl.fromTo(
        media,
        { autoAlpha: 0, x: mediaFrom },
        { autoAlpha: 1, x: 0, duration: 0.7, ease: "power3.out" },
        0
      );
    }

    if (stack.length) {
      tl.fromTo(
        stack,
        { autoAlpha: 0, y: compact ? 10 : 12 },
        { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.07 },
        media ? 0.12 : 0
      );
    }

    if (cta.length) {
      tl.fromTo(
        cta,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.45, ease: "power3.out", onComplete: () => {
          if (cta.includes(showSection._focus)) showSection._focus.focus({ preventScroll: true });
        } },
        ">"
      );
    }
  });
}

function bindParallax() {
  if (reduce || shot || !gsap || !ScrollTrigger) return;
  if (window.matchMedia("(max-width: 767px)").matches) return;

  document.querySelectorAll(".stage-media img").forEach((media) => {
    const trigger = media.closest(".space, .stage");
    if (!trigger) return;
    const app = trigger.classList.contains("is-app");
    const motion = app
      ? { travel: 3, startScale: 1.02 }
      : { travel: 4.5, startScale: 1.04 };
    gsap.fromTo(
      media,
      {
        yPercent: -motion.travel,
        scale: motion.startScale,
      },
      {
        yPercent: motion.travel,
        scale: 1,
        ease: "none",
        force3D: true,
        scrollTrigger: {
          trigger,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
          invalidateOnRefresh: true,
        },
      }
    );
  });
}

function bindProjectVideoPlayback() {
  const videos = [...document.querySelectorAll(".space-stage video.hero")];
  if (!videos.length) return () => {};

  const sources = new Map(videos.map((video) => [video, video.getAttribute("src")]));
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const sections = videos.map((video) => ({
    video,
    section: video.closest(".space"),
  }));
  let activeVideo = null;

  const releaseVideo = (video) => {
    video.pause();
    if (video.getAttribute("src")) {
      video.removeAttribute("src");
      video.load();
    }
  };

  const releaseAll = () => videos.forEach(releaseVideo);

  const playVideo = (video) => {
    if (reducedMotionMedia.matches || connection?.saveData) return;
    if (!video.getAttribute("src")) {
      video.setAttribute("src", sources.get(video));
      video.load();
    }
    if (!video.paused) return;
    video.preload = "auto";
    const playback = video.play();
    playback?.catch(() => {});
  };

  const getVisibleScore = (section) => {
    if (!section) return -1;
    const bounds = section.getBoundingClientRect();
    const visibleHeight = Math.max(0, Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0));
    if (!visibleHeight) return -1;
    const visibleRatio = visibleHeight / Math.max(bounds.height, 1);
    const sectionCenter = bounds.top + bounds.height / 2;
    const viewportCenter = window.innerHeight / 2;
    return visibleRatio - Math.abs(sectionCenter - viewportCenter) / (window.innerHeight * 1000);
  };

  const syncActiveVideo = () => {
    if (reducedMotionMedia.matches || connection?.saveData) {
      activeVideo = null;
      releaseAll();
      return;
    }
    const next = sections
      .map((entry) => ({ ...entry, score: getVisibleScore(entry.section) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score)[0]?.video;

    if (next === activeVideo) return;
    activeVideo = next || null;
    videos.forEach((video) => {
      if (video === activeVideo) playVideo(video);
      else releaseVideo(video);
    });
  };

  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(syncActiveVideo, { threshold: [0, 0.25, 0.5, 0.75, 1] })
    : null;

  if (observer) sections.forEach(({ section }) => section && observer.observe(section));
  syncActiveVideo();

  const onVisibilityChange = () => {
    if (document.hidden) {
      activeVideo = null;
      releaseAll();
    } else {
      syncActiveVideo();
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  reducedMotionMedia.addEventListener?.("change", syncActiveVideo);
  connection?.addEventListener?.("change", syncActiveVideo);

  return () => {
    observer?.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    reducedMotionMedia.removeEventListener?.("change", syncActiveVideo);
    connection?.removeEventListener?.("change", syncActiveVideo);
    releaseAll();
  };
}

/*
 * Phones get a portrait clip of the nerve canopy instead of the live canvas:
 * the canvas repaints screen-sized radial gradients every frame, which is the
 * work a phone GPU is worst at. The element ships without a source, so nothing
 * is fetched until this runs; if the fetch or decode fails there is no source
 * to fall back from and the stage's own dark ground stays visible.
 */
function bindHeroMotion() {
  const video = document.getElementById("hero-motion");
  if (!video || shot) return () => {};

  const phone = window.matchMedia("(max-width: 47.999rem)");
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const source = "videos/gateway-hero/media/hero/hero-mobile.mp4";
  let attached = false;

  const start = () => {
    if (!phone.matches) return;
    // The canvas is hidden here, so its loop is pure battery cost.
    cluster.setActive(false);
    if (reducedMotionMedia.matches || connection?.saveData) return;
    if (!attached) {
      attached = true;
      video.src = source;
      video.load();
    }
    video.play()?.catch(() => {});
  };

  const stop = () => {
    if (phone.matches) return;
    video.pause();
    cluster.setActive(true);
  };

  const onChange = () => (phone.matches ? start() : stop());

  // Never on the critical path: the clip waits for an idle moment after load.
  const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 400));
  const cancelIdle = window.cancelIdleCallback || window.clearTimeout;
  const handle = idle(start);

  phone.addEventListener("change", onChange);

  // Nothing to decode once the hero has scrolled away.
  const hero = document.getElementById("hero");
  const visibility = hero
    ? new IntersectionObserver(([entry]) => {
      if (!phone.matches) return;
      if (entry.isIntersecting) start();
      else video.pause();
    }, { threshold: 0 })
    : null;
  visibility?.observe(hero);

  return () => {
    cancelIdle(handle);
    visibility?.disconnect();
    phone.removeEventListener("change", onChange);
  };
}

function applyShot() {
  if (!shot) return false;
  const pinSlot = document.getElementById("pin-slot");
  const system = document.getElementById("system");
  const workRoot = document.getElementById("work-root");
  if (pinSlot) pinSlot.style.display = "none";
  if (system && shot !== "system") system.style.display = "none";
  if (workRoot) workRoot.style.marginTop = "0";
  const target = document.getElementById(shot);
  if (target) {
    document.querySelectorAll("#work-root > *").forEach((child) => {
      if (child !== target) child.style.display = "none";
    });
  }
  return true;
}

const isShot = applyShot();
const currentYear = document.getElementById("current-year");
if (currentYear) currentYear.textContent = String(new Date().getFullYear());
const cleanupHeaderState = isShot ? () => {} : bindHeaderState();
let cleanupProjectVideos = () => {};
let cleanupHeroMotion = () => {};
if (!isShot) {
  cleanupProjectVideos = bindProjectVideoPlayback();
  cleanupHeroMotion = bindHeroMotion();
}
window.addEventListener("pagehide", () => {
  cleanupHeaderState();
  cleanupProjectVideos();
  cleanupHeroMotion();
}, { once: true });

if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

if (gsap && !isShot) {
  gsap.set("#site-nav, #hero-copy", { autoAlpha: 0 });
  let cleanupHeroEntry = () => {};
  let cleanupHeroSystemSnap = () => {};
  let cleanupBrandVisibility = () => {};
  let responsiveMotion = null;
  const cleanupSmoothStart = bindSmoothStart();
  const ctx = gsap.context(() => {
    cleanupHeroEntry = bindHeroEntry();
    bindHeroScroll();
    cleanupHeroSystemSnap = bindHeroSystemSnap();
    bindProductsTitle();
    cleanupBrandVisibility = bindBrandVisibility();
    bindInquiryEntry();
    responsiveMotion = gsap.matchMedia();
    responsiveMotion.add("(max-width: 63.999rem)", () => bindEnter(true));
    responsiveMotion.add("(min-width: 64rem)", () => bindEnter(false));
    responsiveMotion.add(ENHANCED_MOTION_QUERY, () => bindParallax());
  }, document.body);

  if (ScrollTrigger) {
    window.addEventListener("load", () => ScrollTrigger.refresh());
  }
  window.addEventListener("pagehide", () => {
    cleanupSmoothStart();
    cleanupHeroEntry();
    cleanupHeroSystemSnap();
    cleanupBrandVisibility();
    responsiveMotion?.revert();
    cluster.dispose();
    ctx.revert();
  }, { once: true });
} else if (!isShot) {
  const cleanupSmoothStart = bindSmoothStart();
  window.addEventListener("pagehide", () => {
    cleanupSmoothStart();
    cluster.dispose();
  }, { once: true });
}
