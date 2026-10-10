/**
 * 首页字墙：由真实词汇（模型 ID、名称、研发方、接口类型）组成的等宽字墙。
 * - 精细指针：鼠标附近点亮为陶土色，离开后衰减；点击被点亮的词跳转。
 * - 触屏：减量、调暗，每 2.4s 缓慢轮换点亮几个词，点亮的词可点。
 * - 两层绘制：离屏静态层只在尺寸 / 主题 / 语言变化时重建；主层每帧只叠绘点亮的词。
 * - rAF 只在有变化时运行；页面隐藏、离开视口时暂停；减少动效时无过渡、无轮换。
 */
/** 字墙词条：文本与点击后跳转的站内地址 */
export interface FieldWord { t: string; href: string }

type Level = 0 | 1 | 2 | 3;

interface Placed {
  word: FieldWord;
  x: number;
  /** 行中线 y（textBaseline = middle） */
  y: number;
  w: number;
  level: Level;
  ember: boolean;
  /** 静区 / 底部渐隐系数，0–1 */
  zone: number;
  lit: number;
  target: number;
  /** 触屏轮换开始时间（ms），未轮换为 -1 */
  pulse: number;
}

const BASE_ALPHA: Record<'dark' | 'light', readonly number[]> = {
  dark: [0.045, 0.07, 0.11, 0.17],
  light: [0.06, 0.09, 0.13, 0.19],
};
/** 明暗分级累计概率：55% / 28% / 12% / 5% */
const LEVEL_CDF = [0.55, 0.83, 0.95, 1];
const RADIUS = 160;
const TAU_UP = 120;
const TAU_DOWN = 450;
const QUIET_PAD = 48;
const QUIET_FEATHER = 48;
const BOTTOM_FADE = 56;
const CLICK_SLOP = 6;
const PULSE_EVERY = 2400;
const PULSE_UP = 600;
const PULSE_DOWN = 1800;
const PULSE_PEAK = 0.8;
const PULSE_BATCH = 3;
const PULSE_MAX = 6;
const RESIZE_DEBOUNCE = 150;
const FONT_TIMEOUT = 2500;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/** 由下标得到稳定的伪随机数，保证 resize 前后同一位置的明暗不跳变。 */
function hash01(n: number, seed: number): number {
  let t = (n + seed) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function readWords(): FieldWord[] {
  const el = document.getElementById('wordfield-data');
  if (!el?.textContent) return [];
  try {
    const raw: unknown = JSON.parse(el.textContent);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (w): w is FieldWord =>
        !!w &&
        typeof w.t === 'string' &&
        w.t.length > 0 &&
        typeof w.href === 'string',
    );
  } catch {
    return [];
  }
}

function parseTriplet(value: string, fallback: string): string {
  const v = value.trim();
  return /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(v) ? v : fallback;
}

export function initWordField(canvas: HTMLCanvasElement): () => void {
  const source = readWords();
  const ctx = canvas.getContext('2d');
  if (!source.length || !ctx) return () => {};

  const words = shuffle(source);
  const seed = Math.floor(Math.random() * 1e9);
  const root = document.documentElement;
  const hero = canvas.closest<HTMLElement>('[data-wordfield-host]') ?? canvas.parentElement!;
  const quietEl = hero.querySelector<HTMLElement>('[data-wordfield-quiet]');

  const mqCoarse = matchMedia('(pointer: coarse)');
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');

  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d')!;
  const widthCache = new Map<string, number>();

  let placed: Placed[] = [];
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  let lineH = 22;
  let coarse = mqCoarse.matches;
  let reduced = mqReduce.matches;
  let font = '';
  let inkRGB = '250, 249, 245';
  let emberRGB = '217, 119, 87';
  let scheme: 'dark' | 'light' = 'dark';
  let quiet: { l: number; t: number; r: number; b: number } | null = null;

  let ready = false;
  let inView = true;
  let raf = 0;
  let last = 0;
  let pointer: { cx: number; cy: number } | null = null;
  let overCanvas = false;
  let down: { x: number; y: number; id: number } | null = null;
  let pulseTimer = 0;
  let resizeTimer = 0;
  let destroyed = false;

  /* ---------- 样式与度量 ---------- */

  function readStyle() {
    const cs = getComputedStyle(root);
    scheme = root.dataset.scheme === 'light' ? 'light' : 'dark';
    inkRGB = parseTriplet(cs.getPropertyValue('--field-ink'), scheme === 'light' ? '20, 20, 19' : '250, 249, 245');
    emberRGB = parseTriplet(cs.getPropertyValue('--field-ember'), scheme === 'light' ? '193, 95, 60' : '217, 119, 87');
    const family = cs.getPropertyValue('--font-mono').trim() || '"Geist Mono Variable", ui-monospace, monospace';
    const size = coarse ? 11 : 12;
    const nextFont = `400 ${size}px ${family}`;
    if (nextFont !== font) widthCache.clear();
    font = nextFont;
    lineH = coarse ? 24 : 22;
  }

  function measure(text: string): number {
    let w = widthCache.get(text);
    if (w === undefined) {
      w = lctx.measureText(text).width;
      widthCache.set(text, w);
    }
    return w;
  }

  function readQuiet() {
    if (!quietEl) {
      quiet = null;
      return;
    }
    const c = canvas.getBoundingClientRect();
    const q = quietEl.getBoundingClientRect();
    quiet = {
      l: q.left - c.left - QUIET_PAD,
      t: q.top - c.top - QUIET_PAD,
      r: q.right - c.left + QUIET_PAD,
      b: q.bottom - c.top + QUIET_PAD,
    };
  }

  /** 静区内 ×0.5，向外 48px 羽化回到 1；hero 底部 56px 渐隐，让字墙落在分区虚线上。 */
  function zoneOf(cx: number, cy: number): number {
    let z = 1;
    if (quiet) {
      const dx = Math.max(quiet.l - cx, 0, cx - quiet.r);
      const dy = Math.max(quiet.t - cy, 0, cy - quiet.b);
      const d = Math.hypot(dx, dy);
      z = 0.5 + 0.5 * smoothstep(d / QUIET_FEATHER);
    }
    const fromBottom = cssH - cy;
    if (fromBottom < BOTTOM_FADE) z *= smoothstep(fromBottom / BOTTOM_FADE);
    return z;
  }

  /* ---------- 布局 ---------- */

  function layout() {
    const prevLit = new Map<string, number>();
    for (const p of placed) if (p.lit > 0.02) prevLit.set(`${p.x}|${p.y}`, p.lit);

    lctx.font = font;
    const gap = measure(' ') * (coarse ? 3.5 : 3);
    const rows = Math.ceil(cssH / lineH);
    const next: Placed[] = [];
    let i = 0;
    let n = 0;
    for (let r = 0; r < rows; r++) {
      if (coarse && r % 2 === 1) continue;
      const y = r * lineH + lineH / 2;
      // 每行起点错开，形成满版的字墙而不是左对齐的列表
      let x = -Math.round(hash01(r * 7919, seed) * 64);
      while (x < cssW) {
        const word = words[i % words.length];
        i++;
        const w = measure(word.t);
        if (x + w > 0) {
          const roll = hash01(n * 2654435761, seed);
          let level: Level = 0;
          while (roll > LEVEL_CDF[level]) level = (level + 1) as Level;
          const ember = hash01(n * 40503 + 17, seed) < (coarse ? 0.012 : 0.015);
          next.push({
            word, x, y, w, level, ember,
            zone: zoneOf(x + w / 2, y),
            lit: prevLit.get(`${x}|${y}`) ?? 0,
            target: 0,
            pulse: -1,
          });
          n++;
        }
        x += w + gap;
      }
    }
    placed = next;
  }

  function rezone() {
    for (const p of placed) p.zone = zoneOf(p.x + p.w / 2, p.y);
  }

  /* ---------- 绘制 ---------- */

  function paintStatic() {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.font = font;
    lctx.textBaseline = 'middle';
    const base = BASE_ALPHA[scheme];
    const dim = coarse ? 0.7 : 1;
    for (const p of placed) {
      if (p.zone <= 0.001) continue;
      lctx.fillStyle = p.ember
        ? `rgba(${emberRGB}, ${(0.35 * p.zone).toFixed(3)})`
        : `rgba(${inkRGB}, ${(base[p.level] * dim * p.zone).toFixed(3)})`;
      lctx.fillText(p.word.t, p.x, p.y);
    }
  }

  function paint() {
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    ctx!.drawImage(layer, 0, 0);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.font = font;
    ctx!.textBaseline = 'middle';
    for (const p of placed) {
      if (p.lit <= 0.02) continue;
      // 静区里的点亮词再压一档，保证标题与搜索框始终是最亮的东西
      const zoneLit = 0.55 + 0.45 * clamp01((p.zone - 0.5) / 0.5);
      ctx!.fillStyle = `rgba(${emberRGB}, ${(p.lit * 0.95 * zoneLit).toFixed(3)})`;
      ctx!.fillText(p.word.t, p.x, p.y);
    }
  }

  /* ---------- 帧循环 ---------- */

  function pointerLocal(): { x: number; y: number } | null {
    if (!pointer) return null;
    const c = canvas.getBoundingClientRect();
    const x = pointer.cx - c.left;
    const y = pointer.cy - c.top;
    if (x < -RADIUS || y < -RADIUS || x > cssW + RADIUS || y > cssH + RADIUS) return null;
    return { x, y };
  }

  function pulseValue(t: number): number {
    if (t < 0) return 0;
    if (t < PULSE_UP) return PULSE_PEAK * smoothstep(t / PULSE_UP);
    if (t < PULSE_UP + PULSE_DOWN) return PULSE_PEAK * (1 - smoothstep((t - PULSE_UP) / PULSE_DOWN));
    return 0;
  }

  function step(now: number): boolean {
    const dt = Math.min(64, Math.max(0, now - last || 16));
    last = now;
    let busy = false;

    if (coarse) {
      for (const p of placed) {
        if (p.pulse < 0) continue;
        const t = now - p.pulse;
        if (t >= PULSE_UP + PULSE_DOWN) {
          p.pulse = -1;
          p.lit = 0;
        } else {
          p.lit = pulseValue(t);
          busy = true;
        }
      }
      return busy;
    }

    const pt = pointerLocal();
    const kUp = 1 - Math.exp(-dt / TAU_UP);
    const kDown = 1 - Math.exp(-dt / TAU_DOWN);
    for (const p of placed) {
      let target = 0;
      if (pt) {
        const dx = pt.x - (p.x + p.w / 2);
        const dy = pt.y - p.y;
        if (Math.abs(dx) < RADIUS + p.w / 2 && Math.abs(dy) < RADIUS) {
          target = smoothstep(1 - Math.hypot(dx, dy) / RADIUS);
        }
      }
      p.target = target;
      if (p.lit === target) continue;
      if (reduced) {
        p.lit = target;
        continue;
      }
      p.lit += (target - p.lit) * (target > p.lit ? kUp : kDown);
      if (Math.abs(target - p.lit) < 0.004) p.lit = target;
      else busy = true;
    }

    if (overCanvas && pt) canvas.style.cursor = hit(pt.x, pt.y) ? 'pointer' : '';
    return busy;
  }

  function frame(now: number) {
    raf = 0;
    if (!ready || !inView || document.hidden) return;
    const busy = step(now);
    paint();
    if (busy) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (raf || !ready || !inView || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function halt() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ---------- 触屏轮换 ---------- */

  function pulseTick() {
    pulseTimer = 0;
    if (!ready || !coarse || reduced || !inView || document.hidden) return;
    const now = performance.now();
    const active = placed.filter((p) => p.pulse >= 0).length;
    const room = Math.min(PULSE_BATCH, PULSE_MAX - active);
    if (room > 0) {
      // 只挑完整可见、且不在标题与搜索框背后的词
      const pool = placed.filter((p) => p.pulse < 0 && p.zone > 0.95 && p.x >= 4 && p.x + p.w <= cssW - 4);
      for (let k = 0; k < room && pool.length; k++) {
        const idx = Math.floor(Math.random() * pool.length);
        pool[idx].pulse = now;
        pool.splice(idx, 1);
      }
      kick();
    }
    pulseTimer = window.setTimeout(pulseTick, PULSE_EVERY);
  }

  function startPulses() {
    if (pulseTimer || !coarse || reduced) return;
    pulseTimer = window.setTimeout(pulseTick, 600);
  }

  function stopPulses() {
    if (pulseTimer) clearTimeout(pulseTimer);
    pulseTimer = 0;
  }

  /* ---------- 命中与跳转 ---------- */

  function hit(x: number, y: number): Placed | null {
    const half = lineH / 2;
    for (const p of placed) {
      if (p.lit < 0.5) continue;
      if (x >= p.x - 2 && x <= p.x + p.w + 2 && y >= p.y - half && y <= p.y + half) return p;
    }
    return null;
  }

  function open(word: FieldWord) {
    location.href = word.href;
  }

  /* ---------- 尺寸 ---------- */

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, Math.round(rect.width));
    cssH = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    layer.width = pw;
    layer.height = ph;
    readStyle();
    readQuiet();
    layout();
    paintStatic();
    paint();
    kick();
  }

  function restyle() {
    readStyle();
    paintStatic();
    paint();
  }

  /* ---------- 事件 ---------- */

  const onPointerMove = (e: PointerEvent) => {
    if (coarse || e.pointerType === 'touch') return;
    pointer = { cx: e.clientX, cy: e.clientY };
    overCanvas = e.target === canvas;
    if (!overCanvas && canvas.style.cursor) canvas.style.cursor = '';
    kick();
  };
  const onPointerOut = (e: PointerEvent) => {
    if (e.relatedTarget) return; // 仍在页面内
    pointer = null;
    overCanvas = false;
    kick();
  };
  const onScroll = () => {
    if (pointer) kick();
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const c = canvas.getBoundingClientRect();
    down = { x: e.clientX - c.left, y: e.clientY - c.top, id: e.pointerId };
  };
  const onUp = (e: PointerEvent) => {
    if (!down || down.id !== e.pointerId) return;
    const c = canvas.getBoundingClientRect();
    const x = e.clientX - c.left;
    const y = e.clientY - c.top;
    const moved = Math.hypot(x - down.x, y - down.y);
    down = null;
    if (moved >= CLICK_SLOP) return;
    const target = hit(x, y);
    if (target) open(target.word);
  };
  const onCancel = () => {
    down = null;
  };
  const onVisibility = () => {
    if (document.hidden) {
      halt();
      stopPulses();
    } else {
      kick();
      startPulses();
    }
  };
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (ready) resize();
    }, RESIZE_DEBOUNCE);
  };
  const onModeChange = () => {
    coarse = mqCoarse.matches;
    reduced = mqReduce.matches;
    pointer = null;
    for (const p of placed) {
      p.pulse = -1;
      p.lit = 0;
    }
    stopPulses();
    if (ready) resize();
    startPulses();
  };
  const onLang = () => {
    // 标题换语言后尺寸变化：静区需要重算
    requestAnimationFrame(() => {
      if (!ready) return;
      readQuiet();
      rezone();
      paintStatic();
      paint();
    });
  };

  const io = new IntersectionObserver((entries) => {
    inView = entries.some((en) => en.isIntersecting);
    if (inView) {
      kick();
      startPulses();
    } else {
      halt();
      stopPulses();
    }
  });
  const ro = new ResizeObserver(onResize);
  const quietRo = quietEl ? new ResizeObserver(onLang) : null;
  const mo = new MutationObserver(() => {
    if (ready) restyle();
  });

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerout', onPointerOut, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  document.addEventListener('visibilitychange', onVisibility);
  mqCoarse.addEventListener('change', onModeChange);
  mqReduce.addEventListener('change', onModeChange);
  mo.observe(root, { attributes: true, attributeFilter: ['data-scheme'] });

  /* ---------- 启动：字体就绪后首绘，避免回退字体闪烁 ---------- */

  readStyle();
  const family = font.replace(/^400 \d+px /, '');
  const fontReady = document.fonts
    ? Promise.race([
        document.fonts.load(`12px ${family}`).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT)),
      ])
    : Promise.resolve();

  fontReady.then(() => {
    if (destroyed) return;
    ready = true;
    resize();
    io.observe(canvas);
    ro.observe(canvas);
    quietRo?.observe(quietEl!);
    canvas.dataset.ready = '';
    startPulses();
  });

  return () => {
    destroyed = true;
    halt();
    stopPulses();
    clearTimeout(resizeTimer);
    io.disconnect();
    ro.disconnect();
    quietRo?.disconnect();
    mo.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerout', onPointerOut);
    window.removeEventListener('scroll', onScroll);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('visibilitychange', onVisibility);
    mqCoarse.removeEventListener('change', onModeChange);
    mqReduce.removeEventListener('change', onModeChange);
  };
}
