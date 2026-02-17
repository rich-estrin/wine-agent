import { useState, useEffect, useCallback } from 'react';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import type { Wine, Meta } from './types';
import type { SearchParams, ChatMessage } from './api';
import { searchWines, fetchMeta, sendChatMessage } from './api';
import SearchBar from './components/SearchBar';
import FilterPanel, {
  type Filters,
  emptyFilters,
  getDateFilter,
} from './components/FilterPanel';
import WineList from './components/WineList';
import WineDetail from './components/WineDetail';
import Chat from './components/Chat';
import Header from './components/Header';

export default function App() {
  const [wines, setWines] = useState<Wine[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sortBy, setSortBy] = useState('rating');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedWine, setSelectedWine] = useState<Wine | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Fetch meta on mount
  useEffect(() => {
    fetchMeta().then(setMeta).catch(console.error);
  }, []);

  // Build search params from current state
  const buildParams = useCallback((): SearchParams => {
    const params: SearchParams = {
      limit: 40,
      sort_by: sortBy,
      sort_order: sortOrder,
    };
    if (query.trim()) params.q = query.trim();
    if (filters.mainVarietal) params.mainVarietal = filters.mainVarietal;
    if (filters.region) params.region = filters.region;
    if (filters.type) params.type = filters.type;
    if (filters.priceMax) params.price = `<${filters.priceMax}`;
    if (filters.ratingMin) params.rating = `>=${filters.ratingMin}`;
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

  // Debounced search
  useEffect(() => {
    const params = buildParams();
    const hasSearchCriteria = params.q || Object.keys(params).some(
      (k) => !['limit', 'sort_by', 'sort_order'].includes(k)
    );

    if (!hasSearchCriteria) {
      if (initialLoad) {
        // Load top-rated wines on first load
        setLoading(true);
        searchWines({ limit: 40, sort_by: 'rating', sort_order: 'desc' })
          .then(setWines)
          .catch(console.error)
          .finally(() => {
            setLoading(false);
            setInitialLoad(false);
          });
      }
      return;
    }

    setInitialLoad(false);
    const timer = setTimeout(() => {
      setLoading(true);
      searchWines(params)
        .then(setWines)
        .catch(console.error)
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [buildParams, initialLoad]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-5xl mx-auto px-3 md:px-4 py-4 md:py-8">

      <TabGroup>
        <TabList className="flex space-x-1 rounded-lg bg-[#141617] p-1 mb-4 md:mb-6 border border-[#434549]">
          <Tab className="w-full rounded-lg py-2 md:py-2.5 text-xs md:text-sm font-medium leading-5 text-[#deb77d] focus:outline-none data-[selected]:bg-[#bd2a29] data-[selected]:text-white data-[selected]:shadow data-[hover]:bg-[#434549]">
            Search
          </Tab>
          <Tab className="w-full rounded-lg py-2 md:py-2.5 text-xs md:text-sm font-medium leading-5 text-[#deb77d] focus:outline-none data-[selected]:bg-[#bd2a29] data-[selected]:text-white data-[selected]:shadow data-[hover]:bg-[#434549]">
            Chat
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <div className="space-y-3 md:space-y-4 mb-4 md:mb-6">
              <SearchBar value={query} onChange={setQuery} />
              <FilterPanel
                meta={meta}
                filters={filters}
                onChange={setFilters}
              />
              <div className="flex items-center gap-3 text-sm">
                <label className="text-gray-500">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="rating">Rating</option>
                  <option value="price">Price</option>
                  <option value="vintage">Vintage</option>
                  <option value="publicationDate">Publication Date</option>
                </select>
                <button
                  onClick={() =>
                    setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
                  }
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {sortOrder === 'desc' ? 'Highest first' : 'Lowest first'}
                </button>
              </div>
            </div>

            <WineList
              wines={wines}
              loading={loading}
              onSelect={setSelectedWine}
            />
          </TabPanel>
          <TabPanel>
            <Chat
              messages={chatMessages}
              loading={chatLoading}
              onSend={handleChatSend}
            />
          </TabPanel>
        </TabPanels>
      </TabGroup>

      <WineDetail wine={selectedWine} onClose={() => setSelectedWine(null)} />
      </div>
    </div>
  );
}
