/*
 * The System Behind Every Agent:
 * interactive blueprint states, a restrained content reveal, and the glare that
 * bridges the existing scroll-driven hero into this section.
 */
(() => {
  const root = document.getElementById("system");
  const list = document.getElementById("sys-list");
  const blueprint = document.getElementById("system-blueprint");
  if (!root || !list || !blueprint) return;

  const items = [...list.querySelectorAll("li")];
  const caption = document.getElementById("sys-cap");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer = window.matchMedia("(hover: hover) and (min-width: 901px)");
  let current = "ecosystem";
  let hoverLock = 0;

  const groundObserver = new IntersectionObserver(([entry]) => {
    document.body.classList.toggle("system-reached", entry.isIntersecting);
  }, {
    rootMargin: "0px 0px -99% 0px",
    threshold: 0,
  });
  groundObserver.observe(root);

  function select(key) {
    if (!key || key === current) return;
    current = key;
    blueprint.dataset.state = key;
    items.forEach((item) => item.classList.toggle("is-on", item.dataset.systemState === key));

    const item = items.find((candidate) => candidate.dataset.systemState === key);
    if (!caption || !item) return;
    const title = item.querySelector("h3");
    const description = item.querySelector("p");
    caption.querySelector(".ck").textContent =
      `${item.querySelector(".n").textContent} · ${title.childNodes[0].textContent.trim().toUpperCase()}`;
    caption.querySelector("p").textContent = description.textContent;
  }

  items.forEach((item) => {
    item.tabIndex = 0;
    item.addEventListener("mouseenter", () => {
      hoverLock = performance.now();
      select(item.dataset.systemState);
    });
    item.addEventListener("click", () => select(item.dataset.systemState));
    item.addEventListener("focus", () => select(item.dataset.systemState));
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      select(item.dataset.systemState);
    });
  });

  const activeItemObserver = new IntersectionObserver((entries) => {
    if (pointer.matches || performance.now() - hoverLock < 900) return;
    entries.forEach((entry) => {
      if (entry.isIntersecting) select(entry.target.dataset.systemState);
    });
  }, {
    rootMargin: "-46% 0px -46% 0px",
    threshold: 0,
  });
  items.forEach((item) => activeItemObserver.observe(item));

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger || reduce) return;
  gsap.registerPlugin(ScrollTrigger);

  const titleLines = root.querySelectorAll(".ns-line > span");
  const support = root.querySelector(".sys-support");
  const stage = root.querySelector(".sys-stage");

  gsap.set(titleLines, { autoAlpha: 0, yPercent: 112, rotate: 1 });
  gsap.set(support, { autoAlpha: 0, y: 20 });
  gsap.set(items, { autoAlpha: 0, y: 18 });
  gsap.set(stage, { autoAlpha: 0, x: 34, scale: 0.985 });

  gsap.timeline({
    defaults: { ease: "power3.out" },
    scrollTrigger: {
      id: "system-content-enter",
      trigger: root,
      start: "top 58%",
      once: true,
    },
  })
    .to(titleLines, {
      autoAlpha: 1,
      yPercent: 0,
      rotate: 0,
      duration: 0.9,
      stagger: 0.09,
    })
    .to(support, { autoAlpha: 1, y: 0, duration: 0.65 }, "-=0.58")
    .to(items, {
      autoAlpha: 1,
      y: 0,
      duration: 0.52,
      stagger: 0.055,
      onComplete: () => {
        // Return opacity ownership to CSS so active, hover, and idle states
        // remain visible after the entrance animation finishes.
        gsap.set(items, { clearProps: "opacity,visibility" });
      },
    }, "-=0.42")
    .to(stage, {
      autoAlpha: 1,
      x: 0,
      scale: 1,
      duration: 0.9,
    }, 0.14);
})();
