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
    lead: "CRM AI Agent and Codev handle repeatable questions and development tasks, giving teams more time for work that needs people.",
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


let activeOrbit = -1;
let orbitCopyTl = null;

function applyOrbitCopy(story, title, lead) {
  title.replaceChildren();
  const lines = story.titleLines || [story.title];
  lines.forEach((line, index) => {
    if (index > 0) title.appendChild(document.createElement("br"));
    title.appendChild(document.createTextNode(line));
  });
  lead.textContent = story.lead;
}

function setOrbitCopy(index, immediate = false) {
  if (index < -1 || index >= ORBIT_STORIES.length || index === activeOrbit) return;

  activeOrbit = index;
  const story = index === -1 ? DEFAULT_ORBIT_STORY : ORBIT_STORIES[index];
  const title = document.getElementById("doctrine-title");
  const lead = document.getElementById("doctrine-lead");

  if (!title || !lead) return;

  if (immediate || !gsap) {
    applyOrbitCopy(story, title, lead);
    return;
  }

  const restoringDefault = index === -1;
  if (orbitCopyTl) orbitCopyTl.kill();
  orbitCopyTl = gsap.timeline({ defaults: { overwrite: "auto" } })
    .to([title, lead], {
      autoAlpha: 0,
      y: 18,
      duration: restoringDefault ? 0.18 : 0.46,
      ease: "power2.inOut",
    })
    .call(() => {
      applyOrbitCopy(story, title, lead);
    })
    .fromTo(
      [title, lead],
      { autoAlpha: 0, y: -18 },
      {
        autoAlpha: 1,
        y: 0,
        duration: restoringDefault ? 0.46 : 0.9,
        ease: "power3.out",
        stagger: 0.08,
      },
    );
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
      onEnterBack: lockOrbit,
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
      autoAlpha: 0.62,
      duration: 0.5,
    }, 0.25);

  gsap.set(indexLines, {
    autoAlpha: 0,
    yPercent: 105,
  });

  ScrollTrigger.create({
    id: "products-title-enter",
    trigger: "#work",
    start: "top 82%",
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

if (gsap && !isShot) {
  if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  gsap.set("#site-nav, #hero-copy", { autoAlpha: 0 });
  const ctx = gsap.context(() => {
    smooth();
    const orbitTl = startOrbitAutoplay();
    bindSpatialFold(orbitTl);
    bindEnter();
    bindParallax();
  }, document.body);

  if (ScrollTrigger) {
    window.addEventListener("load", () => ScrollTrigger.refresh());
  }
  window.addEventListener("pagehide", () => ctx.revert());
} else if (!isShot) {
  smooth();
}

if (!isShot) {
  const welcomeActive = Boolean(document.getElementById("welcome-bumper"));
  prepareOrbitHero(!welcomeActive);
  window.dispatchEvent(new CustomEvent("xstation:orbit-ready"));
}
