<script lang="ts">
  import { onMount } from 'svelte';
  import {
    config,
    layout,
    layoutStale,
    selectedKeepOut,
    addKeepOut,
    updateKeepOut,
  } from '../lib/stores';
  import { panelColor } from '../lib/colors';
  import { snap } from '../lib/geometry';
  import type { Rect } from '../lib/types';

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let cw = $state(800);
  let ch = $state(600);
  let cursor = $state('crosshair');

  // Interaction state.
  type Mode = 'idle' | 'draw' | 'move' | 'resize';
  type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
  let mode: Mode = $state('idle');
  let dragStart: { x: number; y: number } | null = null;
  let dragRect: Rect | null = $state(null);
  let moveId: string | null = null;
  let moveOffset = { x: 0, y: 0 };
  let resizeId: string | null = null;
  let resizeHandle: Handle | null = null;

  const HANDLE_TOL = 7; // px proximity to a keep-out edge to grab a resize handle
  const MIN_KO = 2; // minimum keep-out size, cm
  const GUIDE = '#ffd23f'; // contrasting color for drag/resize extent guides
  // Pointer position: px/py are canvas pixels, cx/cy are roof centimeters.
  let pointer: { px: number; py: number; cx: number; cy: number } | null = $state(null);

  const RULER = 30; // gutter thickness for the rulers, px
  const PAD = 18; // padding between rulers and roof

  function view() {
    const roof = $config.roof;
    const availW = cw - RULER - PAD * 2;
    const availH = ch - RULER - PAD * 2;
    const scale = Math.min(availW / roof.width, availH / roof.height) || 1;
    const offX = RULER + PAD + Math.max(0, (availW - roof.width * scale) / 2);
    const offY = RULER + PAD + Math.max(0, (availH - roof.height * scale) / 2);
    return { scale, offX, offY };
  }

  const toPxX = (x: number, v = view()) => v.offX + x * v.scale;
  const toPxY = (y: number, v = view()) => v.offY + y * v.scale;

  /** Raw centimeter coordinates under the pointer (unclamped). */
  function cmAt(clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    const v = view();
    return { x: (clientX - r.left - v.offX) / v.scale, y: (clientY - r.top - v.offY) / v.scale };
  }

  const clampNum = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

  /** The active snap step in cm (0 = off → whole-cm rounding). */
  const step = () => $config.gridSnap;

  function clampedCm(clientX: number, clientY: number) {
    const c = cmAt(clientX, clientY);
    return {
      x: snap(clampNum(c.x, 0, $config.roof.width), step()),
      y: snap(clampNum(c.y, 0, $config.roof.height), step()),
    };
  }

  /** Top-most keep-out id at the given cm point, or null. */
  function keepOutAtCm(x: number, y: number): string | null {
    const kos = $config.keepOuts;
    for (let i = kos.length - 1; i >= 0; i--) {
      const k = kos[i];
      if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) return k.id;
    }
    return null;
  }

  /**
   * Resize handle under the pointer, if any. Works in pixel space with a small
   * tolerance, testing keep-outs top-most first (the selected one wins ties) so the
   * affordance matches what's drawn on top.
   */
  function handleAt(px: number, py: number): { id: string; handle: Handle } | null {
    const v = view();
    const kos = $config.keepOuts;
    const order = [...kos].sort((a, b) => {
      if (a.id === $selectedKeepOut) return 1; // selected last → tested first
      if (b.id === $selectedKeepOut) return -1;
      return 0;
    });
    for (let i = order.length - 1; i >= 0; i--) {
      const k = order[i];
      const x1 = toPxX(k.x, v);
      const y1 = toPxY(k.y, v);
      const x2 = toPxX(k.x + k.w, v);
      const y2 = toPxY(k.y + k.h, v);
      // Only consider the pointer if it's within the rect's band (plus tolerance).
      if (px < x1 - HANDLE_TOL || px > x2 + HANDLE_TOL) continue;
      if (py < y1 - HANDLE_TOL || py > y2 + HANDLE_TOL) continue;
      const nearL = Math.abs(px - x1) <= HANDLE_TOL;
      const nearR = Math.abs(px - x2) <= HANDLE_TOL;
      const nearT = Math.abs(py - y1) <= HANDLE_TOL;
      const nearB = Math.abs(py - y2) <= HANDLE_TOL;
      const v_ = nearT ? 'n' : nearB ? 's' : '';
      const h_ = nearL ? 'w' : nearR ? 'e' : '';
      const handle = (v_ + h_) as Handle;
      if (handle) return { id: k.id, handle };
    }
    return null;
  }

  const HANDLE_CURSOR: Record<Handle, string> = {
    nw: 'nwse-resize',
    se: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
  };

  function colorForOption(optionId: string): string {
    const idx = $config.panelOptions.findIndex((o) => o.id === optionId);
    return panelColor(idx < 0 ? 0 : idx);
  }

  function nameForOption(optionId: string): string {
    return $config.panelOptions.find((o) => o.id === optionId)?.name ?? '';
  }

  /** Pick a "nice" tick spacing (cm) so labels stay ~48px apart. */
  function niceStep(scale: number): number {
    const minCm = 48 / scale;
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    return steps.find((s) => s >= minCm) ?? steps[steps.length - 1];
  }

  function drawRulers(ctx: CanvasRenderingContext2D, v: ReturnType<typeof view>) {
    const roof = $config.roof;
    const step = niceStep(v.scale);
    const minor = step / (step % 5 === 0 ? 5 : 2);

    ctx.fillStyle = '#161d26';
    ctx.fillRect(0, 0, cw, RULER); // top ruler
    ctx.fillRect(0, 0, RULER, ch); // left ruler
    ctx.strokeStyle = '#2d3a48';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER + 0.5);
    ctx.lineTo(cw, RULER + 0.5);
    ctx.moveTo(RULER + 0.5, 0);
    ctx.lineTo(RULER + 0.5, ch);
    ctx.stroke();

    ctx.fillStyle = '#8b98a5';
    ctx.strokeStyle = '#4a5a6b';
    ctx.font = '9px system-ui, sans-serif';

    // Top ruler (horizontal scale).
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let cm = 0; cm <= roof.width + 0.001; cm += minor) {
      const px = toPxX(cm, v);
      if (px < RULER || px > cw) continue;
      const major = Math.abs(cm % step) < 0.001 || Math.abs((cm % step) - step) < 0.001;
      ctx.beginPath();
      ctx.moveTo(px + 0.5, RULER - (major ? 9 : 5));
      ctx.lineTo(px + 0.5, RULER);
      ctx.stroke();
      if (major) ctx.fillText(String(Math.round(cm)), px, 3);
    }

    // Left ruler (vertical scale).
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let cm = 0; cm <= roof.height + 0.001; cm += minor) {
      const py = toPxY(cm, v);
      if (py < RULER || py > ch) continue;
      const major = Math.abs(cm % step) < 0.001 || Math.abs((cm % step) - step) < 0.001;
      ctx.beginPath();
      ctx.moveTo(RULER - (major ? 9 : 5), py + 0.5);
      ctx.lineTo(RULER, py + 0.5);
      ctx.stroke();
      if (major) ctx.fillText(String(Math.round(cm)), RULER / 2, py);
    }

    // Corner unit label.
    ctx.fillStyle = '#161d26';
    ctx.fillRect(0, 0, RULER, RULER);
    ctx.fillStyle = '#5b6776';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('cm', RULER / 2, RULER / 2);
  }

  function drawCrosshair(ctx: CanvasRenderingContext2D, v: ReturnType<typeof view>) {
    if (!pointer) return;
    const roof = $config.roof;
    if (pointer.cx < 0 || pointer.cx > roof.width || pointer.cy < 0 || pointer.cy > roof.height)
      return;

    const x = toPxX(pointer.cx, v);
    const y = toPxY(pointer.cy, v);
    const bottom = toPxY(roof.height, v);
    const right = toPxX(roof.width, v);

    ctx.strokeStyle = 'rgba(74, 158, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, RULER);
    ctx.lineTo(x + 0.5, bottom);
    ctx.moveTo(RULER, y + 0.5);
    ctx.lineTo(right, y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    // Position markers on the rulers.
    ctx.fillStyle = '#4a9eff';
    ctx.beginPath();
    ctx.moveTo(x, RULER);
    ctx.lineTo(x - 4, RULER - 6);
    ctx.lineTo(x + 4, RULER - 6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(RULER, y);
    ctx.lineTo(RULER - 6, y - 4);
    ctx.lineTo(RULER - 6, y + 4);
    ctx.closePath();
    ctx.fill();

    // Floating readout near the cursor.
    const label = `${Math.round(pointer.cx)}, ${Math.round(pointer.cy)} cm`;
    ctx.font = '600 11px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    let bx = x + 10;
    let by = y + 10;
    if (bx + tw + 12 > cw) bx = x - tw - 22;
    if (by + 22 > ch) by = y - 28;
    ctx.fillStyle = 'rgba(13, 17, 23, 0.9)';
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, tw + 12, 20, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e6edf3';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 6, by + 10);
  }

  type EdgeX = { cm: number; side: 'left' | 'right' };
  type EdgeY = { cm: number; side: 'top' | 'bottom' };

  /** The rect being interacted with and which edges are changing, or null. */
  function activeExtents(): { rect: Rect; xs: EdgeX[]; ys: EdgeY[] } | null {
    const all = (r: Rect) => ({
      rect: r,
      xs: [
        { cm: r.x, side: 'left' as const },
        { cm: r.x + r.w, side: 'right' as const },
      ],
      ys: [
        { cm: r.y, side: 'top' as const },
        { cm: r.y + r.h, side: 'bottom' as const },
      ],
    });
    if (mode === 'draw' && dragRect) return all(dragRect);
    if (mode === 'move' && moveId) {
      const k = $config.keepOuts.find((o) => o.id === moveId);
      if (k) return all(k);
    }
    if (mode === 'resize' && resizeId && resizeHandle) {
      const k = $config.keepOuts.find((o) => o.id === resizeId);
      if (k) {
        const xs: EdgeX[] = [];
        const ys: EdgeY[] = [];
        if (resizeHandle.includes('w')) xs.push({ cm: k.x, side: 'left' });
        if (resizeHandle.includes('e')) xs.push({ cm: k.x + k.w, side: 'right' });
        if (resizeHandle.includes('n')) ys.push({ cm: k.y, side: 'top' });
        if (resizeHandle.includes('s')) ys.push({ cm: k.y + k.h, side: 'bottom' });
        return { rect: k, xs, ys };
      }
    }
    return null;
  }

  /** A small golden chip centered at (cx, cy); dimmer fill marks a distance reading. */
  function guideChip(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    cy: number,
    kind: 'pos' | 'dist' = 'pos',
  ) {
    ctx.font = '600 11px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 10;
    const h = 18;
    const px = cx - w / 2;
    const py = cy - h / 2;
    ctx.fillStyle = kind === 'pos' ? 'rgba(13, 17, 23, 0.92)' : 'rgba(255, 210, 63, 0.16)';
    ctx.strokeStyle = GUIDE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(px, py, w, h, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GUIDE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
  }

  /** Draw extent guide lines, edge-position chips on the rulers, and roof-clearance chips. */
  function drawExtents(ctx: CanvasRenderingContext2D, v: ReturnType<typeof view>) {
    const ext = activeExtents();
    if (!ext) return;
    const roof = $config.roof;
    const bottom = toPxY(roof.height, v);
    const right = toPxX(roof.width, v);
    const midY = toPxY(ext.rect.y + ext.rect.h / 2, v); // keep-out center, for x-edge gaps
    const midX = toPxX(ext.rect.x + ext.rect.w / 2, v); // keep-out center, for y-edge gaps

    ctx.strokeStyle = GUIDE;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    for (const e of ext.xs) {
      const x = toPxX(e.cm, v) + 0.5;
      ctx.moveTo(x, RULER);
      ctx.lineTo(x, bottom);
    }
    for (const e of ext.ys) {
      const y = toPxY(e.cm, v) + 0.5;
      ctx.moveTo(RULER, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Position chips centered on the gutter rulers; distance chips in the gap to the roof edge.
    for (const e of ext.xs) {
      guideChip(ctx, String(Math.round(e.cm)), toPxX(e.cm, v), RULER / 2);
      const dist = e.side === 'left' ? e.cm : roof.width - e.cm;
      const gapMid = e.side === 'left' ? e.cm / 2 : (e.cm + roof.width) / 2;
      guideChip(ctx, `↔ ${Math.round(dist)}`, toPxX(gapMid, v), midY, 'dist');
    }
    for (const e of ext.ys) {
      guideChip(ctx, String(Math.round(e.cm)), RULER / 2, toPxY(e.cm, v));
      const dist = e.side === 'top' ? e.cm : roof.height - e.cm;
      const gapMid = e.side === 'top' ? e.cm / 2 : (e.cm + roof.height) / 2;
      guideChip(ctx, `↕ ${Math.round(dist)}`, midX, toPxY(gapMid, v), 'dist');
    }
  }

  function draw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const roof = $config.roof;
    const v = view();
    if (roof.width <= 0 || roof.height <= 0) {
      drawRulers(ctx, v);
      return;
    }

    // Roof body.
    ctx.fillStyle = '#11161d';
    ctx.strokeStyle = '#3d4d5e';
    ctx.lineWidth = 2;
    const rw = roof.width * v.scale;
    const rh = roof.height * v.scale;
    ctx.fillRect(v.offX, v.offY, rw, rh);
    ctx.strokeRect(v.offX, v.offY, rw, rh);

    // Edge-margin outline.
    if ($config.edgeMargin > 0) {
      ctx.strokeStyle = 'rgba(245, 166, 35, 0.35)';
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1;
      ctx.strokeRect(
        toPxX($config.edgeMargin, v),
        toPxY($config.edgeMargin, v),
        Math.max(0, roof.width - 2 * $config.edgeMargin) * v.scale,
        Math.max(0, roof.height - 2 * $config.edgeMargin) * v.scale,
      );
      ctx.setLineDash([]);
    }

    // Grid overlay (only for coarse snaps, so the mesh stays readable).
    if ($config.gridSnap === 5 || $config.gridSnap === 10) {
      ctx.strokeStyle = 'rgba(123, 138, 153, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let cm = $config.gridSnap; cm < roof.width; cm += $config.gridSnap) {
        const x = Math.round(toPxX(cm, v)) + 0.5;
        ctx.moveTo(x, v.offY);
        ctx.lineTo(x, v.offY + rh);
      }
      for (let cm = $config.gridSnap; cm < roof.height; cm += $config.gridSnap) {
        const y = Math.round(toPxY(cm, v)) + 0.5;
        ctx.moveTo(v.offX, y);
        ctx.lineTo(v.offX + rw, y);
      }
      ctx.stroke();
    }

    // Placed panels.
    const placements = $layout?.placements ?? [];
    for (const p of placements) {
      const color = colorForOption(p.optionId);
      const px = toPxX(p.x, v);
      const py = toPxY(p.y, v);
      const pw = p.w * v.scale;
      const ph = p.h * v.scale;
      ctx.fillStyle = color + 'cc';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#0d1117';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, pw, ph);

      // Label: panel name + power, stacked when there is room, else just power.
      const cx = px + pw / 2;
      const cy = py + ph / 2;
      const name = nameForOption(p.optionId);
      ctx.fillStyle = '#0d1117';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (name && pw > 44 && ph > 32) {
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillText(name, cx, cy - 7);
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(`${p.power} Wp`, cx, cy + 7);
      } else if (pw > 30 && ph > 16) {
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.fillText(`${p.power} Wp`, cx, cy);
      }
    }

    // Keep-outs (drawn on top so they are always visible).
    for (const ko of $config.keepOuts) {
      const kx = toPxX(ko.x, v);
      const ky = toPxY(ko.y, v);
      const kw = ko.w * v.scale;
      const kh = ko.h * v.scale;
      ctx.fillStyle = 'rgba(229, 83, 75, 0.22)';
      ctx.fillRect(kx, ky, kw, kh);
      ctx.save();
      ctx.beginPath();
      ctx.rect(kx, ky, kw, kh);
      ctx.clip();
      ctx.strokeStyle = 'rgba(229, 83, 75, 0.5)';
      ctx.lineWidth = 1;
      for (let i = -kh; i < kw; i += 8) {
        ctx.beginPath();
        ctx.moveTo(kx + i, ky);
        ctx.lineTo(kx + i + kh, ky + kh);
        ctx.stroke();
      }
      ctx.restore();
      const selected = $selectedKeepOut === ko.id;
      ctx.strokeStyle = selected ? '#4a9eff' : 'rgba(229, 83, 75, 0.9)';
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.strokeRect(kx, ky, kw, kh);
      if (kw > 30) {
        // Label + live size on a dark backing plate so they stay legible over the
        // red hatching.
        const lines: { text: string; font: string; color: string }[] = [];
        if (ko.label) lines.push({ text: ko.label, font: '600 11px system-ui, sans-serif', color: '#ffe3df' });
        if (kh > 26 || !ko.label) {
          lines.push({
            text: `${Math.round(ko.w)} × ${Math.round(ko.h)} cm`,
            font: '10px system-ui, sans-serif',
            color: '#ffb3ac',
          });
        }
        if (lines.length > 0) {
          const padX = 5;
          const padY = 3;
          const lineH = 13;
          let maxW = 0;
          for (const l of lines) {
            ctx.font = l.font;
            maxW = Math.max(maxW, ctx.measureText(l.text).width);
          }
          const plateW = maxW + padX * 2;
          const plateH = lines.length * lineH + padY * 2 - 1;
          ctx.fillStyle = 'rgba(10, 14, 19, 0.82)';
          ctx.beginPath();
          ctx.roundRect(kx + 2, ky + 2, plateW, plateH, 4);
          ctx.fill();
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          let ty = ky + 2 + padY;
          for (const l of lines) {
            ctx.font = l.font;
            ctx.fillStyle = l.color;
            ctx.fillText(l.text, kx + 2 + padX, ty);
            ty += lineH;
          }
        }
      }

      // Resize handles on the selected keep-out.
      if (selected) {
        const hs = 4; // half handle size, px
        const xs = [kx, kx + kw / 2, kx + kw];
        const ys = [ky, ky + kh / 2, ky + kh];
        ctx.fillStyle = '#4a9eff';
        ctx.strokeStyle = '#0d1117';
        ctx.lineWidth = 1;
        for (const hx of xs) {
          for (const hy of ys) {
            if (hx === xs[1] && hy === ys[1]) continue; // skip center
            ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
            ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2);
          }
        }
      }
    }

    // Drag-to-draw preview.
    if (dragRect) {
      ctx.fillStyle = 'rgba(229, 83, 75, 0.18)';
      ctx.strokeStyle = '#e5534b';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.fillRect(toPxX(dragRect.x, v), toPxY(dragRect.y, v), dragRect.w * v.scale, dragRect.h * v.scale);
      ctx.strokeRect(toPxX(dragRect.x, v), toPxY(dragRect.y, v), dragRect.w * v.scale, dragRect.h * v.scale);
      ctx.setLineDash([]);
    }

    const guiding = mode === 'move' || mode === 'resize' || (mode === 'draw' && !!dragRect);
    if (!guiding) drawCrosshair(ctx, v);
    drawRulers(ctx, v);
    if (guiding) drawExtents(ctx, v); // on top of the ruler gutters
  }

  // Redraw whenever inputs change.
  $effect(() => {
    void [$config, $layout, $selectedKeepOut, dragRect, pointer, mode, cw, ch];
    draw();
  });

  function updatePointer(e: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    const c = cmAt(e.clientX, e.clientY);
    pointer = { px: e.clientX - r.left, py: e.clientY - r.top, cx: c.x, cy: c.y };
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const r = canvas.getBoundingClientRect();
    const grab = handleAt(e.clientX - r.left, e.clientY - r.top);
    if (grab) {
      // Start resizing an existing keep-out by an edge/corner handle.
      mode = 'resize';
      resizeId = grab.id;
      resizeHandle = grab.handle;
      selectedKeepOut.set(grab.id);
      cursor = HANDLE_CURSOR[grab.handle];
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    const raw = cmAt(e.clientX, e.clientY);
    const hit = keepOutAtCm(raw.x, raw.y);
    if (hit) {
      // Start moving an existing keep-out.
      const ko = $config.keepOuts.find((k) => k.id === hit)!;
      mode = 'move';
      moveId = hit;
      moveOffset = { x: raw.x - ko.x, y: raw.y - ko.y };
      selectedKeepOut.set(hit);
      cursor = 'grabbing';
    } else {
      // Start drawing a new keep-out.
      mode = 'draw';
      dragStart = clampedCm(e.clientX, e.clientY);
      dragRect = null;
      selectedKeepOut.set(null);
    }
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    updatePointer(e);

    if (mode === 'draw' && dragStart) {
      const { x: x2, y: y2 } = clampedCm(e.clientX, e.clientY);
      dragRect = {
        x: Math.min(dragStart.x, x2),
        y: Math.min(dragStart.y, y2),
        w: Math.abs(x2 - dragStart.x),
        h: Math.abs(y2 - dragStart.y),
      };
    } else if (mode === 'move' && moveId) {
      const roof = $config.roof;
      const ko = $config.keepOuts.find((k) => k.id === moveId);
      if (ko) {
        const raw = cmAt(e.clientX, e.clientY);
        const x = snap(clampNum(raw.x - moveOffset.x, 0, roof.width - ko.w), step());
        const y = snap(clampNum(raw.y - moveOffset.y, 0, roof.height - ko.h), step());
        updateKeepOut(moveId, { x, y });
      }
    } else if (mode === 'resize' && resizeId && resizeHandle) {
      resize(e);
    } else {
      // Idle: reflect whether the pointer can resize, grab, or draw.
      const r = canvas.getBoundingClientRect();
      const grab = handleAt(e.clientX - r.left, e.clientY - r.top);
      if (grab) cursor = HANDLE_CURSOR[grab.handle];
      else {
        const raw = cmAt(e.clientX, e.clientY);
        cursor = keepOutAtCm(raw.x, raw.y) ? 'grab' : 'crosshair';
      }
    }
  }

  /** Apply a resize-drag to the active keep-out, moving only the handle's edges. */
  function resize(e: PointerEvent) {
    const roof = $config.roof;
    const ko = $config.keepOuts.find((k) => k.id === resizeId);
    if (!ko || !resizeHandle) return;
    const p = clampedCm(e.clientX, e.clientY); // snapped, clamped to roof
    let { x, y, w, h } = ko;
    if (resizeHandle.includes('w')) {
      const right = ko.x + ko.w;
      x = Math.min(p.x, right - MIN_KO);
      w = right - x;
    } else if (resizeHandle.includes('e')) {
      w = Math.max(MIN_KO, p.x - ko.x);
    }
    if (resizeHandle.includes('n')) {
      const bottom = ko.y + ko.h;
      y = Math.min(p.y, bottom - MIN_KO);
      h = bottom - y;
    } else if (resizeHandle.includes('s')) {
      h = Math.max(MIN_KO, p.y - ko.y);
    }
    updateKeepOut(resizeId!, { x, y, w, h });
  }

  function onPointerUp() {
    if (mode === 'draw' && dragRect && dragRect.w >= 2 && dragRect.h >= 2) {
      const id = addKeepOut(dragRect);
      selectedKeepOut.set(id);
    }
    mode = 'idle';
    dragStart = null;
    dragRect = null;
    moveId = null;
    resizeId = null;
    resizeHandle = null;
    cursor = 'crosshair';
  }

  function onPointerLeave() {
    if (mode === 'idle') pointer = null;
  }

  onMount(() => {
    const ro = new ResizeObserver(() => {
      cw = wrap.clientWidth;
      ch = wrap.clientHeight;
    });
    ro.observe(wrap);
    cw = wrap.clientWidth;
    ch = wrap.clientHeight;
    return () => ro.disconnect();
  });
</script>

<div class="wrap" bind:this={wrap}>
  <canvas
    bind:this={canvas}
    style="width: {cw}px; height: {ch}px; cursor: {cursor};"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointerleave={onPointerLeave}
  ></canvas>
  {#if $layoutStale && ($layout?.placements.length ?? 0) > 0}
    <div class="stale-badge">Config changed — re-run optimize</div>
  {/if}
  <div class="hint-overlay">
    Drag empty roof to add a keep-out · drag a keep-out to move · drag its edges to resize
  </div>
</div>

<style>
  .wrap {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  canvas {
    display: block;
    touch-action: none;
  }
  .stale-badge {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(245, 166, 35, 0.15);
    border: 1px solid var(--accent);
    color: var(--accent);
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    pointer-events: none;
  }
  .hint-overlay {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    color: var(--text-dim);
    font-size: 12px;
    pointer-events: none;
  }
</style>
