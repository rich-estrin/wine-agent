import { useState, useEffect, useCallback } from 'react';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import type { Wine, Meta } from './types';
import type { SearchParams, ChatMessage } from './api';
import { searchWines, fetchMeta, sendChatMessage } from './api';
import SearchBar from './components/SearchBar';
import FilterPanel, {
  type Filters,
  emptyFilters,
} from './components/FilterPanel';
import WineList from './components/WineList';
import WineDetail from './components/WineDetail';
import Chat from './components/Chat';

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
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Wine Search</h1>
        <p className="text-gray-500 mt-1">
          Search and filter {meta ? 'across ' : ''}
          {meta ? '3,240+ ' : ''}wine reviews
        </p>
      </header>

      <TabGroup>
        <TabList className="flex space-x-1 rounded-lg bg-indigo-100 p-1 mb-6">
          <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-indigo-700 focus:outline-none data-[selected]:bg-white data-[selected]:shadow data-[hover]:bg-white/[0.5]">
            Search
          </Tab>
          <Tab className="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-indigo-700 focus:outline-none data-[selected]:bg-white data-[selected]:shadow data-[hover]:bg-white/[0.5]">
            Chat
          </Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <div className="space-y-4 mb-6">
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
  );
}
