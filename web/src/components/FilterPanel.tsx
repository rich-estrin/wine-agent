import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import type { Meta } from '../types';

export interface Filters {
  mainVarietal: string;
  region: string;
  type: string;
  priceMax: string;
  ratingMin: string;
  dateRange: string;
}

export const emptyFilters: Filters = {
  mainVarietal: '',
  region: '',
  type: '',
  priceMax: '',
  ratingMin: '',
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

function StarRatingFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const rating = value ? parseFloat(value) : 0;
  const stars = [1, 2, 3, 4, 5];

  return (
    <div className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2">
      <span className="text-xs text-gray-500 mr-1">Min:</span>
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(rating === star ? '' : star.toString())}
          className="focus:outline-none"
        >
          <StarIcon
            className={`h-5 w-5 ${
              star <= rating
                ? 'text-yellow-400'
                : 'text-gray-300 hover:text-yellow-200'
            }`}
          />
        </button>
      ))}
      {rating > 0 && (
        <span className="text-xs text-gray-600 ml-1">{rating}+</span>
      )}
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
      <input
        type="text"
        placeholder="Max price"
        value={filters.priceMax}
        onChange={(e) => onChange({ ...filters, priceMax: e.target.value })}
        className="w-24 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <StarRatingFilter
        value={filters.ratingMin}
        onChange={(v) => onChange({ ...filters, ratingMin: v })}
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
