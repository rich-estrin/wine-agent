import { useState, useEffect, useCallback, useRef } from 'react';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import type { Wine, Meta } from './types';
import type { SearchParams, ChatMessage } from './api';
import { searchWines, fetchMeta, sendChatMessage } from './api';
import SearchBar from './components/SearchBar';
import { expandAva } from './data/ava-tree';
import Sidebar, {
  type Filters,
  emptyFilters,
  getDateFilter,
  ActiveChips,
} from './components/Sidebar';
import WineList from './components/WineList';
import WineDetail from './components/WineDetail';
import Chat from './components/Chat';
import Header from './components/Header';
import BottomSheet from './components/BottomSheet';

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [wines, setWines] = useState<Wine[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sortBy, setSortBy] = useState('rating');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedWine, setSelectedWine] = useState<Wine | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);
  const [activeTab, setActiveTab] = useState<'search' | 'chat'>('search');
  const [sheetOpen, setSheetOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 40;
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const activeFilterCount = Object.values(filters).filter((v) => v !== '').length;

  // Fetch meta on mount
  useEffect(() => {
    fetchMeta().then(setMeta).catch(console.error);
  }, []);

  // Build search params from current state
  const buildParams = useCallback((pageOffset = 0): SearchParams => {
    const params: SearchParams = {
      limit: PAGE_SIZE,
      offset: pageOffset,
      sort_by: sortBy,
      sort_order: sortOrder,
    };
    if (query.trim()) params.q = query.trim();
    if (filters.mainVarietal) params.mainVarietal = filters.mainVarietal;
    if (filters.ava) params.ava = expandAva(filters.ava).join(',');
    if (filters.region) params.region = filters.region;
    if (filters.type) params.type = filters.type;
    if (filters.priceMin) params.priceMin = filters.priceMin;
    if (filters.priceMax) params.priceMax = filters.priceMax;
    if (filters.scoreMin) params.scoreMin = filters.scoreMin;
    if (filters.scoreMax) params.scoreMax = filters.scoreMax;
    if (filters.vintageMin) params.vintageMin = filters.vintageMin;
    if (filters.vintageMax) params.vintageMax = filters.vintageMax;
    if (filters.dateRange) {
      const dateFilter = getDateFilter(filters.dateRange);
      if (dateFilter) params.publicationDate = dateFilter;
    }
    return params;
  }, [query, filters, sortBy, sortOrder]);

  // Handle chat message sending
  const handleChatSend = async (content: string) => {
    const userMessage: ChatMessage = { role: 'user', content };
    const newMessages = [...chatMessages, userMessage];
    setChatMessages(newMessages);
    setChatLoading(true);
    try {
      const response = await sendChatMessage(newMessages);
      setChatMessages([...newMessages, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error('Chat error:', error);
      setChatMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Reset and fetch first page whenever search params change
  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    setInitialLoad(false);

    const timer = setTimeout(() => {
      setLoading(true);
      searchWines(buildParams(0))
        .then((batch) => {
          setWines(batch);
          setHasMore(batch.length === PAGE_SIZE);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }, initialLoad ? 0 : 300);

    return () => clearTimeout(timer);
  }, [buildParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // IntersectionObserver — load next page when sentinel scrolls into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          const nextOffset = offset + PAGE_SIZE;
          setLoadingMore(true);
          searchWines(buildParams(nextOffset))
            .then((batch) => {
              setWines((prev) => [...prev, ...batch]);
              setOffset(nextOffset);
              setHasMore(batch.length === PAGE_SIZE);
            })
            .catch(console.error)
            .finally(() => setLoadingMore(false));
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, offset, buildParams]);

  return (
    <div className="min-h-screen bg-[#faf7f2] font-sans text-ink">
      <Header />

      {/* Tab navigation */}
      <div className="bg-ink border-b border-parchment/[0.08]">
        <div className="flex">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-5 py-2.5 text-[11px] font-medium tracking-[0.1em] uppercase transition-colors border-b-2 ${
              activeTab === 'search'
                ? 'text-gold border-gold'
                : 'text-parchment/40 border-transparent hover:text-parchment/70'
            }`}
          >
            Search
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-5 py-2.5 text-[11px] font-medium tracking-[0.1em] uppercase transition-colors border-b-2 ${
              activeTab === 'chat'
                ? 'text-gold border-gold'
                : 'text-parchment/40 border-transparent hover:text-parchment/70'
            }`}
          >
            Chat
          </button>
        </div>
      </div>

      {/* Search tab */}
      {activeTab === 'search' && (
        <>
          {/* Page body: sidebar + main */}
          <div className="flex">
            {/* Desktop sidebar */}
            <aside className="hidden lg:block w-[234px] flex-shrink-0 bg-[#faf7f2] border-r border-warm-border sticky top-0 self-start max-h-screen overflow-y-auto">
              <Sidebar meta={meta} filters={filters} onChange={setFilters} />
            </aside>

            {/* Main content */}
            <main className="flex-1 min-w-0 px-5 md:px-7 py-5 md:py-6">
              {/* Search bar + desktop sort */}
              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <SearchBar value={query} onChange={setQuery} />
                </div>
                <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-muted">Sort by</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="text-[12px] font-medium text-ink bg-white border border-warm-border rounded-[3px] px-2.5 py-[6px] outline-none cursor-pointer"
                  >
                    <option value="rating">Rating</option>
                    <option value="price">Price</option>
                    <option value="vintage">Vintage</option>
                    <option value="publicationDate">Date</option>
                  </select>
                  <button
                    onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
                    className="text-[11px] font-medium tracking-[0.06em] uppercase text-muted bg-white border border-warm-border rounded-[3px] px-2.5 py-[6px] hover:text-ink transition-colors"
                  >
                    {sortOrder === 'desc' ? 'Highest' : 'Lowest'}
                  </button>
                </div>
              </div>

              {/* Mobile: Filters button + sort controls */}
              <div className="lg:hidden flex items-center gap-2 mb-3">
                <button
                  onClick={() => setSheetOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-[7px] text-[11px] font-medium tracking-[0.06em] uppercase border border-warm-border rounded-full text-ink bg-white"
                >
                  <AdjustmentsHorizontalIcon className="w-3 h-3" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-[#7b2d3e] text-white text-[9px] font-bold flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                <div className="ml-auto flex items-center gap-1.5">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="text-[11px] font-medium text-ink bg-white border border-warm-border rounded-[3px] px-2 py-[6px] outline-none cursor-pointer"
                  >
                    <option value="rating">Rating</option>
                    <option value="price">Price</option>
                    <option value="vintage">Vintage</option>
                    <option value="publicationDate">Date</option>
                  </select>
                  <button
                    onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
                    className="text-[11px] font-medium tracking-[0.06em] uppercase text-muted bg-white border border-warm-border rounded-[3px] px-2 py-[6px] hover:text-ink transition-colors"
                  >
                    {sortOrder === 'desc' ? '↓' : '↑'}
                  </button>
                </div>
              </div>

              {/* Active filter pills */}
              {Object.values(filters).some((v) => v !== '') && (
                <div className="mb-4 pb-3.5 border-b border-warm-border">
                  <ActiveChips filters={filters} onChange={setFilters} />
                </div>
              )}

              <WineList
                wines={wines}
                loading={loading}
                onSelect={setSelectedWine}
              />
              <div ref={sentinelRef} className="h-1" />
              {loadingMore && (
                <p className="text-center text-sm text-muted py-4">Loading more…</p>
              )}
              {!hasMore && wines.length > 0 && (
                <p className="text-center text-sm text-muted py-4">All {wines.length} results shown</p>
              )}
            </main>
          </div>

          {/* Mobile bottom sheet */}
          <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
            <Sidebar meta={meta} filters={filters} onChange={setFilters} />
          </BottomSheet>
        </>
      )}

      {/* Chat tab */}
      {activeTab === 'chat' && (
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Chat
            messages={chatMessages}
            loading={chatLoading}
            onSend={handleChatSend}
          />
        </div>
      )}

      <WineDetail wine={selectedWine} onClose={() => setSelectedWine(null)} />
    </div>
  );
}
