import { writable } from 'svelte/store';

// Sidebar view state: which sections are open, how wide the column is, whether it is
// collapsed to the icon rail. Deliberately separate from `config` in stores.ts — this
// describes the window, not the plan, and must never end up in an export or a share link.

const KEY = 'camper-solar-layout:sidebar:v1';

export const SIDEBAR_MIN_W = 240;
export const SIDEBAR_MAX_W = 520;
export const SIDEBAR_DEFAULT_W = 320;
/** Width of the collapsed icon rail, in px. Mirrored by `--rail-w` in App.svelte. */
export const SIDEBAR_RAIL_W = 48;

/** The collapsible sections, in the order the sidebar renders them. */
export const SECTIONS = ['overview', 'surfaces', 'panels', 'spacing'] as const;
export type SectionId = (typeof SECTIONS)[number];

export type SidebarPrefs = {
  collapsed: boolean;
  width: number;
  open: Record<SectionId, boolean>;
  /** Surface ids whose keep-outs are shown. */
  expandedSurfaces: string[];
};

// Spacing is set once and rarely revisited, so it starts out of the way.
const DEFAULTS: SidebarPrefs = {
  collapsed: false,
  width: SIDEBAR_DEFAULT_W,
  open: { overview: true, surfaces: true, panels: true, spacing: false },
  expandedSurfaces: [],
};

export const clampSidebarWidth = (n: number): number =>
  Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, Math.round(n)));

/** Anything unrecognised falls back to the default, one field at a time. */
function load(): SidebarPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<SidebarPrefs>;
    const open = { ...DEFAULTS.open };
    for (const id of SECTIONS) {
      if (typeof p.open?.[id] === 'boolean') open[id] = p.open[id];
    }
    return {
      collapsed: p.collapsed === true,
      width: typeof p.width === 'number' && Number.isFinite(p.width)
        ? clampSidebarWidth(p.width)
        : DEFAULTS.width,
      open,
      expandedSurfaces: Array.isArray(p.expandedSurfaces)
        ? p.expandedSurfaces.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    return DEFAULTS;
  }
}

export const sidebarPrefs = writable<SidebarPrefs>(load());

// Debounced like the config autosave: a resize drag updates the width on every pointer
// move, and none of those intermediate values is worth a write.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
sidebarPrefs.subscribe((p) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      // best-effort
    }
  }, 250);
});

export function toggleSidebar(): void {
  sidebarPrefs.update((p) => ({ ...p, collapsed: !p.collapsed }));
}

export function setSidebarWidth(width: number): void {
  sidebarPrefs.update((p) => ({ ...p, width: clampSidebarWidth(width) }));
}

export function toggleSection(id: SectionId): void {
  sidebarPrefs.update((p) => ({ ...p, open: { ...p.open, [id]: !p.open[id] } }));
}

/** Expand the sidebar and open one section — what a click on a rail icon does. */
export function revealSection(id: SectionId): void {
  sidebarPrefs.update((p) => ({ ...p, collapsed: false, open: { ...p.open, [id]: true } }));
}

export function setSurfaceExpanded(surfaceId: string, expanded: boolean): void {
  sidebarPrefs.update((p) => {
    const has = p.expandedSurfaces.includes(surfaceId);
    if (has === expanded) return p;
    return {
      ...p,
      expandedSurfaces: expanded
        ? [...p.expandedSurfaces, surfaceId]
        : p.expandedSurfaces.filter((id) => id !== surfaceId),
    };
  });
}

export function toggleSurfaceExpanded(surfaceId: string): void {
  sidebarPrefs.update((p) => ({
    ...p,
    expandedSurfaces: p.expandedSurfaces.includes(surfaceId)
      ? p.expandedSurfaces.filter((id) => id !== surfaceId)
      : [...p.expandedSurfaces, surfaceId],
  }));
}
