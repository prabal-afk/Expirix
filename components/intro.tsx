"use client";

import { useEffect, useRef } from "react";
import { INTRO_KEY } from "@/lib/intro-key";

const DURATION = 4.2;
const PRIMARY = "#15803d";
const SECONDARY = "#86efac";
const TAGLINE = "Track Expiry. Reduce Waste. Sell Fresh.";

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const p = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

const MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512"><defs><mask id="h"><rect width="64" height="64" fill="#fff"/><path d="M32 49C37 45 38 40 32 37C26 40 27 45 32 49Z" fill="#000"/></mask></defs>' +
  `<path d="M15 7H49C49 23 38 28 32 32C26 28 15 23 15 7Z" fill="none" stroke="${PRIMARY}" stroke-width="4.5" stroke-linejoin="round"/>` +
  `<path mask="url(#h)" d="M15 57H49C49 41 38 36 32 32C26 36 15 41 15 57Z" fill="${PRIMARY}"/><circle cx="32" cy="32" r="3.2" fill="#f59e0b"/></svg>`;

/** First-visit intro: the logo reveal, drawn live. Shown once per browser; see the inline script in app/layout.tsx. */
export function Intro() {
  const cvRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.intro !== "play") return;
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* ignore */
    }
    const canvas = cvRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      root.dataset.intro = "done";
      return;
    }

    let raf = 0;
    let done = false;
    let logo: HTMLImageElement | null = null;
    const img = new Image();
    img.onload = () => (logo = img);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(MARK_SVG);
    void document.fonts?.load('800 40px "Inter Variable"').catch(() => undefined);
    void document.fonts?.load('500 40px "Inter Variable"').catch(() => undefined);

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      root.dataset.intro = "fading";
      window.setTimeout(() => (root.dataset.intro = "done"), 550);
    };
    (window as unknown as { __skipIntro?: () => void }).__skipIntro = finish;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish();
    };
    window.addEventListener("keydown", onKey);

    const font = (size: number, weight: number) => `${weight} ${size}px "Inter Variable", Inter, system-ui, sans-serif`;

    const draw = (t: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = window.innerWidth;
      const ch = window.innerHeight;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);

      // ripple wipe
      const diag = Math.hypot(cw, ch) / 2 + 10;
      const a = easeInOut(p(t, 0, 0.9));
      const b = easeInOut(p(t, 0.45, 1.35));
      if (a > 0 && b < 1) {
        ctx.fillStyle = SECONDARY;
        ctx.beginPath();
        ctx.arc(cw / 2, ch / 2, diag * a, 0, 7);
        ctx.fill();
      }
      if (b > 0 && b < 1) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cw / 2, ch / 2, diag * b, 0, 7);
        ctx.fill();
      }

      // content in virtual units, scaled to fit the screen
      const land = cw / ch >= 1;
      const vw = land ? 1280 : 720;
      const vh = land ? 720 : 1280;
      const s = Math.min(cw / vw, ch / vh);
      const logoH = land ? 190 : 270;
      const nameSize = land ? 118 : 108;
      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.scale(s, s);

      ctx.font = font(nameSize, 800);
      const name = "Expirix";
      const track = -0.02 * nameSize;
      const xs: number[] = [];
      for (let i = 0; i < name.length; i++) xs.push(ctx.measureText(name.slice(0, i)).width + i * track);
      const nameW = ctx.measureText(name).width + (name.length - 1) * track;
      const gap = land ? 44 : 48;
      const capH = nameSize * 0.74;

      let logoX: number, logoY: number, nameX: number, base: number, k: number, halfH: number;
      if (land) {
        const total = logoH + gap + nameW;
        k = Math.min(1, (vw * 0.86) / total);
        logoX = -total / 2 + logoH / 2;
        logoY = -30;
        nameX = -total / 2 + logoH + gap;
        base = -30 + nameSize * 0.36;
        halfH = logoH / 2;
      } else {
        const totalH = logoH + gap + capH;
        k = Math.min(1, (vw * 0.86) / Math.max(logoH, nameW));
        logoX = 0;
        logoY = -totalH / 2 + logoH / 2 - 40;
        nameX = -nameW / 2;
        base = -totalH / 2 + logoH + gap + capH - 40;
        halfH = totalH / 2;
      }
      ctx.scale(k, k);

      // logo
      const lp = p(t, 0.7, 1.5);
      if (lp > 0 && logo) {
        const sc = 0.35 + 0.65 * easeBack(lp);
        const rot = (1 - easeOut(p(t, 0.7, 1.6))) * -0.35;
        ctx.save();
        ctx.globalAlpha = easeOut(p(t, 0.7, 1.1));
        ctx.translate(logoX, logoY);
        ctx.rotate(rot);
        ctx.scale(sc, sc);
        ctx.drawImage(logo, -logoH / 2, -logoH / 2, logoH, logoH);
        ctx.restore();
        const pr = p(t, 1.2, 2.1);
        if (pr > 0 && pr < 1) {
          ctx.save();
          ctx.globalAlpha = (1 - pr) * 0.8;
          ctx.strokeStyle = SECONDARY;
          ctx.lineWidth = 7 * (1 - pr);
          ctx.beginPath();
          ctx.arc(logoX, logoY, logoH * (0.5 + 0.8 * easeOut(pr)), 0, 7);
          ctx.stroke();
          ctx.restore();
        }
      }

      // name
      ctx.font = font(nameSize, 800);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#0f172a";
      ctx.save();
      ctx.beginPath();
      ctx.rect(nameX - 30, base - nameSize, nameW + 60, nameSize * 1.35);
      ctx.clip();
      for (let i = 0; i < name.length; i++) {
        const s0 = 1.45 + i * 0.055;
        const q = easeOut(p(t, s0, s0 + 0.55));
        if (q <= 0) continue;
        ctx.globalAlpha = q;
        ctx.fillText(name.charAt(i), nameX + xs[i], base + (1 - q) * nameSize * 0.9);
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      // rule
      const rp = easeInOut(p(t, 2.2, 2.9));
      if (rp > 0) {
        const rh = Math.max(4, nameSize * 0.05);
        ctx.fillStyle = SECONDARY;
        ctx.beginPath();
        ctx.roundRect(nameX, base + nameSize * 0.2, Math.max(rh, nameW * rp), rh, rh / 2);
        ctx.fill();
      }

      // tagline
      const tp = easeOut(p(t, 2.8, 3.5));
      if (tp > 0) {
        ctx.font = font(land ? 30 : 28, 500);
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(15,23,42,.62)";
        ctx.globalAlpha = tp;
        ctx.fillText(TAGLINE, 0, (land ? logoY + halfH + 92 : base + nameSize * 0.2 + 96) + (1 - tp) * 24);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };

    const start = performance.now();
    const loop = (now: number) => {
      if (done) return;
      const t = (now - start) / 1000;
      draw(Math.min(t, DURATION));
      if (t >= DURATION) finish();
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div id="intro" role="presentation">
      <canvas ref={cvRef} />
      <button type="button" className="intro-skip" onClick={() => (window as unknown as { __skipIntro?: () => void }).__skipIntro?.()}>
        Skip
      </button>
    </div>
  );
}
