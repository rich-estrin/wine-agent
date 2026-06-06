// Home Region hierarchy, grouped by state/province. Unlike the AVA tree (a
// fixed taxonomy), home regions come from the data at runtime, so the tree is
// built from the meta `regions` list. Each region carries its state(s) in a
// parenthetical, e.g. "Walla Walla Valley (WA/OR)", "Sunnyslope (ID)".

export interface RegionNode {
  name: string;
  children?: RegionNode[];
}

const STATE_NAMES: Record<string, string> = {
  WA: 'Washington',
  OR: 'Oregon',
  ID: 'Idaho',
  BC: 'British Columbia',
};

// Display order for the top-level state groups.
const STATE_ORDER = ['Washington', 'Oregon', 'Idaho', 'British Columbia', 'Other'];

/** Extract the state name(s) a region belongs to from its parenthetical code. */
export function statesOf(region: string): string[] {
  const m = region.match(/\(([^)]*)\)/);
  if (!m) return ['Other'];
  const codes = m[1]
    .split(/[/&,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const states = [...new Set(codes.map((c) => STATE_NAMES[c]).filter(Boolean))];
  return states.length ? states : ['Other'];
}

const isStateName = (name: string): boolean => STATE_ORDER.includes(name);

/** Build a two-level tree (state → regions) from a flat list of region strings.
 *  A region spanning multiple states appears under each. */
export function buildRegionTree(regions: string[]): RegionNode[] {
  const byState = new Map<string, string[]>();
  for (const region of regions) {
    if (!region) continue;
    for (const state of statesOf(region)) {
      if (!byState.has(state)) byState.set(state, []);
      byState.get(state)!.push(region);
    }
  }

  return STATE_ORDER.filter((s) => byState.has(s)).map((state) => ({
    name: state,
    children: [...new Set(byState.get(state)!)]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name })),
  }));
}

/** Expand a selected node into the region strings to match against. A state
 *  group expands to all its member regions; a leaf region is itself. */
export function expandRegion(name: string, allRegions: string[]): string[] {
  if (!name) return [];
  if (isStateName(name)) {
    return allRegions.filter((r) => statesOf(r).includes(name));
  }
  return [name];
}
