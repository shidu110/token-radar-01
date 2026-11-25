export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

function validDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !validDay(raw.as_of)
    || typeof raw.source !== 'string' || !Number.isSafeInteger(raw.floor_usd) || raw.floor_usd <= 0
    || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) throw new Error('Invalid snapshot shape');
  const slugs = new Set<string>();
  for (const protocol of raw.protocols) {
    if (!protocol || typeof protocol !== 'object' || typeof protocol.slug !== 'string'
      || !/^[^\s]{1,128}$/.test(protocol.slug) || slugs.has(protocol.slug)
      || typeof protocol.name !== 'string' || !protocol.name.trim()
      || !Number.isSafeInteger(protocol.tvl_usd) || protocol.tvl_usd <= 0
      || !Array.isArray(protocol.chains) || protocol.chains.some((chain: unknown) => typeof chain !== 'string')
      || (protocol.category !== null && typeof protocol.category !== 'string')
      || (protocol.change_7d !== null && !Number.isFinite(protocol.change_7d))
      || (protocol.mcap_usd !== null && !Number.isFinite(protocol.mcap_usd))
      || (protocol.listed_at !== null && !validDay(protocol.listed_at))
      || (protocol.gecko_id !== null && typeof protocol.gecko_id !== 'string')
      || (protocol.symbol !== null && typeof protocol.symbol !== 'string')) throw new Error(`Invalid snapshot protocol: ${protocol?.slug ?? 'unknown'}`);
    slugs.add(protocol.slug);
  }
  if (new Set(raw.watchlist).size !== raw.watchlist.length || raw.watchlist.some((slug: unknown) => typeof slug !== 'string' || !slugs.has(slug))) throw new Error('Invalid snapshot watchlist');
  return raw as Snapshot;
}
