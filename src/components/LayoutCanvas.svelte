<script lang="ts">
  import { onMount } from 'svelte';
  import {
    config,
    selectedLayouts,
    layoutStale,
    activeSurfaceId,
    selectedKeepOut,
    addKeepOut,
    updateKeepOut,
  } from '../lib/stores';
  import { panelColor } from '../lib/colors';
  import { snap } from '../lib/geometry';
  import { surfaceColumn, columnExtent, surfaceAtPoint, type PlacedSurface } from '../lib/surfaces';
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
  let dragSurfaceId: string | null = $state(null); // surface a new keep-out is being drawn on
  let moveId: string | null = null;
  let moveOffset = { x: 0, y: 0 };
  let resizeId: string | null = null;
  let resizeHandle: Handle | null = null;

  const HANDLE_TOL = 7; // px proximity to a keep-out edge to grab a resize handle
  const MIN_KO = 2; // minimum keep-out size, cm
  const GUIDE = '#ffd23f'; // contrasting color for drag/resize extent guides
  // Pointer position: px/py are canvas pixels, cx/cy are world centimeters.
  let pointer: { px: number; py: number; cx: number; cy: number } | null = $state(null);

  const RULER = 30; // gutter thickness for the rulers, px
  const PAD = 18; // padding between rulers and the surface stack

  /**
   * Surfaces stacked top to bottom in world space. Everything below works in world
   * centimeters; a surface's own coordinates are world minus its `y0` (surfaces are
   * left-aligned, so x needs no offset).
   */
  const column = $derived(surfaceColumn($config.surfaces));
  const extent = $derived(columnExtent(column));

  function view() {
    const availW = cw - RULER - PAD * 2;
    const availH = ch - RULER - PAD * 2;
    const scale = Math.min(availW / extent.w, availH / extent.h) || 1;
    const offX = RULER + PAD + Math.max(0, (availW - extent.w * scale) / 2);
    const offY = RULER + PAD + Math.max(0, (availH - extent.h * scale) / 2);
    return { scale, offX, offY };
  }

  const toPxX = (x: number, v = view()) => v.offX + x * v.scale;
  const toPxY = (y: number, v = view()) => v.offY + y * v.scale;

  /** Raw world centimeter coordinates under the pointer (unclamped). */
  function cmAt(clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    const v = view();
    return { x: (clientX - r.left - v.offX) / v.scale, y: (clientY - r.top - v.offY) / v.scale };
  }

  const clampNum = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

  /** The active snap step in cm (0 = off → whole-cm rounding). */
  const step = () => $config.gridSnap;

  /** Placed surface under a world point, or null in the gaps between surfaces. */
  const placedAt = (wx: number, wy: number) => surfaceAtPoint(column, wx, wy);

  const placedById = (id: string | null) => column.find((p) => p.surface.id === id) ?? null;

  /** Placed surface owning a keep-out id, or null. */
  function placedOfKeepOut(keepOutId: string | null): PlacedSurface | null {
    if (!keepOutId) return null;
    return column.find((p) => p.surface.keepOuts.some((k) => k.id === keepOutId)) ?? null;
  }

  /** Pointer position in one surface's local cm, snapped and clamped to its bounds. */
  function clampedLocal(clientX: number, clientY: number, placed: PlacedSurface) {
    const c = cmAt(clientX, clientY);
    return {
      x: snap(clampNum(c.x, 0, placed.surface.width), step()),
      y: snap(clampNum(c.y - placed.y0, 0, placed.surface.height), step()),
    };
  }

  /** Top-most keep-out id at a local point on one surface, or null. */
  function keepOutAtLocal(placed: PlacedSurface, x: number, y: number): string | null {
    const kos = placed.surface.keepOuts;
    for (let i = kos.length - 1; i >= 0; i--) {
      const k = kos[i];
      if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) return k.id;
    }
    return null;
  }

  /**
   * Resize handle under the pointer, if any. Works in pixel space with a small
   * tolerance, testing keep-outs top-most first (the selected one wins ties) so the
   * affordance matches what's drawn on top. Every surface is hit-tested, so a handle can
   * be grabbed without first selecting its surface.
   */
  function handleAt(px: number, py: number): { id: string; handle: Handle } | null {
    const v = view();
    const all = column.flatMap((p) => p.surface.keepOuts.map((k) => ({ k, y0: p.y0 })));
    const order = all.sort((a, b) => {
      if (a.k.id === $selectedKeepOut) return 1; // selected last → tested first
      if (b.k.id === $selectedKeepOut) return -1;
      return 0;
    });
    for (let i = order.length - 1; i >= 0; i--) {
      const { k, y0 } = order[i];
      const x1 = toPxX(k.x, v);
      const y1 = toPxY(y0 + k.y, v);
      const x2 = toPxX(k.x + k.w, v);
      const y2 = toPxY(y0 + k.y + k.h, v);
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

  /**
   * Rulers. The top one is a single scale — surfaces are left-aligned at x = 0, so one
   * horizontal scale is correct for all of them. The left one restarts at 0 for each
   * surface and leaves the gaps blank, so its labels match the surface-local coordinates
   * shown everywhere else (keep-out list, guide chips).
   */
  function drawRulers(ctx: CanvasRenderingContext2D, v: ReturnType<typeof view>) {
    const stepCm = niceStep(v.scale);
    const minor = stepCm / (stepCm % 5 === 0 ? 5 : 2);
    const isMajor = (cm: number) =>
      Math.abs(cm % stepCm) < 0.001 || Math.abs((cm % stepCm) - stepCm) < 0.001;

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

    // Top ruler (horizontal scale, shared by every surface).
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let cm = 0; cm <= extent.w + 0.001; cm += minor) {
      const px = toPxX(cm, v);
      if (px < RULER || px > cw) continue;
      const major = isMajor(cm);
      ctx.beginPath();
      ctx.moveTo(px + 0.5, RULER - (major ? 9 : 5));
      ctx.lineTo(px + 0.5, RULER);
      ctx.stroke();
      if (major) ctx.fillText(String(Math.round(cm)), px, 3);
    }

    // Left ruler (vertical scale, restarting per surface).
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of column) {
      for (let cm = 0; cm <= p.surface.height + 0.001; cm += minor) {
        const py = toPxY(p.y0 + cm, v);
        if (py < RULER || py > ch) continue;
        const major = isMajor(cm);
        ctx.beginPath();
        ctx.moveTo(RULER - (major ? 9 : 5), py + 0.5);
        ctx.lineTo(RULER, py + 0.5);
        ctx.stroke();
        if (major) ctx.fillText(String(Math.round(cm)), RULER / 2, py);
      }
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
    const placed = placedAt(pointer.cx, pointer.cy);
    if (!placed) return; // in a gap between surfaces — nothing to measure against

    const x = toPxX(pointer.cx, v);
    const y = toPxY(pointer.cy, v);
    const top = toPxY(placed.y0, v);
    const bottom = toPxY(placed.y0 + placed.surface.height, v);
    const right = toPxX(placed.surface.width, v);

    ctx.strokeStyle = 'rgba(74, 158, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, top);
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

    // Floating readout near the cursor, in the surface's own coordinates.
    const label = `${Math.round(pointer.cx)}, ${Math.round(pointer.cy - placed.y0)} cm`;
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

  /**
   * The rect being interacted with, which edges are changing, and the surface it belongs
   * to. Coordinates are surface-local.
   */
  function activeExtents(): {
    rect: Rect;
    xs: EdgeX[];
    ys: EdgeY[];
    placed: PlacedSurface;
  } | null {
    const all = (r: Rect, placed: PlacedSurface) => ({
      rect: r,
      placed,
      xs: [
        { cm: r.x, side: 'left' as const },
        { cm: r.x + r.w, side: 'right' as const },
      ],
      ys: [
        { cm: r.y, side: 'top' as const },
        { cm: r.y + r.h, side: 'bottom' as const },
      ],
    });
    if (mode === 'draw' && dragRect) {
      const placed = placedById(dragSurfaceId);
      if (placed) return all(dragRect, placed);
    }
    if (mode === 'move' && moveId) {
      const placed = placedOfKeepOut(moveId);
      const k = placed?.surface.keepOuts.find((o) => o.id === moveId);
      if (placed && k) return all(k, placed);
    }
    if (mode === 'resize' && resizeId && resizeHandle) {
      const placed = placedOfKeepOut(resizeId);
      const k = placed?.surface.keepOuts.find((o) => o.id === resizeId);
      if (placed && k) {
        const xs: EdgeX[] = [];
        const ys: EdgeY[] = [];
        if (resizeHandle.includes('w')) xs.push({ cm: k.x, side: 'left' });
        if (resizeHandle.includes('e')) xs.push({ cm: k.x + k.w, side: 'right' });
        if (resizeHandle.includes('n')) ys.push({ cm: k.y, side: 'top' });
        if (resizeHandle.includes('s')) ys.push({ cm: k.y + k.h, side: 'bottom' });
        return { rect: k, xs, ys, placed };
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

  /**
   * Extent guide lines, edge-position chips on the rulers, and clearance chips. All
   * distances are to the *owning* surface's edges, and the guides stay inside it.
   */
  function drawExtents(ctx: CanvasRenderingContext2D, v: ReturnType<typeof view>) {
    const ext = activeExtents();
    if (!ext) return;
    const { surface, y0 } = ext.placed;
    const bottom = toPxY(y0 + surface.height, v);
    const right = toPxX(surface.width, v);
    const midY = toPxY(y0 + ext.rect.y + ext.rect.h / 2, v); // keep-out center, for x-edge gaps
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
      const y = toPxY(y0 + e.cm, v) + 0.5;
      ctx.moveTo(RULER, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Position chips centered on the gutter rulers; distance chips in the gap to the edge.
    for (const e of ext.xs) {
      guideChip(ctx, String(Math.round(e.cm)), toPxX(e.cm, v), RULER / 2);
      const dist = e.side === 'left' ? e.cm : surface.width - e.cm;
      const gapMid = e.side === 'left' ? e.cm / 2 : (e.cm + surface.width) / 2;
      guideChip(ctx, `↔ ${Math.round(dist)}`, toPxX(gapMid, v), midY, 'dist');
    }
    for (const e of ext.ys) {
      guideChip(ctx, String(Math.round(e.cm)), RULER / 2, toPxY(y0 + e.cm, v));
      const dist = e.side === 'top' ? e.cm : surface.height - e.cm;
      const gapMid = e.side === 'top' ? e.cm / 2 : (e.cm + surface.height) / 2;
      guideChip(ctx, `↕ ${Math.round(dist)}`, midX, toPxY(y0 + gapMid, v), 'dist');
    }
  }

  /** One surface: body, margin outline, grid, panels, keep-outs, name label. */
  function drawSurface(
    ctx: CanvasRenderingContext2D,
    v: ReturnType<typeof view>,
    placed: PlacedSurface,
  ) {
    const { surface, y0 } = placed;
    if (surface.width <= 0 || surface.height <= 0) return;
    const active = surface.id === $activeSurfaceId;
    const ox = toPxX(0, v);
    const oy = toPxY(y0, v);
    const rw = surface.width * v.scale;
    const rh = surface.height * v.scale;

    // Name label, in the gap above the surface.
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = active ? '#f5a623' : '#8b98a5';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(surface.name, ox, oy - 5);

    // Body. The active surface is outlined in the accent color so the sidebar forms and
    // the canvas agree on what is being edited.
    ctx.fillStyle = '#11161d';
    ctx.strokeStyle = active ? '#f5a623' : '#3d4d5e';
    ctx.lineWidth = 2;
    ctx.fillRect(ox, oy, rw, rh);
    ctx.strokeRect(ox, oy, rw, rh);

    // Edge-margin outline.
    if ($config.edgeMargin > 0) {
      ctx.strokeStyle = 'rgba(245, 166, 35, 0.35)';
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1;
      ctx.strokeRect(
        toPxX($config.edgeMargin, v),
        toPxY(y0 + $config.edgeMargin, v),
        Math.max(0, surface.width - 2 * $config.edgeMargin) * v.scale,
        Math.max(0, surface.height - 2 * $config.edgeMargin) * v.scale,
      );
      ctx.setLineDash([]);
    }

    // Grid overlay (only for coarse snaps, so the mesh stays readable).
    if ($config.gridSnap === 5 || $config.gridSnap === 10) {
      ctx.strokeStyle = 'rgba(123, 138, 153, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let cm = $config.gridSnap; cm < surface.width; cm += $config.gridSnap) {
        const x = Math.round(toPxX(cm, v)) + 0.5;
        ctx.moveTo(x, oy);
        ctx.lineTo(x, oy + rh);
      }
      for (let cm = $config.gridSnap; cm < surface.height; cm += $config.gridSnap) {
        const y = Math.round(toPxY(y0 + cm, v)) + 0.5;
        ctx.moveTo(ox, y);
        ctx.lineTo(ox + rw, y);
      }
      ctx.stroke();
    }

    // Placed panels for this surface's currently selected option.
    const placements = $selectedLayouts[surface.id]?.placements ?? [];
    for (const p of placements) {
      const color = colorForOption(p.optionId);
      const px = toPxX(p.x, v);
      const py = toPxY(y0 + p.y, v);
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
    for (const ko of surface.keepOuts) {
      const kx = toPxX(ko.x, v);
      const ky = toPxY(y0 + ko.y, v);
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
        if (ko.label)
          lines.push({ text: ko.label, font: '600 11px system-ui, sans-serif', color: '#ffe3df' });
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

    const v = view();
    if (extent.w <= 0 || extent.h <= 0) {
      drawRulers(ctx, v);
      return;
    }

    for (const placed of column) drawSurface(ctx, v, placed);

    // Drag-to-draw preview, on the surface the drag started from.
    const drawingOn = placedById(dragSurfaceId);
    if (dragRect && drawingOn) {
      ctx.fillStyle = 'rgba(229, 83, 75, 0.18)';
      ctx.strokeStyle = '#e5534b';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      const dx = toPxX(dragRect.x, v);
      const dy = toPxY(drawingOn.y0 + dragRect.y, v);
      ctx.fillRect(dx, dy, dragRect.w * v.scale, dragRect.h * v.scale);
      ctx.strokeRect(dx, dy, dragRect.w * v.scale, dragRect.h * v.scale);
      ctx.setLineDash([]);
    }

    const guiding = mode === 'move' || mode === 'resize' || (mode === 'draw' && !!dragRect);
    if (!guiding) drawCrosshair(ctx, v);
    drawRulers(ctx, v);
    if (guiding) drawExtents(ctx, v); // on top of the ruler gutters
  }

  // Redraw whenever inputs change.
  $effect(() => {
    void [$config, $selectedLayouts, $selectedKeepOut, $activeSurfaceId, dragRect, pointer, mode, cw, ch];
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
      const owner = placedOfKeepOut(grab.id);
      if (owner) activeSurfaceId.set(owner.surface.id);
      cursor = HANDLE_CURSOR[grab.handle];
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    const raw = cmAt(e.clientX, e.clientY);
    const placed = placedAt(raw.x, raw.y);
    if (!placed) {
      // A press in the gap between surfaces only clears the selection.
      selectedKeepOut.set(null);
      return;
    }
    activeSurfaceId.set(placed.surface.id);

    const hit = keepOutAtLocal(placed, raw.x, raw.y - placed.y0);
    if (hit) {
      // Start moving an existing keep-out.
      const ko = placed.surface.keepOuts.find((k) => k.id === hit)!;
      mode = 'move';
      moveId = hit;
      moveOffset = { x: raw.x - ko.x, y: raw.y - placed.y0 - ko.y };
      selectedKeepOut.set(hit);
      cursor = 'grabbing';
    } else {
      // Start drawing a new keep-out on this surface.
      mode = 'draw';
      dragSurfaceId = placed.surface.id;
      dragStart = clampedLocal(e.clientX, e.clientY, placed);
      dragRect = null;
      selectedKeepOut.set(null);
    }
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    updatePointer(e);

    if (mode === 'draw' && dragStart) {
      const placed = placedById(dragSurfaceId);
      if (placed) {
        const { x: x2, y: y2 } = clampedLocal(e.clientX, e.clientY, placed);
        dragRect = {
          x: Math.min(dragStart.x, x2),
          y: Math.min(dragStart.y, y2),
          w: Math.abs(x2 - dragStart.x),
          h: Math.abs(y2 - dragStart.y),
        };
      }
    } else if (mode === 'move' && moveId) {
      const placed = placedOfKeepOut(moveId);
      const ko = placed?.surface.keepOuts.find((k) => k.id === moveId);
      if (placed && ko) {
        const raw = cmAt(e.clientX, e.clientY);
        const x = snap(clampNum(raw.x - moveOffset.x, 0, placed.surface.width - ko.w), step());
        const y = snap(
          clampNum(raw.y - placed.y0 - moveOffset.y, 0, placed.surface.height - ko.h),
          step(),
        );
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
        const placed = placedAt(raw.x, raw.y);
        if (!placed) cursor = 'default';
        else cursor = keepOutAtLocal(placed, raw.x, raw.y - placed.y0) ? 'grab' : 'crosshair';
      }
    }
  }

  /** Apply a resize-drag to the active keep-out, moving only the handle's edges. */
  function resize(e: PointerEvent) {
    const placed = placedOfKeepOut(resizeId);
    const ko = placed?.surface.keepOuts.find((k) => k.id === resizeId);
    if (!placed || !ko || !resizeHandle) return;
    const p = clampedLocal(e.clientX, e.clientY, placed); // snapped, clamped to the surface
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
    if (mode === 'draw' && dragRect && dragSurfaceId && dragRect.w >= 2 && dragRect.h >= 2) {
      const id = addKeepOut(dragRect, dragSurfaceId);
      selectedKeepOut.set(id);
    }
    mode = 'idle';
    dragStart = null;
    dragRect = null;
    dragSurfaceId = null;
    moveId = null;
    resizeId = null;
    resizeHandle = null;
    cursor = 'crosshair';
  }

  function onPointerLeave() {
    if (mode === 'idle') pointer = null;
  }

  const anyPlacements = $derived(
    $config.surfaces.some((s) => ($selectedLayouts[s.id]?.placements.length ?? 0) > 0),
  );

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
  {#if $layoutStale && anyPlacements}
    <div class="stale-badge">Config changed — re-run optimize</div>
  {/if}
  <div class="hint-overlay">
    Drag a surface to add a keep-out · drag a keep-out to move · drag its edges to resize
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
  /* The stack can reach the bottom of the canvas, so the hint needs a backing plate to
     stay legible where it overlaps a surface. */
  .hint-overlay {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(13, 17, 23, 0.82);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 4px 12px;
    white-space: nowrap;
    color: var(--text-dim);
    font-size: 12px;
    pointer-events: none;
  }
</style>
