import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { Meta } from '../types';

export interface Filters {
  mainVarietal: string;
  region: string;
  type: string;
  priceMin: string;
  priceMax: string;
  scoreMin: string;
  scoreMax: string;
  dateRange: string;
}

export const emptyFilters: Filters = {
  mainVarietal: '',
  region: '',
  type: '',
  priceMin: '',
  priceMax: '',
  scoreMin: '',
  scoreMax: '',
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

const PRICE_SLIDER_MIN = 0;
const PRICE_SLIDER_MAX = 300;

function PriceRangeSlider({
  priceMin,
  priceMax,
  onChange,
}: {
  priceMin: string;
  priceMax: string;
  onChange: (min: string, max: string) => void;
}) {
  const minVal = priceMin !== '' ? parseInt(priceMin) : PRICE_SLIDER_MIN;
  const maxVal = priceMax !== '' ? parseInt(priceMax) : PRICE_SLIDER_MAX;
  const isActive = priceMin !== '' || priceMax !== '';

  // Clamp to slider range for thumb positioning
  const sliderMin = Math.max(PRICE_SLIDER_MIN, Math.min(minVal, PRICE_SLIDER_MAX));
  const sliderMax = Math.max(PRICE_SLIDER_MIN, Math.min(maxVal, PRICE_SLIDER_MAX));
  const minPct = ((sliderMin - PRICE_SLIDER_MIN) / (PRICE_SLIDER_MAX - PRICE_SLIDER_MIN)) * 100;
  const maxPct = ((sliderMax - PRICE_SLIDER_MIN) / (PRICE_SLIDER_MAX - PRICE_SLIDER_MIN)) * 100;

  const handleMinSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.min(parseInt(e.target.value), sliderMax - 1);
    onChange(v === PRICE_SLIDER_MIN ? '' : String(v), priceMax);
  };
  const handleMaxSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(parseInt(e.target.value), sliderMin + 1);
    onChange(priceMin, v === PRICE_SLIDER_MAX ? '' : String(v));
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
          min={PRICE_SLIDER_MIN}
          max={PRICE_SLIDER_MAX}
          value={sliderMin}
          onChange={handleMinSlider}
          className="score-slider"
          style={{ zIndex: sliderMin > PRICE_SLIDER_MAX - 20 ? 5 : 3 }}
        />
        <input
          type="range"
          min={PRICE_SLIDER_MIN}
          max={PRICE_SLIDER_MAX}
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

  const minPct = ((minVal - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100;
  const maxPct = ((maxVal - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100;

  const handleMin = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.min(parseInt(e.target.value), maxVal - 1);
    onChange(v === SCORE_MIN ? '' : String(v), scoreMax);
  };

  const handleMax = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(parseInt(e.target.value), minVal + 1);
    onChange(scoreMin, v === SCORE_MAX ? '' : String(v));
  };

  return (
    <div className={`flex items-center gap-3 rounded-md border bg-white px-3 py-2 ${isActive ? 'border-[#141617]' : 'border-gray-300'}`}>
      <span className="text-xs text-gray-500 whitespace-nowrap">Score</span>
      <div className="relative flex items-center w-28 h-5">
        {/* Track background */}
        <div className="absolute w-full h-1 bg-gray-200 rounded" />
        {/* Active fill */}
        <div
          className="absolute h-1 bg-[#141617] rounded"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        {/* Min thumb */}
        <input
          type="range"
          min={SCORE_MIN}
          max={SCORE_MAX}
          value={minVal}
          onChange={handleMin}
          className="score-slider"
          style={{ zIndex: minVal > SCORE_MAX - 2 ? 5 : 3 }}
        />
        {/* Max thumb */}
        <input
          type="range"
          min={SCORE_MIN}
          max={SCORE_MAX}
          value={maxVal}
          onChange={handleMax}
          className="score-slider"
          style={{ zIndex: 4 }}
        />
      </div>
      <span className={`text-xs font-medium whitespace-nowrap w-12 ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
        {isActive ? `${minVal}–${maxVal}` : 'Any'}
      </span>
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
    <div className="flex flex-wrap items-center gap-3">
      {meta && (
        <>
          <SelectFilter
            label="Varietal"
            value={filters.mainVarietal}
            options={meta.varietals}
            onChange={(v) => onChange({ ...filters, mainVarietal: v })}
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
          Clear
        </button>
      )}
    </div>
  );
}
