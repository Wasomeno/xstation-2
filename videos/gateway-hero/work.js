import { createCluster } from "./cluster.js";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shot = new URLSearchParams(window.location.search).get("shot");
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const ENHANCED_MOTION_QUERY = "(min-width: 64rem) and (hover: hover) and (pointer: fine)";
const smoothScrollMedia = window.matchMedia("(min-width: 64rem)");

const cluster = createCluster({
  canvas: document.getElementById("nadi-cluster"),
  active: !document.getElementById("welcome-bumper"),
});

function bindHeroEntry() {
  if (!gsap) return () => {};

  const brand = document.getElementById("brand");
  const titleLines = document.querySelectorAll("#doctrine-title .hero-title-line > span");
  const lead = document.getElementById("doctrine-lead");
  const actions = document.querySelectorAll("#hero-copy .station-actions .station-cta");
  const animatedElements = [brand, ...titleLines, lead, ...actions].filter(Boolean);
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
      .to(actions, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.62,
        stagger: 0.07,
      }, 0.56);
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
  if (
    reduce
    || shot
    || !smoothScrollMedia.matches
    || typeof window.Lenis !== "function"
  ) return null;

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
  const bounds = el.getBoundingClientRect();
  const headerHeight = document.getElementById("site-nav")?.getBoundingClientRect().height || 0;
  const offset = sectionId === "work" ? -(headerHeight + 16)
    : sectionId === "hero" ? 0 : (bounds.height - window.innerHeight) / 2;
  if (smoothInstance) {
    smoothInstance.scrollTo(el, { offset, duration });
  } else {
    window.scrollTo({ top: window.scrollY + bounds.top + offset, behavior: reduce ? "auto" : "smooth" });
  }
  document.querySelectorAll(".is-voice-shown").forEach((node) => node.classList.remove("is-voice-shown"));
  el.classList.add("is-voice-shown");
  window.clearTimeout(showSection._timer);
  showSection._timer = window.setTimeout(() => el.classList.remove("is-voice-shown"), 1800);
  return true;
}

window.xstationShowSection = showSection;

function stopSmooth() {
  smoothInstance?.__nadiDestroy?.();
  smoothInstance = null;
  smoothStarted = false;
}

function bindSmoothStart() {
  if (reduce || shot || typeof window.Lenis !== "function") return () => {};
  let welcomeFinished = !document.getElementById("welcome-bumper");

  const sync = () => {
    if (!welcomeFinished) return;
    if (smoothScrollMedia.matches) startSmooth();
    else stopSmooth();
  };

  const onFinished = () => {
    welcomeFinished = true;
    sync();
  };

  if (welcomeFinished) {
    sync();
  } else {
    window.addEventListener("xstation:welcome-finished", onFinished, { once: true });
  }

  smoothScrollMedia.addEventListener("change", sync);
  return () => {
    window.removeEventListener("xstation:welcome-finished", onFinished);
    smoothScrollMedia.removeEventListener("change", sync);
    stopSmooth();
  };
}

function bindHeroScroll() {
  if (!gsap || !ScrollTrigger) return;

  const heroCopy = document.getElementById("hero-copy");
  const chapters = [...document.querySelectorAll(".chapter-panel")];
  if (heroCopy) gsap.set(heroCopy, { autoAlpha: 1, y: 0 });
  if (chapters.length) gsap.set(chapters, { autoAlpha: 0, y: 0 });

  ScrollTrigger.create({
    id: "nadi-cluster-cover",
    trigger: "#work",
    start: "top 12%",
    end: "max",
    onEnter: () => cluster.setActive(false),
    onLeaveBack: () => cluster.setActive(true),
  });
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

function bindHeaderState() {
  const nav = document.getElementById("site-nav");
  const hero = document.getElementById("hero");
  const work = document.getElementById("work");
  const contact = document.getElementById("contact");
  const productsLink = document.querySelector('#site-links a[href="#work"]');
  const contactLink = document.querySelector('#site-links a[href="#contact"]');

  if (!nav || !hero) return () => {};

  const setCurrent = (current) => {
    [
      [productsLink, current === "work"],
      [contactLink, current === "contact"],
    ].forEach(([link, active]) => {
      if (!link) return;
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };

  const heroObserver = new IntersectionObserver(([entry]) => {
    nav.classList.toggle("is-scrolled", !entry.isIntersecting);
  }, {
    rootMargin: "-25% 0px -70% 0px",
    threshold: 0,
  });
  heroObserver.observe(hero);

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
    sectionObserver.disconnect();
  };
}

function bindBrandVisibility() {
  if (shot || !gsap || !ScrollTrigger || !smoothScrollMedia.matches) return;

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
const currentYear = document.getElementById("current-year");
if (currentYear) currentYear.textContent = String(new Date().getFullYear());
const cleanupHeaderState = isShot ? () => {} : bindHeaderState();
let cleanupProjectVideos = () => {};
if (!isShot) cleanupProjectVideos = bindProjectVideoPlayback();
window.addEventListener("pagehide", () => {
  cleanupHeaderState();
  cleanupProjectVideos();
}, { once: true });

if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

if (gsap && !isShot) {
  gsap.set("#site-nav, #hero-copy", { autoAlpha: 0 });
  let cleanupHeroEntry = () => {};
  let responsiveMotion = null;
  const cleanupSmoothStart = bindSmoothStart();
  const ctx = gsap.context(() => {
    cleanupHeroEntry = bindHeroEntry();
    bindHeroScroll();
    bindProductsTitle();
    bindBrandVisibility();
    bindInquiryEntry();
    bindEnter();
    responsiveMotion = gsap.matchMedia();
    responsiveMotion.add(ENHANCED_MOTION_QUERY, () => bindParallax());
  }, document.body);

  if (ScrollTrigger) {
    window.addEventListener("load", () => ScrollTrigger.refresh());
  }
  window.addEventListener("pagehide", () => {
    cleanupSmoothStart();
    cleanupHeroEntry();
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

if (!isShot && document.getElementById("welcome-bumper")) {
  const dispatchReady = () => {
    window.dispatchEvent(new CustomEvent("xstation:orbit-ready"));
  };
  if (cluster.ready && typeof cluster.ready.then === "function") {
    cluster.ready.then(dispatchReady, dispatchReady);
  } else {
    dispatchReady();
  }
  window.addEventListener("xstation:welcome-exit-start", () => {
    cluster.resize();
    cluster.setActive(true);
    ScrollTrigger?.refresh();
  }, { once: true });
}
