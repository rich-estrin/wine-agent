import { fold } from '../lib/text';

export interface AvaNode {
  name: string;
  children?: AvaNode[];
}

export const AVA_TREE: AvaNode[] = [
  {
    name: 'Washington',
    children: [
      {
        name: 'Columbia Valley',
        children: [
          {
            name: 'Yakima Valley',
            children: [
              { name: 'Red Mountain' },
              { name: 'Rattlesnake Hills' },
              { name: 'Snipes Mountain' },
              { name: 'Candy Mountain' },
              { name: 'Goose Gap' },
            ],
          },
          {
            name: 'Walla Walla Valley',
            children: [
              { name: 'The Rocks District of Milton-Freewater' },
            ],
          },
          { name: 'Horse Heaven Hills' },
          { name: 'Wahluke Slope' },
          { name: 'Ancient Lakes of Columbia Valley' },
          { name: 'Naches Heights' },
          { name: 'Lake Chelan' },
          { name: 'Rocky Reach' },
          { name: 'Royal Slope' },
          { name: 'White Bluffs' },
        ],
      },
      { name: 'Columbia Gorge' },
      { name: 'Puget Sound' },
      { name: 'Lewis-Clark Valley' },
    ],
  },
  {
    name: 'Oregon',
    children: [
      {
        name: 'Willamette Valley',
        children: [
          {
            name: 'Chehalem Mountains',
            children: [
              { name: 'Ribbon Ridge' },
              { name: 'Laurelwood District' },
            ],
          },
          { name: 'Dundee Hills' },
          { name: 'Eola-Amity Hills' },
          { name: 'McMinnville' },
          { name: 'Yamhill-Carlton' },
          { name: 'Van Duzer Corridor' },
          { name: 'Tualatin Hills' },
          { name: 'Mount Pisgah' },
        ],
      },
      {
        name: 'Southern Oregon',
        children: [
          {
            name: 'Umpqua Valley',
            children: [
              { name: 'Elkton Oregon' },
            ],
          },
          {
            name: 'Rogue Valley',
            children: [
              { name: 'Applegate Valley' },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Idaho',
    children: [
      {
        name: 'Snake River Valley',
        children: [
          { name: 'Eagle Foothills' },
        ],
      },
    ],
  },
  {
    name: 'British Columbia',
    children: [
      {
        name: 'Okanagan Valley',
        children: [
          { name: 'Golden Mile Bench' },
          { name: 'Okanagan Falls' },
          { name: 'Summerland Bench' },
        ],
      },
      { name: 'Fraser Valley' },
    ],
  },
];

function findNode(nodes: AvaNode[], target: string): AvaNode | null {
  for (const n of nodes) {
    if (n.name === target) return n;
    if (n.children) {
      const found = findNode(n.children, target);
      if (found) return found;
    }
  }
  return null;
}

function collectNames(node: AvaNode): string[] {
  const names = [node.name];
  for (const child of node.children ?? []) names.push(...collectNames(child));
  return names;
}

/** Appellations present in the data that this Pacific Northwest taxonomy has no
 *  node for. Without this bucket they would be unreachable through the filter. */
export const OTHER_AVA_LABEL = 'Other appellations';

/** Appellations in `available` that the tree doesn't cover.
 *
 *  De-duplicates on the folded form, not the raw string: the source data spells
 *  the same appellation inconsistently (which is what AVA_CORRECTIONS exists to
 *  patch), so "Rioja" and "rioja" must collapse to one option rather than two
 *  that filter identically. The first spelling seen is the one displayed. */
function orphanAvas(available: string[]): string[] {
  const known = new Set(AVA_TREE.flatMap(collectNames).map(fold));
  const seen = new Map<string, string>();
  for (const raw of available) {
    const name = (raw ?? '').trim();
    if (!name) continue;
    const key = fold(name);
    if (known.has(key) || seen.has(key)) continue;
    seen.set(key, name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Prune the taxonomy to the appellations actually present, keeping a parent
 *  whenever any descendant survives, and append the leftovers as their own
 *  group. Passing an empty list returns the full tree unpruned. */
export function buildAvaTree(available: string[]): AvaNode[] {
  if (available.length === 0) return AVA_TREE;
  const present = new Set(available.map(fold));

  const prune = (nodes: AvaNode[]): AvaNode[] =>
    nodes.flatMap((node) => {
      const children = prune(node.children ?? []);
      if (children.length === 0 && !present.has(fold(node.name))) return [];
      return [children.length ? { ...node, children } : { name: node.name }];
    });

  const tree = prune(AVA_TREE);
  const orphans = orphanAvas(available);
  if (orphans.length) {
    tree.push({ name: OTHER_AVA_LABEL, children: orphans.map((name) => ({ name })) });
  }
  return tree;
}

/** Returns the node's name plus all descendant names — the values to match a
 *  selection against. */
export function expandAva(name: string, available: string[] = []): string[] {
  if (name === OTHER_AVA_LABEL) return orphanAvas(available);
  const node = findNode(AVA_TREE, name);
  return node ? collectNames(node) : [name];
}
