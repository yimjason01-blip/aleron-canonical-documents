// Hand-drawn iPhone frame ink (Antique Gold) — Meridian landing.
// Draws a perfect-freehand pressure-line outline + buttons over each .phone-frame on the page.
import { getStroke } from 'https://cdn.jsdelivr.net/npm/perfect-freehand@1.2.3/dist/esm/index.mjs';

const NS = 'http://www.w3.org/2000/svg';
const INK            = '#8a5e2c';
const INNER_LINE     = 'rgba(255,255,255,0.18)';
const ISLAND_LINE    = 'rgba(255,255,255,0.55)';
const INDICATOR_LINE = 'rgba(255,255,255,0.6)';

function getSvgPathFromStroke(points) {
  if (!points.length) return '';
  const d = points.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', points[0][0], points[0][1], 'Q']
  );
  d.push('Z');
  return d.join(' ');
}

function simulatePath(polyline, opts = {}) {
  const { samples = 5, basePressure = 0.7, startTaper = 0.12, endTaper = 0.12, jitter = 0.025, seed = 1 } = opts;
  let s = seed;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const raw = [];
  for (let i = 0; i < polyline.length - 1; i++) {
    const [x1, y1] = polyline[i], [x2, y2] = polyline[i + 1];
    for (let j = 0; j < samples; j++) {
      const t = j / samples;
      raw.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
    }
  }
  raw.push(polyline[polyline.length - 1]);
  const n = raw.length;
  return raw.map(([x, y], i) => {
    const t = i / (n - 1);
    let p = basePressure;
    if (t < startTaper) p *= (t / startTaper);
    else if (t > 1 - endTaper) p *= ((1 - t) / endTaper);
    p *= 1 + (rand() - 0.5) * 2 * jitter;
    p = Math.max(0.05, Math.min(0.98, p));
    return [x + (rand() - 0.5) * 0.5, y + (rand() - 0.5) * 0.5, p];
  });
}

function drawStroke(svg, polyline, strokeOpts, simOpts) {
  const points = simulatePath(polyline, simOpts);
  const stroke = getStroke(points, {
    size: strokeOpts.size,
    thinning: strokeOpts.thinning ?? 0.55,
    smoothing: strokeOpts.smoothing ?? 0.72,
    streamline: strokeOpts.streamline ?? 0.6,
    simulatePressure: false,
    last: true,
  });
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', getSvgPathFromStroke(stroke));
  path.setAttribute('fill', strokeOpts.fill);
  svg.appendChild(path);
}

function roundRectSides(x1, y1, x2, y2, r, arcSamples = 14) {
  const sides = [[], [], [], []];
  function arc(pts, cx, cy, a1, a2) {
    for (let i = 0; i <= arcSamples; i++) {
      const t = i / arcSamples;
      const a = a1 + (a2 - a1) * t;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  arc(sides[0], x1 + r, y1 + r, Math.PI * 1.25, Math.PI * 1.5);
  sides[0].push([x2 - r, y1]);
  arc(sides[0], x2 - r, y1 + r, Math.PI * 1.5, Math.PI * 1.75);
  arc(sides[1], x2 - r, y1 + r, Math.PI * 1.75, Math.PI * 2);
  sides[1].push([x2, y2 - r]);
  arc(sides[1], x2 - r, y2 - r, 0, Math.PI / 4);
  arc(sides[2], x2 - r, y2 - r, Math.PI / 4, Math.PI / 2);
  sides[2].push([x1 + r, y2]);
  arc(sides[2], x1 + r, y2 - r, Math.PI / 2, Math.PI * 0.75);
  arc(sides[3], x1 + r, y2 - r, Math.PI * 0.75, Math.PI);
  sides[3].push([x1, y1 + r]);
  arc(sides[3], x1 + r, y1 + r, Math.PI, Math.PI * 1.25);
  return sides;
}

// Render the ink layer for a single .phone-frame element. The SVG is sized to
// match the frame's rendered pixel dimensions, plus a 28px overhang each side
// (so corner overshoots and side buttons can sit just outside the screen).
function renderInkFor(frame) {
  // wait for layout
  const rect = frame.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  // remove any prior ink layer (in case of re-render on resize)
  frame.querySelectorAll('svg.phone-ink').forEach(el => el.remove());

  const W = rect.width;
  const H = rect.height;
  const PAD = 28;
  const VW = W + PAD * 2;
  const VH = H + PAD * 2;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'phone-ink');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('aria-hidden', 'true');

  // Phone body in the SVG coord system: inset PAD from each edge.
  const X1 = PAD, Y1 = PAD, X2 = PAD + W, Y2 = PAD + H;
  // corner radius — tune to phone width
  const R = Math.min(W, H) * 0.16;

  // primary outline
  const sides = roundRectSides(X1, Y1, X2, Y2, R);
  sides.forEach((poly, i) => {
    drawStroke(svg, poly, {
      size: Math.max(3.6, W * 0.0145),
      thinning: 0.55,
      smoothing: 0.78,
      streamline: 0.65,
      fill: INK,
    }, { samples: 5, basePressure: 0.78, startTaper: 0.12, endTaper: 0.12, jitter: 0.025, seed: 11 + i * 7 });
  });

  // inner glass line
  const innerInset = Math.max(5, W * 0.022);
  const inner = roundRectSides(X1 + innerInset, Y1 + innerInset + 1, X2 - innerInset, Y2 - innerInset - 1, Math.max(R - 6, 22));
  inner.forEach((poly, i) => {
    drawStroke(svg, poly, {
      size: Math.max(1.0, W * 0.0048),
      thinning: 0.5,
      smoothing: 0.7,
      streamline: 0.5,
      fill: INNER_LINE,
    }, { samples: 4, basePressure: 0.6, startTaper: 0.14, endTaper: 0.14, jitter: 0.02, seed: 31 + i * 7 });
  });

  // dynamic island (centered horizontally, near top)
  const islandW = W * 0.255;
  const islandCx = X1 + W / 2;
  const islandCy = Y1 + Math.max(22, H * 0.026);
  const islandH = Math.max(20, H * 0.024);
  const r = islandH / 2;
  const ix1 = islandCx - islandW / 2, ix2 = islandCx + islandW / 2;
  const iy = islandCy;
  drawStroke(svg, [
    [ix1 + r, iy - r], [ix2 - r, iy - r],
    [ix2,       iy   ],
    [ix2 - r, iy + r], [ix1 + r, iy + r],
    [ix1,       iy   ],
    [ix1 + r, iy - r],
  ], {
    size: Math.max(1.3, W * 0.0058),
    thinning: 0.55, smoothing: 0.7, streamline: 0.55,
    fill: ISLAND_LINE,
  }, { samples: 5, basePressure: 0.7, startTaper: 0.12, endTaper: 0.12, jitter: 0.02, seed: 47 });

  // hardware buttons
  const btn = (cx, y1, y2, seed, sizeMul = 1) => drawStroke(svg, [[cx, y1], [cx, y2]], {
    size: Math.max(3.4, W * 0.0140) * sizeMul,
    thinning: 0.4, smoothing: 0.75, streamline: 0.6,
    fill: INK,
  }, { samples: 6, basePressure: 0.82, startTaper: 0.18, endTaper: 0.18, jitter: 0.03, seed });

  const leftX = X1 - 1.5;
  const rightX = X2 + 1.5;
  // proportions match real iPhone rail layout
  btn(leftX,  Y1 + H * 0.195, Y1 + H * 0.220, 51, 0.86);   // action
  btn(leftX,  Y1 + H * 0.270, Y1 + H * 0.336, 53, 1.04);   // volume up
  btn(leftX,  Y1 + H * 0.355, Y1 + H * 0.421, 55, 1.04);   // volume down
  btn(rightX, Y1 + H * 0.318, Y1 + H * 0.428, 57, 1.08);   // power

  // home indicator inside the screen
  const hiW = W * 0.27;
  const hiY = Y1 + H * 0.952;
  const hiX = X1 + (W - hiW) / 2;
  drawStroke(svg, [[hiX, hiY], [hiX + hiW, hiY]], {
    size: Math.max(1.6, W * 0.0072),
    thinning: 0.5, smoothing: 0.7, streamline: 0.55,
    fill: INDICATOR_LINE,
  }, { samples: 4, basePressure: 0.7, startTaper: 0.20, endTaper: 0.20, jitter: 0.02, seed: 95 });

  frame.appendChild(svg);
}

function renderAll() {
  document.querySelectorAll('.phone-frame').forEach(renderInkFor);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderAll);
} else {
  renderAll();
}

let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(renderAll, 120);
});
