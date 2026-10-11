import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import * as shop from "./shopify.js";
import { demoProducts } from "./demo.js";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

const RM = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const { money, isLive } = shop;

/* ================= primitives ================= */
function Reveal({ as: Tag = "div", className = "", children, y = 48, delay = 0, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (RM()) return;
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.from(el, {
        y, opacity: 0, duration: 1, delay, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    });
    return () => ctx.revert();
  }, [y, delay]);
  return <Tag ref={ref} className={`gs-reveal ${className}`} {...rest}>{children}</Tag>;
}

function Tilt({ children, className = "", max = 9, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    if (RM()) return;
    if (window.matchMedia?.("(hover: none), (pointer: coarse)").matches) return;
    const el = ref.current;
    if (!el) return;
    gsap.set(el, { transformPerspective: 900 });
    const rX = gsap.quickTo(el, "rotationX", { duration: 0.5, ease: "power3" });
    const rY = gsap.quickTo(el, "rotationY", { duration: 0.5, ease: "power3" });
    const move = (e) => {
      // While pressing, or while hovering a clickable child, go flat —
      // otherwise the button shifts under the cursor and clicks get lost.
      if (e.buttons > 0 || e.target.closest?.("button, a")) { rX(0); rY(0); return; }
      const r = el.getBoundingClientRect();
      rY(((e.clientX - r.left) / r.width - 0.5) * max * 2);
      rX(-((e.clientY - r.top) / r.height - 0.5) * max * 2);
    };
    const leave = () => { rX(0); rY(0); };
    const flat = () => { rX(0); rY(0); };
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    el.addEventListener("pointerdown", flat);
    return () => {
      el.removeEventListener("mousemove", move);
      el.removeEventListener("mouseleave", leave);
      el.removeEventListener("pointerdown", flat);
    };
  }, [max]);
  return <div ref={ref} className={`tilt ${className}`} {...rest}>{children}</div>;
}

function Chars({ text }) {
  return (
    <span className="chars" aria-label={text}>
      {text.split("").map((c, i) => (
        <span key={i} className="ch-mask" aria-hidden="true">
          <span className="ch">{c === " " ? " " : c}</span>
        </span>
      ))}
    </span>
  );
}

function Glasses({ tint = "#1d1d1f", className = "" }) {
  return (
    <svg className={className} viewBox="0 0 600 220" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`l${tint}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fb8ff" stopOpacity=".55" />
          <stop offset="1" stopColor="#c9a6ff" stopOpacity=".25" />
        </linearGradient>
      </defs>
      <path d="M20 70 Q20 40 60 40 L240 40 Q280 40 280 80 L280 120 Q280 175 220 175 L90 175 Q30 175 25 120 Z" fill={`url(#l${tint})`} stroke={tint} strokeWidth="9" />
      <path d="M580 70 Q580 40 540 40 L360 40 Q320 40 320 80 L320 120 Q320 175 380 175 L510 175 Q570 175 575 120 Z" fill={`url(#l${tint})`} stroke={tint} strokeWidth="9" />
      <path d="M280 75 Q300 58 320 75" stroke={tint} strokeWidth="9" strokeLinecap="round" />
      <path d="M20 70 L0 62 M580 70 L600 62" stroke={tint} strokeWidth="9" strokeLinecap="round" />
      <circle cx="262" cy="52" r="5" fill="#4da3ff"><animate attributeName="opacity" values="1;.2;1" dur="2.4s" repeatCount="indefinite" /></circle>
    </svg>
  );
}

/* ---------- cart ---------- */
function useCart() {
  const [cart, setCart] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState(false);

  const storage = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { window.localStorage.removeItem(k); } catch (e) {} },
  };

  useEffect(() => {
    if (!isLive) return;
    const id = storage.get("gely_cart");
    if (id) shop.getCart(id).then((c) => c ? setCart(shop.normalizeCart(c)) : storage.del("gely_cart")).catch(() => {});
  }, []);

  const run = useCallback(async (fn) => {
    setBusy(true);
    try { const c = await fn(); setCart(shop.normalizeCart(c)); storage.set("gely_cart", c.id); }
    catch (e) { console.error(e); alert("Something went wrong with your cart. Please try again."); }
    finally { setBusy(false); }
  }, []);

  const demoSet = (lines) => setCart({
    id: "demo", checkoutUrl: null, lines,
    count: lines.reduce((n, l) => n + l.qty, 0),
    subtotal: lines.reduce((n, l) => n + l.qty * l.price, 0), currency: "USD",
  });

  // Direct purchase: build a single-item cart and jump straight to checkout.
  const buyNow = useCallback(async (variant) => {
    if (!variant || buying) return;
    if (!isLive) { alert("Demo mode: add your Shopify token in .env to enable checkout."); return; }
    setBuying(true);
    try {
      const base = cart?.id ? await shop.addLine(cart.id, variant.id) : await shop.createCart(variant.id);
      const norm = shop.normalizeCart(base);
      setCart(norm);
      try { localStorage.setItem("gely_cart", base.id); } catch {}
      if (norm.checkoutUrl) window.location.href = norm.checkoutUrl;
      else alert("Something went wrong with your cart. Please try again.");
    } catch (e) { console.error(e); alert("Something went wrong with your cart. Please try again."); }
    finally { setBuying(false); }
  }, [cart?.id, buying]);
  const setQty = (line, qty) => {
    if (!isLive) return demoSet((cart.lines.map((l) => (l.id === line.id ? { ...l, qty } : l))).filter((l) => l.qty > 0));
    run(() => (qty < 1 ? shop.removeLine(cart.id, line.id) : shop.updateLine(cart.id, line.id, qty)));
  };
  return { cart, open, setOpen, busy, buying, buyNow, setQty };
}

function CartDrawer({ c }) {
  const { cart, open, setOpen, busy, setQty } = c;
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!open || RM()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".drawer .line",
        { x: 56, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.55, stagger: 0.07, ease: "power3.out", delay: 0.15 });
      gsap.fromTo(".drawer footer",
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: "power3.out", delay: 0.3 });
    }, bodyRef);
    return () => ctx.revert();
  }, [open, cart?.lines.length]);

  return (
    <>
      <div className={`scrim ${open ? "show" : ""}`} onClick={() => setOpen(false)} />
      <aside ref={bodyRef} className={`drawer ${open ? "show" : ""}`} aria-hidden={!open}>
        <header><h3>Bag</h3><button className="icon" onClick={() => setOpen(false)} aria-label="Close">✕</button></header>
        <div className="lines">
          {!cart?.lines.length && <p className="muted center">Your bag is empty.</p>}
          {cart?.lines.map((l) => (
            <div className="line" key={l.id}>
              <div className="thumb">{l.image ? <img src={l.image} a lt="" /> : <Glasses tint={l.tint || "#1d1d1f"} />}</div>
              <div className="info">
                <strong>{l.title}</strong><span className="muted">{l.variantTitle !== "Default Title" && l.variantTitle}</span>
                <div className="qty">
                  <button disabled={busy} onClick={() => setQty(l, l.qty - 1)}>−</button>
                  <span>{l.qty}</span>
                  <button disabled={busy} onClick={() => setQty(l, l.qty + 1)}>+</button>
                </div>
              </div>
              <span>{money(l.price * l.qty, cart.currency)}</span>
            </div>
          ))}
        </div>
        {!!cart?.lines.length && (
          <footer>
            <div className="row"><span>Subtotal</span><strong>{money(cart.subtotal, cart.currency)}</strong></div>
            {cart.checkoutUrl
              ? <a className="btn block" href={cart.checkoutUrl}>Check out</a>
              : <button className="btn block" onClick={() => alert("Demo mode: add your Shopify token in .env to enable checkout.")}>Check out</button>}
          </footer>
        )}
      </aside>
    </>
  );
}

/* ---------- chrome ---------- */
function ProgressBar() {
  const ref = useRef(null);
  useEffect(() => {
    if (RM()) return;
    const el = ref.current;
    const tween = gsap.fromTo(el, { scaleX: 0 }, {
      scaleX: 1, ease: "none",
      scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
    });
    return () => { tween.scrollTrigger?.kill(); tween.kill(); };
  }, []);
  return <div id="progress" ref={ref} />;
}

function Nav({ count, onBag }) {
  const bagRef = useRef(null);

  useEffect(() => {
    if (RM()) return;
    const st = ScrollTrigger.create({
      start: 0, end: "max",
      onUpdate: (self) => {
        const y = self.scroll();
        gsap.set(".nav", { yPercent: 0, y: 0 });
        gsap.to(".nav", {
          backgroundColor: y > 40 ? "rgba(255,255,255,.86)" : "rgba(255,255,255,.55)",
          duration: 0.3, overwrite: "auto",
        });
      },
    });
    return () => st.kill();
  }, []);

  useEffect(() => {
    if (RM() || !count) return;
    gsap.fromTo("#bag-btn", { scale: 1 }, { scale: 1.35, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out" });
  }, [count]);

  useLayoutEffect(() => {
    if (RM()) return;
    const ctx = gsap.context(() => {
      gsap.from(".nav-in", { y: -48, opacity: 0, duration: 0.9, ease: "power3.out", delay: 0.1 });
    });
    return () => ctx.revert();
  }, []);

  return (
    <nav className="nav">
      <div className="nav-in">
        <a href="#top" className="logo">Gely</a>
        <div className="links"><a href="#features">Features</a><a href="#specs">Tech Specs</a><a href="#shop">Shop</a></div>
        <button ref={bagRef} id="bag-btn" className="bag" onClick={onBag} aria-label="Open bag">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></svg>
          {count > 0 && <i className="bag-count">{count}</i>}
        </button>
      </div>
    </nav>
  );
}

/* ---------- hero ---------- */
function Hero({ onBuy, canBuy, buying }) {
  const scope = useRef(null);

  useLayoutEffect(() => {
    if (RM()) return;
    const root = scope.current;
    if (!root) return;
    // Scrub owns wrap yPercent/rotation; tilt owns rotationX/Y.
    const wrap = root.querySelector(".hero-glasses-wrap");
    const img = root.querySelector(".hero-glasses");
    const copy = root.querySelector(".hero-copy");
    const dot = root.querySelector(".scroll-cue .dot");
    const ctx = gsap.context(() => {
      // No entrance motion: hero copy + glasses render in final position on load.

      // 2. idle float loop
      gsap.to(img, { y: -16, duration: 2.8, yoyo: true, repeat: -1, ease: "sine.inOut" });

      // 5. scroll cue bounce
      if (dot) gsap.to(dot, { y: 12, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut" });

      // 6+7. scroll scrub with the section element as trigger — a ".hero"
      // string can't match the scope root itself, so ScrollTrigger warns
      // "Element not found" and the scrub never runs.
      gsap.to(wrap, {
        yPercent: 18, rotation: -5, ease: "none",
        scrollTrigger: { trigger: root, start: "top top", end: "bottom top", scrub: 1 },
      });
      gsap.to(copy, {
        yPercent: -25, opacity: 0, ease: "none",
        scrollTrigger: { trigger: root, start: "top top", end: "70% top", scrub: 1 },
      });
    }, scope);
    return () => ctx.revert();
  }, []);

  // mouse 3D tilt
  useEffect(() => {
    if (RM()) return;
    const hero = scope.current;
    const wrap = hero?.querySelector(".hero-glasses-wrap");
    if (!hero || !wrap) return;
    gsap.set(wrap, { transformPerspective: 1100 });
    const rX = gsap.quickTo(wrap, "rotationX", { duration: 0.6, ease: "power3" });
    const rY = gsap.quickTo(wrap, "rotationY", { duration: 0.6, ease: "power3" });
    const move = (e) => {
      const r = hero.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      rY(px * 16); rX(-py * 12);
    };
    const leave = () => { rX(0); rY(0); };
    hero.addEventListener("mousemove", move);
    hero.addEventListener("mouseleave", leave);
    return () => {
      hero.removeEventListener("mousemove", move);
      hero.removeEventListener("mouseleave", leave);
    };
  }, []);

  // Interactive dot field: dots scatter away from the cursor and spring back.
  useEffect(() => {
    if (RM()) return;
    const hero = scope.current;
    const canvas = hero?.querySelector(".hero-dots");
    if (!hero || !canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const GAP = 34, RADIUS = 150, PUSH = 3.2;
    let dots = [], raf = 0, visible = true;
    const mouse = { x: -9999, y: -9999 };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = hero.clientWidth, h = hero.clientHeight;
      canvas.width = Math.max(1, w * dpr);
      canvas.height = Math.max(1, h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      dots = [];
      for (let y = GAP / 2; y < h; y += GAP)
        for (let x = GAP / 2; x < w; x += GAP)
          dots.push({ ox: x, oy: y, x, y, vx: 0, vy: 0 });
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("load", resize);
    let stopRO = null;
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(resize);
      ro.observe(hero);
      stopRO = () => ro.disconnect();
    }
    const onMove = (e) => {
      const r = hero.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    hero.addEventListener("mousemove", onMove);
    hero.addEventListener("mouseleave", onLeave);
    let stopWatching = null;
    if (typeof IntersectionObserver !== "undefined" && typeof requestAnimationFrame !== "undefined") {
      const io = new IntersectionObserver((entries) => {
        const v = entries[0] && entries[0].isIntersecting;
        if (v && !visible) { visible = true; raf = requestAnimationFrame(tick); }
        else if (!v) { visible = false; cancelAnimationFrame(raf); }
      });
      io.observe(hero);
      stopWatching = () => io.disconnect();
    }
    const tick = () => {
      if (!visible) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, hero.clientWidth, hero.clientHeight);
      for (const d of dots) {
        const dx = d.x - mouse.x, dy = d.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < RADIUS && dist > 0.01) {
          const f = 1 - dist / RADIUS;
          d.vx += (dx / dist) * f * f * PUSH;
          d.vy += (dy / dist) * f * f * PUSH;
        }
        d.vx += (d.ox - d.x) * 0.08;
        d.vy += (d.oy - d.y) * 0.08;
        d.vx *= 0.88; d.vy *= 0.88;
        d.x += d.vx; d.y += d.vy;
        const excitement = Math.min(1, Math.hypot(d.x - d.ox, d.y - d.oy) / 26);
        g.beginPath();
        g.arc(d.x, d.y, 1.3 + excitement * 1.5, 0, 6.2832);
        g.fillStyle = "rgba(29,29,31," + (0.16 + excitement * 0.55).toFixed(3) + ")";
        g.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (stopWatching) stopWatching();
      window.removeEventListener("resize", resize);
      window.removeEventListener("load", resize);
      if (stopRO) stopRO();
      hero.removeEventListener("mousemove", onMove);
      hero.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <header className="hero" id="top" ref={scope}>
      <canvas className="hero-dots" aria-hidden="true" />
      <div className="hero-copy">
        <p className="eyebrow">Introducing</p>
        <h1><Chars text="Gely glasses." /></h1>
        <h2>Smart, beautifully invisible.</h2>
        <div className="cta">
          <button className="btn" onClick={onBuy} disabled={!canBuy || buying}>{buying ? "Redirecting\u2026" : "Buy"}</button>
          <a className="link" href="#features">Learn more ›</a>
        </div>
      </div>
      <div className="hero-glasses-wrap">
        <img className="hero-glasses" src="/gely-glasses.png" alt="Gely smart glasses" />
      </div>
      <div className="scroll-cue" aria-hidden="true"><div className="mouse"><div className="dot" /></div></div>
    </header>
  );
}

/* ---------- marquee ---------- */
const marqueeItems = ["Open-Ear Audio", "12-Hour Battery", "12MP Camera", "Featherlight", "AI Assistant"];
function Marquee() {
  const trackRef = useRef(null);
  useLayoutEffect(() => {
    if (RM()) return;
    const ctx = gsap.context(() => {
      const loop = gsap.to(trackRef.current, {
        xPercent: -50, duration: 22, ease: "none", repeat: -1,
      });
      // velocity skew
      const skewTo = gsap.quickTo(trackRef.current, "skewX", { duration: 0.4, ease: "power3" });
      ScrollTrigger.create({
        start: 0, end: "max",
        onUpdate: (self) => {
          const v = gsap.utils.clamp(-10, 10, self.getVelocity() / -260);
          skewTo(v);
          loop.timeScale(gsap.utils.clamp(1, 4, 1 + Math.abs(self.getVelocity()) / 2500));
          gsap.delayedCall(0.15, () => { skewTo(0); loop.timeScale(1); });
        },
      });
    });
    return () => ctx.revert();
  }, []);
  const row = [...marqueeItems, ...marqueeItems];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track" ref={trackRef}>
        {[0, 1].map((half) => (
          <div className="marquee-half" key={half}>
            {row.map((t, i) => (
              <span key={`${half}-${i}`} className="mq">{t}<i>✦</i></span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- features ---------- */
const features = [
  ["RX Ready", "Prescription Lens Support", "Includes compatible vision lenses for those who wear glasses."],
  ["Audio", "Premium Audio Experience.", "Enjoy your music with clear, high-quality sound."],
  ["Battery", "Lasts all day.", "Up to 12 hours of mixed use."],
  ["Assistant", "Just say the word.", "Ask a question, capture a moment or send a message, hands-free."],
];
function Features() {
  const scope = useRef(null);
  useLayoutEffect(() => {
    if (RM()) return;
    const root = scope.current;
    if (!root) return;
    const ctx = gsap.context(() => {
      // staggered card entrance
      gsap.from(".card", {
        y: 90, opacity: 0, duration: 1, stagger: 0.12, ease: "power3.out",
        scrollTrigger: { trigger: ".grid4", start: "top 85%", once: true },
      });
      // title words rise
      gsap.from(".features-title .w", {
        yPercent: 110, duration: 0.9, stagger: 0.08, ease: "expo.out",
        scrollTrigger: { trigger: ".features-title", start: "top 86%", once: true },
      });
      // subtle bg glow pan on scroll (element, not an "#features"
      // string — the scope root never matches its own selector)
      gsap.to(root, {
        backgroundPosition: "50% 30%", ease: "none",
        scrollTrigger: { trigger: root, start: "top bottom", end: "bottom top", scrub: 1 },
      });
      gsap.from(".asdf", {
        y: 90, opacity: 0, duration: 1, stagger: 0.12, ease: "power3.out",
        scrollTrigger: { trigger: ".grid4", start: "top 85%", once: true },
      });
    }, scope);
    return () => ctx.revert();
  }, []);
  return (
    <section id="features" className="dark" ref={scope}>
      <h2 className="section-title features-title">
        <span className="w-mask"><span className="w">Everything</span></span>{" "}
        <span className="w-mask"><span className="w">you</span></span>{" "}
        <span className="w-mask"><span className="w">need.</span></span>
        <br /><span className="grad">Nothing you don't.</span>
      </h2>
      <div className="grid4">
        {features.map(([k, t, d]) => (
          <Tilt className="card" key={k}><small>{k}</small><h3>{t}</h3><p>{d}</p></Tilt>
        ))}
      </div>
      <p className="asdf">Everything you need, conveniently packed in one box.</p>
    </section>
  );
}

/* ---------- pinned showcase ---------- */
const showcaseCaps = ["Glanceable directions", "Live translations", "Hands-free capture"];
function Showcase() {
  const scope = useRef(null);
  useLayoutEffect(() => {
    if (RM()) return;
    const root = scope.current;
    if (!root) return;
    const img = root.querySelector(".showcase-img");
    const text = root.querySelector(".showcase-text");
    const caps = root.querySelectorAll(".cap");
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root, start: "top top", end: "+=140%", pin: true, scrub: 1 },
      });
      tl.fromTo(img, { scale: 0.78, rotation: -4 }, { scale: 1.12, rotation: 2, ease: "none", duration: 3 }, 0)
        .fromTo(text, { scale: 1.15, opacity: 0 }, { scale: 1, opacity: 1, ease: "none", duration: 3 }, 0)
        .fromTo(caps[0], { opacity: 1, y: 0, scale: 2 }, { opacity: 0, y: -40, duration: 1 }, 0.4)
        .fromTo(caps[1], { opacity: 0, y: 40, scale: 2 }, { opacity: 1, y: 0, duration: 1 }, 1.0)
        .to(caps[1], { opacity: 0, y: -40, scale: 2, duration: 1 }, 1.9)
        .fromTo(caps[2], { opacity: 0, y: 40, scale: 2 }, { opacity: 1, y: 0, duration: 1 }, 2.2);
    }, scope);
    return () => ctx.revert();
  }, []);
  return (
    <section id="showcase" ref={scope}>
      <div className="showcase-pin">
        <div className="ar-grid" aria-hidden="true" />
        <div className="ar-ring" aria-hidden="true" />
        <div className="scanline" aria-hidden="true" />
        <i className="corner tl" aria-hidden="true" /><i className="corner tr" aria-hidden="true" /><i className="corner bl" aria-hidden="true" /><i className="corner br" aria-hidden="true" />
        <span className="ar-tag t1" aria-hidden="true"><i />Directions · 200 m</span>
        <span className="ar-tag t2" aria-hidden="true"><i />EN → ES · Live</span>
        <span className="ar-tag t3" aria-hidden="true"><i />REC · 12 MP</span>
        <h2 className="showcase-text">See the world,<br />augmented.</h2>
        <img className="showcase-img" src="/gely-glasses.png" alt="Gely glasses close-up" />
        <div className="caps">
          {showcaseCaps.map((c, i) => (
            <span key={c} className={`cap cap-${i}`}>{c}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- specs with count-up ---------- */
const specs = [
  { v: 12, suffix: " hrs", label: "Battery life", count: true },
  { v: 38, suffix: " g", label: "Weight", count: true },
  { v: "IPX4", label: "Water resistant" },
  { v: 12, suffix: " MP", label: "Camera", count: true },
  { v: "Wi-Fi · BT", label: "Connectivity" },
  { v: "Rx ready", label: "Prescription lenses" },
];
function SpecItem({ s }) {
  return (
    <div className="spec">
      <b>{s.count ? `${s.v}${s.suffix}` : s.v}</b>
      <span>{s.label}</span>
    </div>
  );
}
function Specs() {
  return (
    <section id="specs">
      <Reveal as="h2" className="section-title">Tech specs.</Reveal>
      <div className="specs">
        {specs.map((s) => <SpecItem key={s.label} s={s} />)}
      </div>
    </section>
  );
}

/* ---------- shop ---------- */
function ProductCard({ p, onBuy, buying }) {
  const [vi, setVi] = useState(0);
  const v = p.variants[vi];
  const cardRef = useRef(null);

  useLayoutEffect(() => {
    if (RM()) return;
    const ctx = gsap.context(() => {
      // entrance
      gsap.from(cardRef.current, {
        y: 80, opacity: 0, duration: 0.9, ease: "power3.out",
        scrollTrigger: { trigger: cardRef.current, start: "top 90%", once: true },
      });
      // image parallax drift
      gsap.fromTo(".pimg img, .pimg svg", { yPercent: -7 }, {
        yPercent: 7, ease: "none",
        scrollTrigger: { trigger: cardRef.current, start: "top bottom", end: "bottom top", scrub: 1 },
      });
    }, cardRef);
    return () => ctx.revert();
  }, []);

  return (
      <div className="product" ref={cardRef}>
        <div className="pimg">{p.image ? <img src={p.image} alt={p.title} /> : <Glasses tint={p.tint || "#1d1d1f"} />}</div>
        <h3>{p.title}</h3>
        <p className="muted">{p.description}</p>
        {p.variants.length > 1 && (
          <div className="chips">{p.variants.map((x, i) => <button key={x.id} className={i === vi ? "on" : ""} onClick={() => setVi(i)}>{x.title}</button>)}</div>
        )}
        <div className="buy">
          <span>From {money(v.price, v.currency)}</span>
          
            <button className="btn sm" disabled={!v.available || buying} onClick={() => onBuy(v)}>{v.available ? (buying ? "Redirecting\u2026" : "Buy Now") : "Sold out"}</button>
        </div>
      </div>
  );
}

function Shop({ products, error, onBuy, buying }) {
  useEffect(() => {
    if (products) ScrollTrigger.refresh();
  }, [products]);
  return (
    <section id="shop" className="light">
      <Reveal as="h2" className="section-title">Find your Gely.</Reveal>
      {!isLive && <p className="notice">Demo mode. Add your Shopify domain and token in <code>.env</code> to show your real products.</p>}
      {error && <p className="notice">Couldn't load products. Check your Shopify domain and token.</p>}
      {!products && !error && <p className="muted center">Loading…</p>}
      <div className="grid3">{products?.map((p) => <ProductCard key={p.id} p={p} onBuy={onBuy} buying={buying} />)}</div>
    </section>
  );
}

/* ---------- CTA banner ---------- */
const reviews = [
  ["I forget I'm wearing tech.", "The display is there when I need it and gone when I don't. Battery easily lasts my whole day.", "Maya R.", "Verified buyer"],
  ["Sound without the buds.", "Calls and music sound great and I can still hear traffic. The fit is just like normal glasses.", "Daniel K.", "Verified buyer"],
  ["My travel essential.", "Live translations on the street in Lisbon felt like magic. Setup took five minutes.", "Sofia L.", "Verified buyer"],
];
function Stars() {
  return <div className="stars" aria-label="5 out of 5 stars">★★★★★</div>;
}
function CtaBanner({ onBuy, canBuy, buying }) {
  const scope = useRef(null);
  useLayoutEffect(() => {
    if (RM()) return;
    const ctx = gsap.context(() => {
      gsap.from(".cta-title .ch", {
        yPercent: 115, duration: 0.8, stagger: 0.025, ease: "expo.out",
        scrollTrigger: { trigger: ".cta-banner", start: "top 82%", once: true },
      });
      gsap.from(".cta-banner", {
        y: 70, opacity: 0, scale: 0.97, duration: 1, ease: "power3.out",
        scrollTrigger: { trigger: ".cta-banner", start: "top 88%", once: true },
      });
      // animated gradient drift
      gsap.to(".cta-banner", {
        backgroundPosition: "100% 50%", duration: 8, yoyo: true, repeat: -1, ease: "sine.inOut",
      });
    }, scope);
    return () => ctx.revert();
  }, []);
  return (
    <section className="cta-wrap" ref={scope}>
      <div className="cta-banner">
        <span className="ring r1" /><span className="ring r2" /><span className="ring r3" />
        <h2 className="cta-title"><Chars text="Loved by wearers." /></h2>
        <p className="cta-sub"><strong>4.9 / 5</strong> from 2,300+ verified reviews</p>
        <div className="reviews">
          {reviews.map(([t, d, n, v]) => (
            <figure className="review" key={n}>
              <Stars />
              <blockquote><strong>{t}</strong><span>{d}</span></blockquote>
              <figcaption>{n} · <em>{v}</em></figcaption>
            </figure>
          ))}
        </div>
        <button className="btn light-btn" onClick={onBuy} disabled={!canBuy || buying}>{buying ? "Redirecting\u2026" : "Shop Gely"}</button>
      </div>
    </section>
  );
}

function Footer() {
  const toTop = (e) => {
    e.preventDefault();
    if (RM()) return document.getElementById("top")?.scrollIntoView();
    gsap.to(window, { duration: 1.2, ease: "power3.inOut", scrollTo: { y: 0 } });
  };
  return (
    <footer className="foot">
      <p>© {new Date().getFullYear()} Gely glasses. All rights reserved.</p>
      <p><a href="#top">Privacy</a> · <a href="#top">Terms</a> · <a href="#top">Support</a></p>
      <a href="#top" className="to-top" onClick={toTop} aria-label="Back to top">↑</a>
    </footer>
  );
}

export default function App() {
  const c = useCart();

  // Always land at the very top on (re)load so "Introducing" is visible.
  useLayoutEffect(() => {
    try { window.history.scrollRestoration = "manual"; } catch {}
    if (!window.location.hash) window.scrollTo(0, 0);
  }, []);

  // Images change layout after load — refresh trigger positions once settled.
  useEffect(() => {
    if (RM()) return;
    const onLoad = () => {
      ScrollTrigger.refresh();
      if (!window.location.hash) window.scrollTo(0, 0);
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  // buttery anchor scrolling for all in-page links
  useEffect(() => {
    if (RM()) return;
    const fn = (ev) => {
      const a = ev.target.closest?.('a[href^="#"]');
      if (!a) return;
      const hash = a.getAttribute("href");
      if (!hash || hash.length < 2) return;
      const t = document.querySelector(hash);
      if (!t) return;
      ev.preventDefault();
      gsap.to(window, { duration: 1, ease: "power3.inOut", scrollTo: { y: t, offsetY: 44 } });
    };
    document.addEventListener("click", fn);
    return () => document.removeEventListener("click", fn);
  }, []);

  // Products live here so every Buy button can jump straight to checkout.
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!isLive) return setProducts(demoProducts);
    shop.fetchProducts().then(setProducts).catch(() => setError(true));
  }, []);
  const first = products?.[0] || null;
  const firstVariant = first ? (first.variants.find((x) => x.available) || first.variants[0]) : null;
  const buyFirst = () => { if (firstVariant) c.buyNow(firstVariant); };

  return (
    <>
      <ProgressBar />
      <Nav count={c.cart?.count || 0} onBag={() => c.setOpen(true)} />
      <main>
        <Hero onBuy={buyFirst} canBuy={!!firstVariant} buying={c.buying} />
        <Marquee />
        <Features />
        <Showcase />
        <Specs />
        <CtaBanner onBuy={buyFirst} canBuy={!!firstVariant} buying={c.buying} />
        <Shop products={products} error={error} onBuy={(v) => c.buyNow(v)} buying={c.buying} />
      </main>
      <Footer />
      <CartDrawer c={c} />
    </>
  );
}
