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

/** Returns the node's name plus all descendant names. */
export function expandAva(name: string): string[] {
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

  const node = findNode(AVA_TREE, name);
  return node ? collectNames(node) : [name];
}
