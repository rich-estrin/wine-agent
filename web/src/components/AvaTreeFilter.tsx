import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRightIcon, ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { AVA_TREE, type AvaNode } from '../data/ava-tree';

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
        className={`flex items-center gap-1 py-[5px] rounded-[2px] cursor-pointer select-none transition-colors
          ${isSelected
            ? 'bg-[rgba(123,45,62,0.08)] text-wine'
            : 'text-ink/65 hover:bg-[rgba(26,20,16,0.04)] hover:text-ink'
          }`}
        style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: '8px' }}
        ref={isSelected ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
        onClick={() => onSelect(isSelected ? '' : node.name)}
      >
        {hasChildren ? (
          <button
            className="shrink-0 p-0.5 rounded hover:bg-black/5"
            onClick={(e) => { e.stopPropagation(); setExpanded(!isOpen); }}
          >
            <ChevronRightIcon
              className={`h-2.5 w-2.5 transition-transform ${isOpen ? 'rotate-90' : ''} ${isSelected ? 'text-wine' : 'text-muted'}`}
            />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        <span className={`text-[12px] ${isSelected ? 'font-medium' : ''}`}>{node.name}</span>
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
        className={`w-full flex items-center justify-between pl-3 pr-2.5 py-[7px] text-[12px] rounded-[3px] border transition-colors text-left
          ${value
            ? 'border-[rgba(26,20,16,0.15)] bg-[rgba(0,0,0,0.04)] text-ink'
            : 'border-[rgba(26,20,16,0.1)] bg-[rgba(0,0,0,0.04)] text-muted/70 hover:text-muted'
          }
          focus:outline-none ${open ? 'border-gold/50' : ''}`}
      >
        <span className="truncate flex-1">{value || 'Select an AVA…'}</span>
        <span className="flex items-center gap-1 flex-shrink-0 ml-1">
          {value && (
            <XMarkIcon
              className="h-3 w-3 text-muted hover:text-ink"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
            />
          )}
          <ChevronDownIcon className={`h-3 w-3 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-full min-w-[220px] rounded-[3px] border border-warm-border bg-white shadow-xl flex flex-col">
          <div className="p-2 border-b border-warm-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter AVAs…"
              className="w-full rounded-[2px] border border-[rgba(26,20,16,0.1)] bg-[rgba(0,0,0,0.03)] px-2.5 py-[5px] text-[11px] text-ink outline-none focus:border-gold/50 placeholder:text-muted/50 transition-colors"
            />
          </div>
          <div className="overflow-y-auto max-h-64 py-1 px-1">
            {visibleTree.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-muted italic">No matches</p>
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
