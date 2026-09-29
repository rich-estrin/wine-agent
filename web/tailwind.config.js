import fs from 'node:fs';
import { createRequire } from 'node:module';
import postcss from 'postcss';

// Tailwind's preflight is a page-wide reset (`svg { display: block }`, heading
// and list resets, the html font). Embedded in WordPress it restyles the host
// theme — the header's inline social icons stacked vertically. So preflight is
// off, and the same rules are re-added scoped to the app's own roots: the mount
// points plus the two things portalled into <body> (Headless UI's dialogs and
// menus, and the print-only shelf talker). `:where()` keeps each rule at its
// original specificity, so utilities still win over it.
const SCOPE = ':where(#wine-agent-root, #root, #headlessui-portal-root, #shelf-talker)';

function scopeSelector(sel) {
  // html/:host carry the root font and line-height; put them on the scope itself.
  if (sel === 'html' || sel === ':host') return SCOPE;
  if (sel === '*') return `${SCOPE}, ${SCOPE} *`;
  return `${SCOPE} ${sel}`;
}

const require = createRequire(import.meta.url);
const scopedPreflight = ({ addBase }) => {
  const css = fs.readFileSync(require.resolve('tailwindcss/src/css/preflight.css'), 'utf8');
  const root = postcss.parse(css);
  root.walkComments((c) => c.remove());
  root.walkRules((rule) => {
    // body's reset is margin (irrelevant here) and `line-height: inherit`, which
    // would undo the html rule once both land on the same scope element.
    if (rule.selector === 'body') return rule.remove();
    rule.selector = [...new Set(rule.selectors.map(scopeSelector))].join(', ');
  });
  addBase(root.nodes);
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        ink: '#1a1410',
        parchment: '#f5f0e8',
        cream: '#faf7f2',
        wine: '#7b2d3e',
        'wine-light': '#a84458',
        gold: '#b8924a',
        'gold-light': '#d4a85c',
        muted: '#706660',
        'warm-border': '#ddd5c4',
        'sidebar-bg': '#1e1812',
      },
      fontFamily: {
        cormorant: ['Georgia', 'serif'],
        sans: ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [scopedPreflight],
};
