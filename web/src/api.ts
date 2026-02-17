import type { Wine, Meta } from './types';

const BASE = './api';

export interface SearchParams {
  q?: string;
  mainVarietal?: string;
  region?: string;
  type?: string;
  price?: string;
  rating?: string;
  vintage?: string;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export async function searchWines(params: SearchParams): Promise<Wine[]> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  }
  const res = await fetch(`${BASE}/search?${searchParams}`);
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  return res.json();
}

export async function fetchMeta(): Promise<Meta> {
  const res = await fetch(`${BASE}/meta`);
  if (!res.ok) throw new Error(`Meta failed: ${res.statusText}`);
  return res.json();
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChatMessage(
  messages: ChatMessage[]
): Promise<string> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Chat failed: ${res.statusText}`);
  }
  const data = await res.json();
  return data.message;
}
