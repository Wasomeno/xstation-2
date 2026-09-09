import { createCluster } from "./cluster.js";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shot = new URLSearchParams(window.location.search).get("shot");
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const ENHANCED_MOTION_QUERY = "(min-width: 64rem) and (hover: hover) and (pointer: fine)";
const smoothScrollMedia = window.matchMedia("(min-width: 64rem)");

const cluster = createCluster({
  canvas: document.getElementById("nadi-cluster"),
});

function bindHeroEntry() {
  if (!gsap) return () => {};

  const brand = document.getElementById("brand");
  const titleLines = document.querySelectorAll("#doctrine-title .hero-title-line > span");
  const lead = document.getElementById("doctrine-lead");
  const actions = document.querySelectorAll(".station-actions .station-cta");
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

  gsap.set("#site-nav, #hero-copy", { autoAlpha: 1, y: 0 });

  if (reduce) {
    gsap.set(animatedElements, { autoAlpha: 1, clearProps: "transform" });
    return () => {};
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

  return () => timeline?.kill();
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

function stopSmooth() {
  smoothInstance?.__nadiDestroy?.();
  smoothInstance = null;
  smoothStarted = false;
}

function bindSmoothStart() {
  if (reduce || shot || typeof window.Lenis !== "function") return () => {};

  const sync = () => {
    if (smoothScrollMedia.matches) startSmooth();
    else stopSmooth();
  };

  sync();
  smoothScrollMedia.addEventListener("change", sync);
  return () => {
    smoothScrollMedia.removeEventListener("change", sync);
    stopSmooth();
  };
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function bindHeroScroll() {
  if (!gsap || !ScrollTrigger) return;

  const heroCopy = document.getElementById("hero-copy");
  const chapters = [...document.querySelectorAll(".chapter-panel")];
  if (!heroCopy || !chapters.length) return;

  gsap.set(chapters, { autoAlpha: 0, y: 28 });

  const state = {
    rest: 1,
    alphas: chapters.map(() => 0),
  };

  function applyCopy(progress) {
    const rest = clamp01(1 - progress / 0.12);
    if (Math.abs(rest - state.rest) > 0.001) {
      state.rest = rest;
      gsap.set(heroCopy, {
        autoAlpha: rest,
        y: (1 - rest) * -36,
      });
    }

    const chapterT = clamp01((progress - 0.1) / 0.9);
    chapters.forEach((panel, i) => {
      const start = i / chapters.length;
      const end = (i + 1) / chapters.length;
      const center = (start + end) / 2;
      let alpha = 0;
      if (progress >= 0.1) {
        if (reduce) {
          alpha = i === Math.min(chapters.length - 1, Math.floor(chapterT * 0.999 * chapters.length)) ? 1 : 0;
        } else if (chapterT <= start) {
          alpha = 0;
        } else if (chapterT >= end) {
          alpha = chapterT < end + 0.08 ? clamp01(1 - (chapterT - end) / 0.08) : 0;
        } else {
          const enter = start + 0.08;
          alpha = chapterT < enter ? clamp01((chapterT - start) / 0.08) : 1;
        }
      }
      if (Math.abs(alpha - state.alphas[i]) < 0.002) return;
      state.alphas[i] = alpha;
      gsap.set(panel, {
        autoAlpha: alpha,
        y: (1 - alpha) * (chapterT >= center ? -24 : 24),
      });
    });
  }

  ScrollTrigger.create({
    id: "nadi-hero",
    trigger: "#pin-slot",
    start: "top top",
    end: () => `+=${Math.round(window.innerHeight * 5)}`,
    pin: true,
    pinSpacing: true,
    anticipatePin: 1,
    scrub: 0.65,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      cluster.setProgress(clamp01((self.progress - 0.1) / 0.9));
      applyCopy(self.progress);
    },
  });

  applyCopy(0);

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
