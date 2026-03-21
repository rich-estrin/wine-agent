import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRightIcon, ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { AVA_TREE, type AvaNode } from '../data/ava-tree';

/** Returns nodes that match the query or have matching descendants. */
function filterTree(nodes: AvaNode[], query: string): AvaNode[] {
  const q = query.toLowerCase();
  return nodes.flatMap((node) => {
    if (node.name.toLowerCase().includes(q)) return [node];
    const filteredChildren = filterTree(node.children ?? [], q);
    if (filteredChildren.length > 0) return [{ ...node, children: filteredChildren }];
    return [];
  });
}

function TreeNode({
  node,
  selected,
  onSelect,
  depth,
  forceExpand,
}: {
  node: AvaNode;
  selected: string;
  onSelect: (name: string) => void;
  depth: number;
  forceExpand: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isSelected = selected === node.name;
  const isOpen = forceExpand || expanded;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 rounded cursor-pointer select-none
          ${isSelected ? 'bg-[#141617] text-[#deb77d]' : 'hover:bg-gray-100 text-gray-700'}`}
        style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '8px' }}
        ref={isSelected ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
        onClick={() => onSelect(isSelected ? '' : node.name)}
      >
        {hasChildren ? (
          <button
            className="shrink-0 p-0.5 rounded hover:bg-black/10"
            onClick={(e) => { e.stopPropagation(); setExpanded(!isOpen); }}
          >
            <ChevronRightIcon
              className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''} ${isSelected ? 'text-[#deb77d]' : 'text-gray-400'}`}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className={`text-sm ${isSelected ? 'font-medium' : ''}`}>{node.name}</span>
      </div>
      {isOpen && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.name}
              node={child}
              selected={selected}
              onSelect={onSelect}
              depth={depth + 1}
              forceExpand={forceExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AvaTreeFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const visibleTree = search ? filterTree(AVA_TREE, search) : AVA_TREE;

  const handleSelect = useCallback((name: string) => {
    onChange(name);
    if (name) { setOpen(false); setSearch(''); }
  }, [onChange]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`relative min-w-[160px] rounded-md border bg-white py-2 pl-3 pr-8 text-left text-sm focus:outline-none
          ${value ? 'border-gray-300 text-gray-900' : 'border-gray-300 text-gray-400'}`}
      >
        <span className="flex items-center gap-1">
          <span className="truncate">{value || 'AVA'}</span>
          {value && (
            <XMarkIcon
              className="h-3.5 w-3.5 shrink-0 text-gray-400 hover:text-gray-700"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
            />
          )}
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <ChevronUpDownIcon className="h-4 w-4 text-gray-400" />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-md border border-gray-200 bg-white shadow-lg flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter AVAs…"
              className="w-full rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-gray-400 placeholder-gray-300"
            />
          </div>
          <div className="overflow-y-auto max-h-72 py-1">
            {visibleTree.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">No matches</p>
            ) : (
              visibleTree.map((node) => (
                <TreeNode
                  key={node.name}
                  node={node}
                  selected={value}
                  onSelect={handleSelect}
                  depth={0}
                  forceExpand={search.length > 0}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
