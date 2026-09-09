import { createField, DOCK_READY, FOCUS_END, FOCUS_START } from "./field.js";

const ORBIT_STORIES = [
  {
    title: "Marketing & Content",
    lead: "BikinKonten and Lubna help teams plan, create, and publish on-brand social content with less manual work.",
  },
  {
    title: "Prototyping",
    lead: "CoFrame turns an idea into an interactive web prototype, so teams can see what they want to build before development starts.",
  },
  {
    title: "AI Agents",
    lead: "CRM AI Agent and CoDev handle repeatable questions and development tasks, giving teams more time for work that needs people.",
  },
  {
    title: "Customer Engagement",
    lead: "CRM AI Agent answers customer questions on WhatsApp using your business knowledge, helping every conversation start faster.",
  },
  {
    title: "Document Management",
    lead: "Arkiv keeps business files organized, easy to find, and under control as teams store, share, and review information together.",
  },
  {
    title: "Talent Assessment",
    lead: "HireAssess helps hiring teams understand a technical candidate’s real work and make hiring decisions with more confidence.",
  },
];

const DEFAULT_ORBIT_STORY = {
  title: "Your Gateway to Intelligent Products",
  titleLines: ["Your Gateway to", "Intelligent Products"],
  lead: "Explore a growing collection of AI products designed for real-world business needs. Choose what fits your workflow, put it to work, and move faster.",
};

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shot = new URLSearchParams(window.location.search).get("shot");
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;

const field = createField({
  root: document.getElementById("field"),
  gsap,
  reduce,
});

function prepareOrbitHero(showInterface = true) {
  field.setMode("pass");
  field.setProgress(DOCK_READY);
  document.documentElement.classList.add("is-station");

  if (!gsap) {
    const nav = document.getElementById("site-nav");
    const copy = document.getElementById("hero-copy");
    if (nav) nav.style.opacity = showInterface ? "1" : "0";
    if (copy) copy.style.opacity = showInterface ? "1" : "0";
    return;
  }
  gsap.set("#site-nav, #hero-copy", {
    autoAlpha: showInterface ? 1 : 0,
    y: 0,
  });
}

function bindHeroEntry() {
  if (!gsap) return () => {};

  const brand = document.getElementById("brand");
  const titleLines = document.querySelectorAll("#doctrine-title .hero-title-line > span");
  const lead = document.getElementById("doctrine-lead");
  const actions = document.querySelectorAll(".station-actions .station-cta");
  const animatedElements = [brand, ...titleLines, lead, ...actions].filter(Boolean);
  const orbitEntry = { progress: reduce ? 1 : 0 };
  let timeline = null;

  field.setOrbitEntryProgress(orbitEntry.progress);

  if (!reduce) {
    gsap.set(brand, { autoAlpha: 0, y: -12 });
    gsap.set(titleLines, {
      autoAlpha: 0,
      yPercent: 110,
      rotate: 1.2,
      transformOrigin: "0% 100%",
    });
    gsap.set(lead, { autoAlpha: 0, y: 22 });
    gsap.set(actions, { autoAlpha: 0, y: 16, scale: 0.97 });
  }

  function reveal() {
    gsap.set("#site-nav, #hero-copy", { autoAlpha: 1, y: 0 });

    if (reduce) {
      field.setOrbitEntryProgress(1);
      gsap.set(animatedElements, { autoAlpha: 1, clearProps: "transform" });
      return;
    }

    timeline = gsap.timeline({ defaults: { ease: "power3.out" } })
      .to(orbitEntry, {
        progress: 1,
        duration: 1.18,
        ease: "expo.out",
        onUpdate: () => field.setOrbitEntryProgress(orbitEntry.progress),
      }, 0)
      .to(brand, { autoAlpha: 1, y: 0, duration: 0.62 }, 0.12)
      .to(titleLines, {
        autoAlpha: 1,
        yPercent: 0,
        rotate: 0,
        duration: 0.9,
        stagger: 0.09,
        ease: "expo.out",
      }, 0.26)
      .to(lead, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.52)
      .to(actions, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.62,
        stagger: 0.07,
      }, 0.68);
  }

  const welcome = document.getElementById("welcome-bumper");
  if (welcome) {
    window.addEventListener("xstation:welcome-finished", reveal, { once: true });
  } else {
    reveal();
  }

  return () => {
    window.removeEventListener("xstation:welcome-finished", reveal);
    timeline?.kill();
  };
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
      lenis.scrollTo(el, { offset: -8, duration: 2.4 });
    };
    a.addEventListener("click", onClick);
    anchorBindings.push([a, onClick]);
  });

  lenis.__xstationDestroy = () => {
    if (ticker) gsap.ticker.remove(ticker);
    if (rafId) cancelAnimationFrame(rafId);
    anchorBindings.forEach(([anchor, handler]) => anchor.removeEventListener("click", handler));
    lenis.destroy?.();
  };

  return lenis;
}

let smoothInstance = null;
let smoothStarted = false;
let cleanupSmoothStart = () => {};

function startSmooth() {
  if (smoothStarted) return smoothInstance;
  smoothStarted = true;
  smoothInstance = smooth();
  return smoothInstance;
}

const VOICE_SECTIONS = new Set([
  "hero",
  "root",
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

function showSection(id) {
  const sectionId = id === "root" ? "hero" : id;
  if (!VOICE_SECTIONS.has(sectionId)) return false;
  const el = document.getElementById(sectionId);
  if (!el) return false;
  const duration = reduce ? 0.05 : 1.15;
  if (smoothInstance) {
    const offset = (el.getBoundingClientRect().height - window.innerHeight) / 2;
    smoothInstance.scrollTo(el, { offset, duration });
  } else {
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }
  document.querySelectorAll(".is-voice-shown").forEach((node) => node.classList.remove("is-voice-shown"));
  el.classList.add("is-voice-shown");
  window.clearTimeout(showSection._timer);
  showSection._timer = window.setTimeout(() => el.classList.remove("is-voice-shown"), 1800);
  return true;
}

window.xstationShowSection = showSection;

function bindSmoothStart() {
  if (reduce || shot || typeof window.Lenis !== "function") return () => {};
  if (!document.getElementById("welcome-bumper")) {
    startSmooth();
    return () => {};
  }

  const onFinished = () => startSmooth();
  window.addEventListener("xstation:welcome-finished", onFinished, { once: true });
  return () => window.removeEventListener("xstation:welcome-finished", onFinished);
}


let activeOrbit = -1;
let orbitCopyTl = null;

function applyOrbitCopy(story, title, lead) {
  title.replaceChildren();
  const lines = story.titleLines || [story.title];
  lines.forEach((line) => {
    const lineMask = document.createElement("span");
    const lineText = document.createElement("span");
    lineMask.className = "hero-title-line";
    lineText.textContent = line;
    lineMask.appendChild(lineText);
    title.appendChild(lineMask);
  });
  lead.textContent = story.lead;
}

function measureOrbitCopyHeight(stage, story) {
  const measurement = stage.cloneNode(true);
  const title = measurement.querySelector("#doctrine-title");
  const lead = measurement.querySelector("#doctrine-lead");
  if (!title || !lead || !stage.parentElement) return stage.getBoundingClientRect().height;

  measurement.style.position = "absolute";
  measurement.style.visibility = "hidden";
  measurement.style.pointerEvents = "none";
  measurement.style.height = "auto";
  measurement.style.width = `${stage.getBoundingClientRect().width}px`;
  stage.parentElement.appendChild(measurement);
  applyOrbitCopy(story, title, lead);
  const height = measurement.getBoundingClientRect().height;
  measurement.remove();
  return height;
}

function setOrbitCopy(index, immediate = false) {
  if (index < -1 || index >= ORBIT_STORIES.length || index === activeOrbit) return;

  activeOrbit = index;
  const story = index === -1 ? DEFAULT_ORBIT_STORY : ORBIT_STORIES[index];
  const title = document.getElementById("doctrine-title");
  const lead = document.getElementById("doctrine-lead");
  const stage = document.querySelector("#hero-copy .doctrine-copy-stage");

  if (!title || !lead || !stage) return;

  const startHeight = stage.getBoundingClientRect().height;

  if (orbitCopyTl) {
    orbitCopyTl.kill();
    orbitCopyTl = null;
  }

  if (immediate || !gsap) {
    applyOrbitCopy(story, title, lead);
    gsap?.set(stage, { clearProps: "height,overflow,willChange" });
    return;
  }

  gsap.set(stage, { height: startHeight, overflow: "clip", willChange: "height" });
  gsap.set([title, lead], { clearProps: "transform,opacity,visibility" });
  const targetHeight = measureOrbitCopyHeight(stage, story);

  orbitCopyTl = gsap.timeline({
    defaults: { overwrite: "auto" },
    onComplete: () => {
      gsap.set(stage, { clearProps: "height,overflow,willChange" });
      orbitCopyTl = null;
    },
  })
    .to([title, lead], {
      autoAlpha: 0,
      y: 8,
      duration: 0.2,
      ease: "power2.in",
    })
    .call(() => {
      applyOrbitCopy(story, title, lead);
      gsap.set([title, lead], { autoAlpha: 0, y: 18 });
    })
    .fromTo(
      stage,
      { height: startHeight },
      {
        height: targetHeight,
        duration: 0.46,
        ease: "power3.inOut",
        immediateRender: false,
      },
    )
    .to([title, lead], {
      autoAlpha: 1,
      y: 0,
      duration: 0.36,
      ease: "power3.out",
      stagger: 0.035,
    }, "<+=0.08");
}

function startOrbitAutoplay() {
  if (reduce || shot || !gsap) return;

  const initialHold = 3.2;
  const stationHold = 3.2;
  const resetHold = 1.8;
  const lastStation = ORBIT_STORIES.length - 1;
  const progressForStation = (index) => {
    return FOCUS_START + ((FOCUS_END - FOCUS_START) * index) / lastStation;
  };

  const orbitTl = gsap.timeline({
    paused: true,
    repeat: -1,
    repeatDelay: 0.4,
  });

  orbitTl.to({}, { duration: initialHold });

  ORBIT_STORIES.forEach((_, index) => {
    orbitTl
      .call(() => {
        field.setMode("pass");
        field.recedeDock(0);
        field.setProgress(progressForStation(index));
        setOrbitCopy(index);
      })
      .to({}, { duration: stationHold });
  });

  orbitTl
    .call(() => {
      field.setProgress(DOCK_READY);
      setOrbitCopy(-1);
    })
    .to({}, { duration: resetHold });

  function playWhenWelcomeFinishes() {
    orbitTl.play();
  }

  if (document.getElementById("welcome-bumper")) {
    window.addEventListener("xstation:welcome-finished", playWhenWelcomeFinishes, { once: true });
  } else {
    playWhenWelcomeFinishes();
  }

  return orbitTl;
}

function bindSpatialFold(orbitTl) {
  if (reduce || shot || !gsap || !ScrollTrigger || !orbitTl) return;

  const isCompact = () => window.matchMedia("(max-width: 767px)").matches;
  const indexLines = document.querySelectorAll("#index-title .index-line > span");
  const editorialBridge = document.querySelector(".editorial-bridge");
  const editorialLines = document.querySelectorAll(".editorial-line > span");
  const editorialSupport = document.querySelector(".editorial-support");
  let folded = false;

  function lockOrbit() {
    if (folded) return;
    folded = true;
    orbitTl.pause();
    field.setProgress(DOCK_READY);
    setOrbitCopy(-1);
    field.freezeOrbit();
  }

  function releaseOrbit() {
    if (!folded) return;
    folded = false;
    field.unfreezeOrbit();
    orbitTl.restart();
  }

  function hideOrbitCanvas() {
    field.setPresentationVisible(false);
  }

  function showFrozenOrbitCanvas() {
    field.setPresentationVisible(true);
    lockOrbit();
  }

  gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      id: "orbit-spatial-fold",
      trigger: "#work",
      start: "top 92%",
      end: "top 18%",
      scrub: 0.8,
      invalidateOnRefresh: true,
      onEnter: lockOrbit,
      onLeave: hideOrbitCanvas,
      onEnterBack: showFrozenOrbitCanvas,
      onLeaveBack: releaseOrbit,
    },
  })
    .to("#hero-copy", {
      autoAlpha: 0,
      y: -42,
      scale: 0.98,
      duration: 0.28,
    }, 0)
    .to(".dock-node-label", {
      autoAlpha: 0,
      duration: 0.2,
    }, 0)
    .to(".dock-node", {
      scale: () => isCompact() ? 0.38 : 0.24,
      duration: 0.48,
      ease: "power2.inOut",
    }, 0.12)
    .to("#field", {
      rotationX: () => isCompact() ? 52 : 68,
      rotationZ: () => isCompact() ? -3 : -6,
      scale: () => isCompact() ? 0.84 : 0.78,
      y: () => isCompact() ? "18vh" : "28vh",
      transformOrigin: "50% 72%",
      force3D: true,
      duration: 0.78,
      ease: "power2.inOut",
    }, 0.08)
    .to(".dock-svg", {
      "--fold-alpha": 0.62,
      duration: 0.5,
    }, 0.25);

  gsap.set(indexLines, {
    autoAlpha: 0,
    yPercent: 105,
  });

  if (editorialBridge) {
    gsap.set(editorialLines, {
      autoAlpha: 0,
      yPercent: 105,
    });

    gsap.set(editorialSupport, {
      autoAlpha: 0,
      y: 20,
    });

    ScrollTrigger.create({
      id: "editorial-bridge-enter",
      trigger: editorialBridge,
      start: "top 76%",
      once: true,
      onEnter: () => {
        gsap.timeline()
          .to(editorialLines, {
            autoAlpha: 1,
            yPercent: 0,
            duration: 0.78,
            stagger: 0.1,
            ease: "power3.out",
          })
          .to(editorialSupport, {
            autoAlpha: 1,
            y: 0,
            duration: 0.58,
            ease: "power2.out",
          }, "-=0.34");
      },
    });
  }

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

function bindBrandVisibility() {
  if (shot || !gsap || !ScrollTrigger) return;

  const brand = document.getElementById("brand");
  const brandLabel = brand?.querySelector("em");
  const products = document.getElementById("work");
  if (!brand || !brandLabel || !products) return;

  let visible = true;

  function setVisible(nextVisible) {
    if (nextVisible === visible) return;
    visible = nextVisible;
    brand.style.pointerEvents = nextVisible ? "auto" : "none";

    if (reduce) {
      gsap.set(brandLabel, {
        autoAlpha: nextVisible ? 1 : 0,
        yPercent: 0,
      });
      return;
    }

    gsap.to(brandLabel, {
      autoAlpha: nextVisible ? 1 : 0,
      yPercent: nextVisible ? 0 : -115,
      duration: nextVisible ? 0.46 : 0.34,
      ease: nextVisible ? "power3.out" : "power2.in",
      overwrite: true,
    });
  }

  ScrollTrigger.create({
    id: "brand-directional-visibility",
    trigger: products,
    start: "top bottom",
    end: "max",
    onEnter: (self) => {
      if (self.direction > 0) setVisible(false);
    },
    onUpdate: (self) => {
      if (self.direction < 0) {
        setVisible(true);
      } else if (self.isActive) {
        setVisible(false);
      }
    },
    onLeaveBack: () => setVisible(true),
  });
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
          scrub: 0.8,
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

  if (reduce) {
    releaseAll();
    return () => {};
  }

  const playVideo = (video) => {
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

  return () => {
    observer?.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    releaseAll();
  };
}

function applyShot() {
  if (!shot) return false;
  document.getElementById("welcome-bumper")?.remove();
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

const isShot = applyShot();
let cleanupProjectVideos = () => {};
if (!isShot) cleanupProjectVideos = bindProjectVideoPlayback();
window.addEventListener("pagehide", () => cleanupProjectVideos(), { once: true });

if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

if (gsap && !isShot) {
  gsap.set("#site-nav, #hero-copy", { autoAlpha: 0 });
  let cleanupHeroEntry = () => {};
  cleanupSmoothStart = bindSmoothStart();
  const ctx = gsap.context(() => {
    cleanupHeroEntry = bindHeroEntry();
    const orbitTl = startOrbitAutoplay();
    bindSpatialFold(orbitTl);
    bindBrandVisibility();
    bindInquiryEntry();
    bindEnter();
    bindParallax();
  }, document.body);

  if (ScrollTrigger) {
    window.addEventListener("load", () => ScrollTrigger.refresh());
  }
  window.addEventListener("pagehide", () => {
    cleanupSmoothStart();
    smoothInstance?.__xstationDestroy?.();
    cleanupHeroEntry();
    ctx.revert();
  }, { once: true });
} else if (!isShot) {
  startSmooth();
}

if (isShot) {
  field.setRenderActive(true);
  prepareOrbitHero(true);
} else {
  const welcomeActive = Boolean(document.getElementById("welcome-bumper"));
  prepareOrbitHero(!welcomeActive);
  const dispatchOrbitReady = (result = null) => {
    field.setRenderActive(!welcomeActive);
    window.dispatchEvent(new CustomEvent("xstation:orbit-ready", {
      detail: result,
    }));
  };
  const prepareReady = field.ready || Promise.resolve();
  let readinessTimer = 0;
  const deadline = new Promise((resolve) => {
    readinessTimer = window.setTimeout(() => resolve({
      status: "degraded",
      reason: "orbit-preparation-timeout",
    }), 15000);
  });
  Promise.race([prepareReady, deadline]).then((result) => {
    window.clearTimeout(readinessTimer);
    dispatchOrbitReady(result);
  }, (error) => {
    window.clearTimeout(readinessTimer);
    dispatchOrbitReady({ status: "degraded", reason: "orbit-preparation-error", error });
  });
}

if (document.getElementById("welcome-bumper")) {
  window.addEventListener("xstation:welcome-exit-start", () => {
    field.setRenderActive(true);
  }, { once: true });
}
