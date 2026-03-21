import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { Meta } from '../types';
import AvaTreeFilter from './AvaTreeFilter';

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

// Date range options
const dateRangeOptions = [
  { label: 'Last 3 months', value: '3m' },
  { label: 'Last 6 months', value: '6m' },
  { label: 'Last 1 year', value: '1y' },
  { label: 'Last 2 years', value: '2y' },
  { label: 'Last 3 years', value: '3y' },
  { label: 'Last 5 years', value: '5y' },
  { label: 'Last 10 years', value: '10y' },
];

// Convert date range to filter format
export function getDateFilter(dateRange: string): string {
  if (!dateRange) return '';

  const now = new Date();
  let yearsAgo: number;

  switch (dateRange) {
    case '3m':
      yearsAgo = 0.25;
      break;
    case '6m':
      yearsAgo = 0.5;
      break;
    case '1y':
      yearsAgo = 1;
      break;
    case '2y':
      yearsAgo = 2;
      break;
    case '3y':
      yearsAgo = 3;
      break;
    case '5y':
      yearsAgo = 5;
      break;
    case '10y':
      yearsAgo = 10;
      break;
    default:
      return '';
  }

  const pastDate = new Date(now);
  pastDate.setFullYear(now.getFullYear() - Math.floor(yearsAgo));
  if (yearsAgo < 1) {
    pastDate.setMonth(now.getMonth() - Math.floor(yearsAgo * 12));
  }

  return `>=${pastDate.toISOString().split('T')[0]}`;
}

// Non-linear price scale: 50% of slider covers $15–$100 (most wines),
// 25% covers $0–$15, 25% covers $100–$300.
// Internal slider range: 0–100.
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

function PriceRangeSlider({
  priceMin,
  priceMax,
  onChange,
}: {
  priceMin: string;
  priceMax: string;
  onChange: (min: string, max: string) => void;
}) {
  const minPrice = priceMin !== '' ? parseInt(priceMin) : 0;
  const maxPrice = priceMax !== '' ? parseInt(priceMax) : 300;
  const isActive = priceMin !== '' || priceMax !== '';

  const sliderMin = priceToSlider(minPrice);
  const sliderMax = priceToSlider(maxPrice);
  const minPct = sliderMin;
  const maxPct = sliderMax;

  const handleMinSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const s = Math.min(parseInt(e.target.value), sliderMax - 1);
    const price = sliderToPrice(s);
    onChange(price === 0 ? '' : String(price), priceMax);
  };
  const handleMaxSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const s = Math.max(parseInt(e.target.value), sliderMin + 1);
    const price = sliderToPrice(s);
    onChange(priceMin, price === 300 ? '' : String(price));
  };
  const handleMinText = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value.replace(/\D/g, ''), priceMax);
  };
  const handleMaxText = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(priceMin, e.target.value.replace(/\D/g, ''));
  };

  return (
    <div className={`flex items-center gap-2 rounded-md border bg-white px-3 py-2 ${isActive ? 'border-[#141617]' : 'border-gray-300'}`}>
      <span className="text-xs text-gray-500 whitespace-nowrap">Price</span>
      <span className="text-xs text-gray-400">$</span>
      <input
        type="text"
        inputMode="numeric"
        value={priceMin}
        onChange={handleMinText}
        placeholder="Min"
        className="w-10 text-xs text-gray-700 outline-none bg-transparent placeholder-gray-300"
      />
      <div className="relative flex items-center w-24 h-5">
        <div className="absolute w-full h-1 bg-gray-200 rounded" />
        <div
          className="absolute h-1 bg-[#141617] rounded"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={sliderMin}
          onChange={handleMinSlider}
          className="score-slider"
          style={{ zIndex: sliderMin > 80 ? 5 : 3 }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={sliderMax}
          onChange={handleMaxSlider}
          className="score-slider"
          style={{ zIndex: 4 }}
        />
      </div>
      <span className="text-xs text-gray-400">$</span>
      <input
        type="text"
        inputMode="numeric"
        value={priceMax}
        onChange={handleMaxText}
        placeholder="Max"
        className="w-10 text-xs text-gray-700 outline-none bg-transparent placeholder-gray-300"
      />
    </div>
  );
}

const SCORE_MIN = 80;
const SCORE_MAX = 100;

function ScoreRangeSlider({
  scoreMin,
  scoreMax,
  onChange,
}: {
  scoreMin: string;
  scoreMax: string;
  onChange: (min: string, max: string) => void;
}) {
  const minVal = scoreMin ? parseInt(scoreMin) : SCORE_MIN;
  const maxVal = scoreMax ? parseInt(scoreMax) : SCORE_MAX;
  const isActive = minVal > SCORE_MIN || maxVal < SCORE_MAX;

  const sliderMin = Math.max(SCORE_MIN, Math.min(minVal, SCORE_MAX));
  const sliderMax = Math.max(SCORE_MIN, Math.min(maxVal, SCORE_MAX));
  const minPct = ((sliderMin - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100;
  const maxPct = ((sliderMax - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100;

  const handleMinSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.min(parseInt(e.target.value), sliderMax - 1);
    onChange(v === SCORE_MIN ? '' : String(v), scoreMax);
  };
  const handleMaxSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(parseInt(e.target.value), sliderMin + 1);
    onChange(scoreMin, v === SCORE_MAX ? '' : String(v));
  };
  const handleMinText = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value.replace(/\D/g, ''), scoreMax);
  };
  const handleMaxText = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(scoreMin, e.target.value.replace(/\D/g, ''));
  };

  return (
    <div className={`flex items-center gap-2 rounded-md border bg-white px-3 py-2 ${isActive ? 'border-[#141617]' : 'border-gray-300'}`}>
      <span className="text-xs text-gray-500 whitespace-nowrap">Score</span>
      <input
        type="text"
        inputMode="numeric"
        value={scoreMin}
        onChange={handleMinText}
        placeholder="Min"
        className="w-8 text-xs text-gray-700 outline-none bg-transparent placeholder-gray-300"
      />
      <div className="relative flex items-center w-24 h-5">
        <div className="absolute w-full h-1 bg-gray-200 rounded" />
        <div
          className="absolute h-1 bg-[#141617] rounded"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <input
          type="range"
          min={SCORE_MIN}
          max={SCORE_MAX}
          value={sliderMin}
          onChange={handleMinSlider}
          className="score-slider"
          style={{ zIndex: sliderMin > SCORE_MAX - 2 ? 5 : 3 }}
        />
        <input
          type="range"
          min={SCORE_MIN}
          max={SCORE_MAX}
          value={sliderMax}
          onChange={handleMaxSlider}
          className="score-slider"
          style={{ zIndex: 4 }}
        />
      </div>
      <input
        type="text"
        inputMode="numeric"
        value={scoreMax}
        onChange={handleMaxText}
        placeholder="Max"
        className="w-8 text-xs text-gray-700 outline-none bg-transparent placeholder-gray-300"
      />
    </div>
  );
}

const VINTAGE_MIN = 1980;
const VINTAGE_MAX = new Date().getFullYear();

function VintageRangeSlider({
  vintageMin,
  vintageMax,
  onChange,
}: {
  vintageMin: string;
  vintageMax: string;
  onChange: (min: string, max: string) => void;
}) {
  const minVal = vintageMin ? parseInt(vintageMin) : VINTAGE_MIN;
  const maxVal = vintageMax ? parseInt(vintageMax) : VINTAGE_MAX;
  const isActive = vintageMin !== '' || vintageMax !== '';

  const sliderMin = Math.max(VINTAGE_MIN, Math.min(minVal, VINTAGE_MAX));
  const sliderMax = Math.max(VINTAGE_MIN, Math.min(maxVal, VINTAGE_MAX));
  const minPct = ((sliderMin - VINTAGE_MIN) / (VINTAGE_MAX - VINTAGE_MIN)) * 100;
  const maxPct = ((sliderMax - VINTAGE_MIN) / (VINTAGE_MAX - VINTAGE_MIN)) * 100;

  const handleMinSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.min(parseInt(e.target.value), sliderMax - 1);
    onChange(v === VINTAGE_MIN ? '' : String(v), vintageMax);
  };
  const handleMaxSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(parseInt(e.target.value), sliderMin + 1);
    onChange(vintageMin, v === VINTAGE_MAX ? '' : String(v));
  };
  const handleMinText = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value.replace(/\D/g, ''), vintageMax);
  };
  const handleMaxText = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(vintageMin, e.target.value.replace(/\D/g, ''));
  };

  return (
    <div className={`flex items-center gap-2 rounded-md border bg-white px-3 py-2 ${isActive ? 'border-[#141617]' : 'border-gray-300'}`}>
      <span className="text-xs text-gray-500 whitespace-nowrap">Vintage</span>
      <input
        type="text"
        inputMode="numeric"
        value={vintageMin}
        onChange={handleMinText}
        placeholder="From"
        className="w-10 text-xs text-gray-700 outline-none bg-transparent placeholder-gray-300"
      />
      <div className="relative flex items-center w-24 h-5">
        <div className="absolute w-full h-1 bg-gray-200 rounded" />
        <div
          className="absolute h-1 bg-[#141617] rounded"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <input
          type="range"
          min={VINTAGE_MIN}
          max={VINTAGE_MAX}
          value={sliderMin}
          onChange={handleMinSlider}
          className="score-slider"
          style={{ zIndex: sliderMin > VINTAGE_MAX - 2 ? 5 : 3 }}
        />
        <input
          type="range"
          min={VINTAGE_MIN}
          max={VINTAGE_MAX}
          value={sliderMax}
          onChange={handleMaxSlider}
          className="score-slider"
          style={{ zIndex: 4 }}
        />
      </div>
      <input
        type="text"
        inputMode="numeric"
        value={vintageMax}
        onChange={handleMaxText}
        placeholder="To"
        className="w-10 text-xs text-gray-700 outline-none bg-transparent placeholder-gray-300"
      />
    </div>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-[160px]">
      <Listbox value={value} onChange={onChange}>
        <div className="relative">
          <ListboxButton className="relative w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-8 text-left text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <span className={value ? 'text-gray-900' : 'text-gray-400'}>
              {value || label}
            </span>
            <span className="absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon className="h-4 w-4 text-gray-400" />
            </span>
          </ListboxButton>
          <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 focus:outline-none text-sm">
            <ListboxOption
              value=""
              className="cursor-pointer select-none px-3 py-2 text-gray-400 hover:bg-indigo-50 data-[selected]:bg-indigo-100"
            >
              All {label}s
            </ListboxOption>
            {options.map((opt) => (
              <ListboxOption
                key={opt}
                value={opt}
                className="cursor-pointer select-none px-3 py-2 text-gray-900 hover:bg-indigo-50 data-[selected]:bg-indigo-100 data-[selected]:font-medium"
              >
                {opt}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </div>
  );
}

function ActiveFilterPills({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const pills: { label: string; clear: () => void }[] = [];

  if (filters.mainVarietal)
    pills.push({ label: filters.mainVarietal, clear: () => onChange({ ...filters, mainVarietal: '' }) });
  if (filters.ava)
    pills.push({ label: filters.ava, clear: () => onChange({ ...filters, ava: '' }) });
  if (filters.region)
    pills.push({ label: filters.region, clear: () => onChange({ ...filters, region: '' }) });
  if (filters.type)
    pills.push({ label: filters.type, clear: () => onChange({ ...filters, type: '' }) });
  if (filters.priceMin || filters.priceMax) {
    const label = filters.priceMin && filters.priceMax
      ? `$${filters.priceMin}–$${filters.priceMax}`
      : filters.priceMin ? `$${filters.priceMin}+` : `Up to $${filters.priceMax}`;
    pills.push({ label, clear: () => onChange({ ...filters, priceMin: '', priceMax: '' }) });
  }
  if (filters.scoreMin || filters.scoreMax) {
    const min = filters.scoreMin || '80';
    const max = filters.scoreMax || '100';
    pills.push({ label: `Score ${min}–${max}`, clear: () => onChange({ ...filters, scoreMin: '', scoreMax: '' }) });
  }
  if (filters.vintageMin || filters.vintageMax) {
    const label = filters.vintageMin && filters.vintageMax
      ? `${filters.vintageMin}–${filters.vintageMax}`
      : filters.vintageMin ? `${filters.vintageMin}+` : `Up to ${filters.vintageMax}`;
    pills.push({ label: `Vintage ${label}`, clear: () => onChange({ ...filters, vintageMin: '', vintageMax: '' }) });
  }
  if (filters.dateRange) {
    const label = dateRangeOptions.find((o) => o.value === filters.dateRange)?.label ?? filters.dateRange;
    pills.push({ label, clear: () => onChange({ ...filters, dateRange: '' }) });
  }

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {pills.map((pill) => (
        <button
          key={pill.label}
          onClick={pill.clear}
          className="flex items-center gap-1 rounded-full bg-[#141617] text-[#deb77d] text-xs px-3 py-1 hover:bg-[#2a2c2f] transition-colors"
        >
          {pill.label}
          <XMarkIcon className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}

export default function FilterPanel({
  meta,
  filters,
  onChange,
}: {
  meta: Meta | null;
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const hasFilters = Object.values(filters).some((v) => v !== '');

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        {meta && (
          <>
            <SelectFilter
              label="Varietal"
              value={filters.mainVarietal}
              options={meta.varietals}
              onChange={(v) => onChange({ ...filters, mainVarietal: v })}
            />
            <AvaTreeFilter
              value={filters.ava}
              onChange={(v) => onChange({ ...filters, ava: v })}
            />
            <SelectFilter
              label="Region"
              value={filters.region}
              options={meta.regions}
              onChange={(v) => onChange({ ...filters, region: v })}
            />
            <SelectFilter
              label="Type"
              value={filters.type}
              options={meta.types}
              onChange={(v) => onChange({ ...filters, type: v })}
            />
          </>
        )}
        <PriceRangeSlider
          priceMin={filters.priceMin}
          priceMax={filters.priceMax}
          onChange={(min, max) => onChange({ ...filters, priceMin: min, priceMax: max })}
        />
        <ScoreRangeSlider
          scoreMin={filters.scoreMin}
          scoreMax={filters.scoreMax}
          onChange={(min, max) => onChange({ ...filters, scoreMin: min, scoreMax: max })}
        />
        <VintageRangeSlider
          vintageMin={filters.vintageMin}
          vintageMax={filters.vintageMax}
          onChange={(min, max) => onChange({ ...filters, vintageMin: min, vintageMax: max })}
        />
        <Listbox
          value={filters.dateRange}
          onChange={(v) => onChange({ ...filters, dateRange: v })}
        >
          <div className="relative min-w-[140px]">
            <ListboxButton className="relative w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-8 text-left text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <span
                className={filters.dateRange ? 'text-gray-900' : 'text-gray-400'}
              >
                {filters.dateRange
                  ? dateRangeOptions.find((o) => o.value === filters.dateRange)
                      ?.label
                  : 'Review Date'}
              </span>
              <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                <ChevronUpDownIcon className="h-4 w-4 text-gray-400" />
              </span>
            </ListboxButton>
            <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 focus:outline-none text-sm">
              <ListboxOption
                value=""
                className="cursor-pointer select-none px-3 py-2 text-gray-400 hover:bg-indigo-50 data-[selected]:bg-indigo-100"
              >
                All Dates
              </ListboxOption>
              {dateRangeOptions.map((opt) => (
                <ListboxOption
                  key={opt.value}
                  value={opt.value}
                  className="cursor-pointer select-none px-3 py-2 text-gray-900 hover:bg-indigo-50 data-[selected]:bg-indigo-100 data-[selected]:font-medium"
                >
                  {opt.label}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </div>
        </Listbox>
        {hasFilters && (
          <button
            onClick={() => onChange(emptyFilters)}
            className="flex items-center gap-1 rounded-md px-2 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          >
            <XMarkIcon className="h-4 w-4" />
            Clear all
          </button>
        )}
      </div>
      <ActiveFilterPills filters={filters} onChange={onChange} />
    </div>
  );
}
