// Lightweight TypeScript client + org-subtree helper for the Sift (JustSift) API
// -------------------------------------------------------------------------------
// Drop this file into your project (Kai) and import the class below.
// Node 18+ (global fetch) or provide a custom fetch via options.
//
// Quick start:
//   const client = new SiftClient({ dataToken: process.env.SIFT_DATA_TOKEN!, mediaToken: process.env.SIFT_MEDIA_TOKEN });
//   const jane = await client.getPerson("jane@company.com");
//   const drs = await client.getDirectReports(jane.id);
//   const tree = await client.getOrgSubtree(jane.id, { includeManager: true, maxNodes: 500 });
//   console.log(tree.stats, tree.nodes.length);
//   const photoUrl = client.makeMediaUrl(jane.id, 'profile-photo', { preferredType: 'official' });
//
// Design notes:
// - Handles Data vs Media tokens correctly (Authorization header for JSON; optional query for images).
// - Caches /fields/person with a TTL to guard against schema drift.
// - Provides both GET and POST search helpers; prefers POST for team traversal.
// - BFS for manager subtree with safety caps (maxDepth/maxNodes) and pagination (pageSize<=100).
// - Minimal, dependency-free. Small retry/backoff for 429/5xx.

export type SortDirection = 'asc' | 'desc';
export type MediaKind = 'profile-photo' | 'background-photo';
export type PreferredPhotoType = 'custom' | 'official';

export interface SiftClientOptions {
  /** Data token from Sift Admin (JSON endpoints). */
  dataToken: string;
  /** Optional Media token for image endpoints. */
  mediaToken?: string;
  /** Base URL; defaults to https://api.justsift.com/v1 */
  baseUrl?: string;
  /** Request timeout in ms for JSON endpoints. */
  timeoutMs?: number;
  /** Optional fetch implementation (e.g., cross-fetch); Node 18+ not required if provided). */
  fetchImpl?: typeof fetch;
  /** TTL for /fields/person cache in ms (default 10 minutes). */
  fieldsTtlMs?: number;
}

export interface FieldMeta {
  objectKey: string;           // e.g., "department", "teamLeaderId"
  name: string;                // display name
  type: string;                // e.g., string, number, boolean, array, etc.
  filterable?: boolean;
  searchable?: boolean;
}

export interface PersonBase {
  id: string;
  primaryEmail?: string;
  displayName?: string;
  title?: string;
  teamLeaderId?: string | null;
  directReportCount?: number;
  totalReportCount?: number;
  reportingPath?: string[]; // chain of leader IDs from root to this person
  [key: string]: unknown;   // allow org-specific custom fields
}

export interface SearchGetParams {
  q?: string;
  page?: number;         // 1-based in Sift responses; we’ll prefer cursor links
  pageSize?: number;     // max 100
  sortBy?: string;       // field objectKey
  sortDirection?: SortDirection;
  orQuery?: boolean;
  // plus exact-match filters like department=Marketing when filterable
  [key: string]: string | number | boolean | undefined;
}

// POST /search/people filter model (minimal but flexible)
export type Comparison = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'exists' | 'notExists' | 'contains';
export interface Condition {
  field: string;          // objectKey
  comparison: Comparison; // e.g., 'eq'
  value?: unknown;        // omit for exists/notExists
}
export interface BoolGroup {
  and?: (Condition | BoolGroup)[];
  or?: (Condition | BoolGroup)[];
  not?: (Condition | BoolGroup);
}
export interface SearchPostBody {
  q?: string;
  page?: number;
  pageSize?: number; // <=100
  sortBy?: string;
  sortDirection?: SortDirection;
  filter?: Condition | BoolGroup; // boolean logic
}

export interface SearchResponse<T = PersonBase> {
  data: T[];
  links?: { self?: string; next?: string; prev?: string; first?: string; last?: string };
  meta?: { page?: number; pages?: number; pageSize?: number; length?: number; totalLength?: number };
}

export interface OrgSubtreeResult<T = PersonBase> {
  manager: T | null;
  nodes: T[]; // unique set across subtree (optionally includes manager)
  edges: Array<{ leaderId: string | null; personId: string }>; // parent->child pairs
  stats: { expanded: number; enqueued: number; apiCalls: number; depthReached: number; truncated: boolean };
}

export class SiftClient {
  readonly baseUrl: string;
  readonly dataToken: string;
  readonly mediaToken?: string;
  readonly timeoutMs: number;
  private readonly _fetch: typeof fetch;

  // /fields/person cache
  private fieldsCache: { fetchedAt: number; items: FieldMeta[] } | null = null;
  private fieldsTtlMs: number;

  constructor(opts: SiftClientOptions) {
    if (!opts?.dataToken) throw new Error('SiftClient: dataToken is required');
    this.dataToken = opts.dataToken;
    this.mediaToken = opts.mediaToken;
    this.baseUrl = (opts.baseUrl || 'https://api.justsift.com/v1').replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this._fetch = opts.fetchImpl ?? (globalThis as any).fetch;
    if (!this._fetch) throw new Error('SiftClient: no fetch implementation found (provide fetchImpl or use Node 18+)');
    this.fieldsTtlMs = opts.fieldsTtlMs ?? 10 * 60 * 1000;
  }

  // -----------------------------
  // Low-level request helpers
  // -----------------------------
  private async requestJson<T>(method: 'GET' | 'POST', path: string, body?: any): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.requestJsonByUrl<T>(method, url, body);
  }

  private async requestJsonByUrl<T>(method: 'GET' | 'POST', url: string, body?: any): Promise<T> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.dataToken}`,
      'Accept': 'application/json',
    };
    let payload: BodyInit | undefined;
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body ?? {});
    }

    // small retry/backoff for 429/5xx
    let attempt = 0;
    const maxAttempts = 3;
    let lastErr: any = null;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const res = await this._fetch(url, { method, headers, body: payload, signal: ac.signal });
        if (res.status === 204) {
          clearTimeout(timer);
          return undefined as unknown as T;
        }
        if (!res.ok) {
          if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
            const retryAfter = Number(res.headers.get('retry-after')) || Math.pow(2, attempt) * 250;
            await new Promise(r => setTimeout(r, retryAfter));
            continue;
          }
          const text = await res.text().catch(() => '');
          throw new Error(`Sift ${method} ${url} failed: ${res.status} ${res.statusText} ${text}`);
        }
        const json = (await res.json()) as T;
        clearTimeout(timer);
        return json;
      } catch (err) {
        lastErr = err;
        if (attempt >= maxAttempts) {
          clearTimeout(timer);
          throw err;
        }
        // brief jittered backoff on network/abort
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 200 + Math.random() * 100));
      }
    }

    clearTimeout(timer);
    throw lastErr ?? new Error('Unknown error');
  }

  // -----------------------------
  // Core endpoints
  // -----------------------------
  async getPerson<T = PersonBase>(idOrEmail: string): Promise<T> {
    if (!idOrEmail) throw new Error('getPerson: idOrEmail is required');
    const encoded = encodeURIComponent(idOrEmail);
    const resp = await this.requestJson<{ data: T }>('GET', `/people/${encoded}`);
    return resp?.data as T;
  }

  async getFields(forceRefresh = false): Promise<FieldMeta[]> {
    const now = Date.now();
    if (!forceRefresh && this.fieldsCache && (now - this.fieldsCache.fetchedAt) < this.fieldsTtlMs) {
      return this.fieldsCache.items;
    }
    const resp = await this.requestJson<{ data: FieldMeta[] }>('GET', '/fields/person');
    const items = resp?.data ?? [];
    this.fieldsCache = { fetchedAt: now, items };
    return items;
  }

  // GET /search/people (simple; exact-match filters)
  async searchPeopleGet<T = PersonBase>(params: SearchGetParams = {}): Promise<SearchResponse<T>> {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      usp.set(k, String(v));
    }
    const query = usp.toString();
    return this.requestJson<SearchResponse<T>>('GET', `/search/people${query ? `?${query}` : ''}`);
  }

  // POST /search/people (advanced boolean filters)
  async searchPeoplePost<T = PersonBase>(body: SearchPostBody): Promise<SearchResponse<T>> {
    return this.requestJson<SearchResponse<T>>('POST', '/search/people', body);
  }

  // Follow a search "next" cursor (absolute URL) returned by Sift
  async followSearchNext<T = PersonBase>(nextUrl: string): Promise<SearchResponse<T>> {
    return this.requestJsonByUrl<SearchResponse<T>>('GET', nextUrl);
  }

  // -----------------------------
  // Convenience helpers
  // -----------------------------
  /** Build a media URL for <img src>, optionally embedding the media token as a query param. */
  makeMediaUrl(idOrEmail: string, kind: MediaKind, opts: { preferredType?: PreferredPhotoType; height?: number; width?: number; fit?: 'crop' | 'scale'; tokenInQuery?: boolean } = {}): string {
    const encoded = encodeURIComponent(idOrEmail);
    const url = new URL(`${this.baseUrl}/media/people/${encoded}/${kind}`);
    if (opts.preferredType) url.searchParams.set('preferredType', opts.preferredType);
    if (opts.height != null) url.searchParams.set('height', String(opts.height));
    if (opts.width != null) url.searchParams.set('width', String(opts.width));
    if (opts.fit) url.searchParams.set('fit', opts.fit);
    if (opts.tokenInQuery && this.mediaToken) url.searchParams.set('token', this.mediaToken);
    return url.toString();
  }

  /** One-hop direct reports using POST (does not rely on field filterability in GET). */
  async getDirectReports<T = PersonBase>(managerId: string, pageSize = 100): Promise<T[]> {
    if (!managerId) throw new Error('getDirectReports: managerId is required');
    const size = Math.min(Math.max(1, pageSize), 100);
    const out: T[] = [];
    let resp = await this.searchPeoplePost<T>({ page: 1, pageSize: size, filter: { field: 'teamLeaderId', comparison: 'eq', value: managerId } });
    out.push(...(resp.data || []));
    while (resp.links?.next) {
      resp = await this.followSearchNext<T>(resp.links.next);
      out.push(...(resp.data || []));
    }
    return dedupeById(out as any) as T[];
  }

  /** Full subtree under a manager (BFS). Uses teamLeaderId eq filter. */
  async getOrgSubtree<T extends PersonBase = PersonBase>(managerIdOrEmail: string, opts: { includeManager?: boolean; maxDepth?: number; maxNodes?: number; pageSize?: number } = {}): Promise<OrgSubtreeResult<T>> {
    const manager = await this.getPerson<T>(managerIdOrEmail).catch(() => null);
    const managerId = manager?.id ?? managerIdOrEmail; // allow caller to pass raw ID

    const maxDepth = opts.maxDepth ?? 6; // safety cap
    const maxNodes = Math.max(1, opts.maxNodes ?? 1000);
    const pageSize = Math.min(Math.max(1, opts.pageSize ?? 100), 100);

    const nodesMap = new Map<string, T>();
    const edges: Array<{ leaderId: string | null; personId: string }> = [];
    const queue: Array<{ leaderId: string | null; id: string; depth: number } > = [];
    let apiCalls = 0;

    if (opts.includeManager && manager && manager.id) {
      nodesMap.set(manager.id, manager);
    }

    queue.push({ leaderId: null, id: managerId, depth: 0 });
    let expanded = 0;
    let depthReached = 0;

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth >= maxDepth) { depthReached = Math.max(depthReached, depth); continue; }

      // fetch direct reports for this node
      apiCalls++;
      const drs = await this.getDirectReports<T>(id, pageSize);
      expanded++;
      depthReached = Math.max(depthReached, depth + 1);

      for (const p of drs) {
        edges.push({ leaderId: p.teamLeaderId ?? null, personId: p.id });
        if (!nodesMap.has(p.id)) {
          nodesMap.set(p.id, p);
          if (nodesMap.size >= maxNodes) {
            return {
              manager,
              nodes: Array.from(nodesMap.values()),
              edges,
              stats: { expanded, enqueued: nodesMap.size, apiCalls, depthReached, truncated: true },
            };
          }
          // if this person manages someone, explore next level
          const hasReports = (p.directReportCount ?? 0) > 0;
          if (hasReports) queue.push({ leaderId: p.teamLeaderId ?? null, id: p.id, depth: depth + 1 });
        }
      }
    }

    return {
      manager,
      nodes: Array.from(nodesMap.values()),
      edges,
      stats: { expanded, enqueued: nodesMap.size, apiCalls, depthReached, truncated: false },
    };
  }

  /** Resolve the chain of leaders for a person using reportingPath. */
  async getOrgChain<T extends PersonBase = PersonBase>(idOrEmail: string, includeSelf = false): Promise<T[]> {
    const person = await this.getPerson<T>(idOrEmail);
    const ids: string[] = Array.isArray(person.reportingPath) ? person.reportingPath : [];
    const unique = dedupe(ids);
    const leaders = await Promise.all(unique.map(id => this.getPerson<T>(id)));
    return includeSelf ? [...leaders, person] : leaders;
  }
}

// -----------------------------
// small utilities
// -----------------------------
function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function dedupeById<T extends { id?: string }>(arr: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const id = x.id ?? '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(x);
  }
  return out;
}

// -----------------------------
// Example: building a simple org chart payload
// -----------------------------
// You can feed the result into graph libs (e.g., @dagrejs/graphlib + dagre layout)
// or render a tree. Example usage:
//   const tree = await client.getOrgSubtree('manager@company.com', { includeManager: true });
//   const nodes = tree.nodes.map(p => ({ id: p.id, label: p.displayName || p.primaryEmail || p.id, title: p.title }));
//   const links = tree.edges.map(e => ({ source: e.leaderId, target: e.personId }));
//   // Render in your UI of choice.
