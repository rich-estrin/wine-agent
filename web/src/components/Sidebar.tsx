import { useState } from 'react';
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { Meta } from '../types';
import AvaTreeFilter from './AvaTreeFilter';

// ── Types & utilities (re-exported for App.tsx) ──────────────────────────────

export interface Filters {
  mainVarietal: string;
  ava: string;
  region: string;
  type: string;
  priceMin: string;
  priceMax: string;
  scoreMin: string;
  scoreMax: string;
  vintageMin: string;
  vintageMax: string;
  dateRange: string;
}

export const emptyFilters: Filters = {
  mainVarietal: '',
  ava: '',
  region: '',
  type: '',
  priceMin: '',
  priceMax: '',
  scoreMin: '',
  scoreMax: '',
  vintageMin: '',
  vintageMax: '',
  dateRange: '',
};

const dateRangeOptions = [
  { label: 'Last 3 months', value: '3m' },
  { label: 'Last 6 months', value: '6m' },
  { label: 'Last 1 year', value: '1y' },
  { label: 'Last 2 years', value: '2y' },
  { label: 'Last 3 years', value: '3y' },
  { label: 'Last 5 years', value: '5y' },
  { label: 'Last 10 years', value: '10y' },
];

export function getDateFilter(dateRange: string): string {
  if (!dateRange) return '';
  const now = new Date();
  let yearsAgo: number;
  switch (dateRange) {
    case '3m':  yearsAgo = 0.25; break;
    case '6m':  yearsAgo = 0.5;  break;
    case '1y':  yearsAgo = 1;    break;
    case '2y':  yearsAgo = 2;    break;
    case '3y':  yearsAgo = 3;    break;
    case '5y':  yearsAgo = 5;    break;
    case '10y': yearsAgo = 10;   break;
    default: return '';
  }
  const pastDate = new Date(now);
  pastDate.setFullYear(now.getFullYear() - Math.floor(yearsAgo));
  if (yearsAgo < 1) pastDate.setMonth(now.getMonth() - Math.floor(yearsAgo * 12));
  return `>=${pastDate.toISOString().split('T')[0]}`;
}

// Non-linear price scale (same as FilterPanel)
function sliderToPrice(s: number): number {
  if (s <= 25) return Math.round(s * 15 / 25);
  if (s <= 75) return Math.round(15 + (s - 25) * 85 / 50);
  return Math.round(100 + (s - 75) * 200 / 25);
}
function priceToSlider(p: number): number {
  if (p <= 15) return Math.round(p * 25 / 15);
  if (p <= 100) return Math.round(25 + (p - 15) * 50 / 85);
  return Math.min(100, Math.round(75 + (p - 100) * 25 / 200));
}

const SCORE_MIN = 80;
const SCORE_MAX = 100;
const VINTAGE_MIN = 1980;
const VINTAGE_MAX = new Date().getFullYear();

// ── Shared sub-components ───────────────────────────────────────────────────

function FacetGroup({
  label,
  hasSelection,
  children,
  defaultOpen = false,
}: {
  label: string;
  hasSelection?: boolean;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-warm-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-[13px] hover:bg-[rgba(0,0,0,0.03)] transition-colors text-left"
      >
        <span
          className={`text-[11px] font-medium tracking-[0.1em] uppercase transition-colors ${
            hasSelection ? 'text-gold' : 'text-muted'
          }`}
        >
          {label}
        </span>
        <ChevronDownIcon
          className={`w-2.5 h-2.5 text-muted transition-transform flex-shrink-0 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && <div className="px-5 pb-3.5 pt-1">{children}</div>}
    </div>
  );
}

function FacetOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-2.5 w-full text-left py-[5px] group"
    >
      <div
        className="w-[14px] h-[14px] rounded-[2px] flex items-center justify-center flex-shrink-0 transition-all"
        style={
          selected
            ? { background: '#7b2d3e', border: '1px solid #a84458' }
            : { border: '1px solid #7b2d3e' }
        }
      >
        {selected && (
          <div
            style={{
              width: 7,
              height: 4,
              borderLeft: '1.5px solid white',
              borderBottom: '1.5px solid white',
              transform: 'rotate(-45deg) translateY(-1px)',
            }}
          />
        )}
      </div>
      <span
        className={`text-[12px] transition-colors flex-1 text-left ${
          selected ? 'text-ink' : 'text-muted group-hover:text-ink'
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function FacetList({
  options,
  value,
  onChange,
  maxVisible = 10,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  maxVisible?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? options : options.slice(0, maxVisible);
  return (
    <div>
      {visible.map((opt) => (
        <FacetOption
          key={opt}
          label={opt}
          selected={value === opt}
          onSelect={() => onChange(value === opt ? '' : opt)}
        />
      ))}
      {options.length > maxVisible && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-1 text-[10px] font-medium tracking-[0.08em] uppercase text-[rgba(184,146,74,0.65)] hover:text-[#b8924a] transition-colors"
        >
          {showAll ? 'Show less' : `+${options.length - maxVisible} more`}
        </button>
      )}
    </div>
  );
}

// Dual-range slider for sidebar (dark theme)
function SidebarDualRange({
  sliderMin,
  sliderMax,
  lo,
  hi,
  onLo,
  onHi,
  loText,
  hiText,
  onLoText,
  onHiText,
  prefix,
  zLo,
}: {
  sliderMin: number;
  sliderMax: number;
  lo: number;
  hi: number;
  onLo: (v: number) => void;
  onHi: (v: number) => void;
  loText: string;
  hiText: string;
  onLoText: (v: string) => void;
  onHiText: (v: string) => void;
  prefix?: string;
  zLo: number;
}) {
  const minPct = ((lo - sliderMin) / (sliderMax - sliderMin)) * 100;
  const maxPct = ((hi - sliderMin) / (sliderMax - sliderMin)) * 100;

  const inputClass =
    'font-cormorant text-[17px] text-ink bg-transparent border-b border-[rgba(26,20,16,0.15)] outline-none focus:border-[#7b2d3e] transition-colors w-12';

  return (
    <div>
      <div className="flex justify-between mb-2.5">
        <div className="flex items-baseline gap-0.5">
          {prefix && <span className="font-cormorant text-[13px] text-muted">{prefix}</span>}
          <input
            type="text"
            inputMode="numeric"
            value={loText}
            onChange={(e) => onLoText(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex items-baseline gap-0.5">
          {prefix && <span className="font-cormorant text-[13px] text-muted">{prefix}</span>}
          <input
            type="text"
            inputMode="numeric"
            value={hiText}
            onChange={(e) => onHiText(e.target.value)}
            className={`${inputClass} text-right`}
          />
        </div>
      </div>
      <div className="relative flex items-center h-5 w-full mb-1">
        <div className="absolute w-full h-[3px] bg-warm-border rounded-sm" />
        <div
          className="absolute h-[3px] bg-[#7b2d3e] rounded-sm"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          value={lo}
          onChange={(e) => onLo(Math.min(parseInt(e.target.value), hi - 1))}
          className="sidebar-slider"
          style={{ zIndex: zLo }}
        />
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          value={hi}
          onChange={(e) => onHi(Math.max(parseInt(e.target.value), lo + 1))}
          className="sidebar-slider"
          style={{ zIndex: 4 }}
        />
      </div>
    </div>
  );
}

function SidebarPriceSlider({
  priceMin,
  priceMax,
  onChange,
}: {
  priceMin: string;
  priceMax: string;
  onChange: (min: string, max: string) => void;
}) {
  const lo = priceToSlider(priceMin !== '' ? parseInt(priceMin) : 0);
  const hi = priceToSlider(priceMax !== '' ? parseInt(priceMax) : 300);
  return (
    <SidebarDualRange
      sliderMin={0}
      sliderMax={100}
      lo={lo}
      hi={hi}
      onLo={(v) => {
        const p = sliderToPrice(v);
        onChange(p === 0 ? '' : String(p), priceMax);
      }}
      onHi={(v) => {
        const p = sliderToPrice(v);
        onChange(priceMin, p === 300 ? '' : String(p));
      }}
      loText={priceMin || '0'}
      hiText={priceMax || '300'}
      onLoText={(v) => onChange(v.replace(/\D/g, ''), priceMax)}
      onHiText={(v) => onChange(priceMin, v.replace(/\D/g, ''))}
      prefix="$"
      zLo={lo > 80 ? 5 : 3}
    />
  );
}

function SidebarScoreSlider({
  scoreMin,
  scoreMax,
  onChange,
}: {
  scoreMin: string;
  scoreMax: string;
  onChange: (min: string, max: string) => void;
}) {
  const lo = scoreMin ? parseInt(scoreMin) : SCORE_MIN;
  const hi = scoreMax ? parseInt(scoreMax) : SCORE_MAX;
  return (
    <SidebarDualRange
      sliderMin={SCORE_MIN}
      sliderMax={SCORE_MAX}
      lo={lo}
      hi={hi}
      onLo={(v) => onChange(v === SCORE_MIN ? '' : String(v), scoreMax)}
      onHi={(v) => onChange(scoreMin, v === SCORE_MAX ? '' : String(v))}
      loText={scoreMin || String(SCORE_MIN)}
      hiText={scoreMax || String(SCORE_MAX)}
      onLoText={(v) => onChange(v.replace(/\D/g, ''), scoreMax)}
      onHiText={(v) => onChange(scoreMin, v.replace(/\D/g, ''))}
      zLo={lo > SCORE_MAX - 2 ? 5 : 3}
    />
  );
}

function SidebarVintageSlider({
  vintageMin,
  vintageMax,
  onChange,
}: {
  vintageMin: string;
  vintageMax: string;
  onChange: (min: string, max: string) => void;
}) {
  const lo = vintageMin ? parseInt(vintageMin) : VINTAGE_MIN;
  const hi = vintageMax ? parseInt(vintageMax) : VINTAGE_MAX;
  return (
    <SidebarDualRange
      sliderMin={VINTAGE_MIN}
      sliderMax={VINTAGE_MAX}
      lo={lo}
      hi={hi}
      onLo={(v) => onChange(v === VINTAGE_MIN ? '' : String(v), vintageMax)}
      onHi={(v) => onChange(vintageMin, v === VINTAGE_MAX ? '' : String(v))}
      loText={vintageMin || String(VINTAGE_MIN)}
      hiText={vintageMax || String(VINTAGE_MAX)}
      onLoText={(v) => onChange(v.replace(/\D/g, ''), vintageMax)}
      onHiText={(v) => onChange(vintageMin, v.replace(/\D/g, ''))}
      zLo={lo > VINTAGE_MAX - 3 ? 5 : 3}
    />
  );
}

// Active chips — exported so App.tsx can render them in the main content area
export function ActiveChips({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.mainVarietal) chips.push({ label: filters.mainVarietal, clear: () => onChange({ ...filters, mainVarietal: '' }) });
  if (filters.ava) chips.push({ label: filters.ava, clear: () => onChange({ ...filters, ava: '' }) });
  if (filters.region) chips.push({ label: filters.region, clear: () => onChange({ ...filters, region: '' }) });
  if (filters.type) chips.push({ label: filters.type, clear: () => onChange({ ...filters, type: '' }) });
  if (filters.priceMin || filters.priceMax) {
    const label = filters.priceMin && filters.priceMax
      ? `$${filters.priceMin}–$${filters.priceMax}`
      : filters.priceMin ? `$${filters.priceMin}+` : `Up to $${filters.priceMax}`;
    chips.push({ label, clear: () => onChange({ ...filters, priceMin: '', priceMax: '' }) });
  }
  if (filters.scoreMin || filters.scoreMax) {
    const min = filters.scoreMin || String(SCORE_MIN);
    const max = filters.scoreMax || String(SCORE_MAX);
    chips.push({ label: `Score ${min}–${max}`, clear: () => onChange({ ...filters, scoreMin: '', scoreMax: '' }) });
  }
  if (filters.vintageMin || filters.vintageMax) {
    const label = filters.vintageMin && filters.vintageMax
      ? `${filters.vintageMin}–${filters.vintageMax}`
      : filters.vintageMin ? `${filters.vintageMin}+` : `To ${filters.vintageMax}`;
    chips.push({ label, clear: () => onChange({ ...filters, vintageMin: '', vintageMax: '' }) });
  }
  if (filters.dateRange) {
    const opt = dateRangeOptions.find((o) => o.value === filters.dateRange);
    chips.push({ label: opt?.label ?? filters.dateRange, clear: () => onChange({ ...filters, dateRange: '' }) });
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.label}
          onClick={chip.clear}
          className="inline-flex items-center gap-[5px] px-2.5 py-[3px] text-[10px] font-medium tracking-[0.06em] uppercase text-white bg-[#7b2d3e] border border-[rgba(123,45,62,0.6)] rounded-full hover:bg-[#a84458] transition-colors"
        >
          {chip.label}
          <XMarkIcon className="w-[7px] h-[7px] opacity-60" />
        </button>
      ))}
      <button
        onClick={() => onChange(emptyFilters)}
        className="inline-flex items-center px-2.5 py-[3px] text-[10px] font-medium tracking-[0.06em] uppercase text-muted hover:text-ink transition-colors"
      >
        Clear all
      </button>
    </div>
  );
}

const TYPE_ORDER = ['Red', 'White', 'Rosé', 'Sparkling', 'Dessert'];
function sortTypes(types: string[]): string[] {
  return [...types].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a);
    const bi = TYPE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// ── Main Sidebar component ───────────────────────────────────────────────────

export default function Sidebar({
  meta,
  filters,
  onChange,
}: {
  meta: Meta | null;
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const hasFilters = Object.values(filters).some((v) => v !== '');

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-5 py-[18px] border-b border-warm-border flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] font-medium tracking-[0.14em] uppercase text-muted">
          Filters
        </span>
        {hasFilters && (
          <button
            onClick={() => onChange(emptyFilters)}
            className="text-[10px] font-medium tracking-[0.08em] uppercase text-gold opacity-65 hover:opacity-100 transition-opacity"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Facet groups */}
      {meta && (
        <>
          <FacetGroup
            label="Appellation"
            hasSelection={!!filters.ava}
            defaultOpen={true}
          >
            <AvaTreeFilter
              value={filters.ava}
              onChange={(v) => onChange({ ...filters, ava: v })}
            />
          </FacetGroup>

          <FacetGroup
            label="Region"
            hasSelection={!!filters.region}
            defaultOpen={false}
          >
            <FacetList
              options={meta.regions}
              value={filters.region}
              onChange={(v) => onChange({ ...filters, region: v })}
            />
          </FacetGroup>

          <FacetGroup
            label="Wine Type"
            hasSelection={!!filters.type}
            defaultOpen={true}
          >
            <FacetList
              options={sortTypes(meta.types)}
              value={filters.type}
              onChange={(v) => onChange({ ...filters, type: v })}
            />
          </FacetGroup>

          <FacetGroup
            label="Varietal"
            hasSelection={!!filters.mainVarietal}
            defaultOpen={false}
          >
            <FacetList
              options={meta.varietals}
              value={filters.mainVarietal}
              onChange={(v) => onChange({ ...filters, mainVarietal: v })}
            />
          </FacetGroup>
        </>
      )}

      <FacetGroup
        label="Price"
        hasSelection={!!(filters.priceMin || filters.priceMax)}
        defaultOpen={true}
      >
        <SidebarPriceSlider
          priceMin={filters.priceMin}
          priceMax={filters.priceMax}
          onChange={(min, max) => onChange({ ...filters, priceMin: min, priceMax: max })}
        />
      </FacetGroup>

      <FacetGroup
        label="Score"
        hasSelection={!!(filters.scoreMin || filters.scoreMax)}
        defaultOpen={true}
      >
        <SidebarScoreSlider
          scoreMin={filters.scoreMin}
          scoreMax={filters.scoreMax}
          onChange={(min, max) => onChange({ ...filters, scoreMin: min, scoreMax: max })}
        />
      </FacetGroup>

      <FacetGroup
        label="Vintage"
        hasSelection={!!(filters.vintageMin || filters.vintageMax)}
        defaultOpen={false}
      >
        <SidebarVintageSlider
          vintageMin={filters.vintageMin}
          vintageMax={filters.vintageMax}
          onChange={(min, max) => onChange({ ...filters, vintageMin: min, vintageMax: max })}
        />
      </FacetGroup>

      <FacetGroup
        label="Review Date"
        hasSelection={!!filters.dateRange}
        defaultOpen={false}
      >
        {dateRangeOptions.map((opt) => (
          <FacetOption
            key={opt.value}
            label={opt.label}
            selected={filters.dateRange === opt.value}
            onSelect={() =>
              onChange({
                ...filters,
                dateRange: filters.dateRange === opt.value ? '' : opt.value,
              })
            }
          />
        ))}
      </FacetGroup>
    </div>
  );
}
