import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SiftClient, type PersonBase, type SearchResponse, type FieldMeta } from './sift_client';

function jsonResponse(body: any, init?: ResponseInit) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
}

describe('SiftClient (unit, mocked fetch)', () => {
  const baseUrl = 'https://api.justsift.com/v1';
  const dataToken = 'fake-data-token';
  const mediaToken = 'fake-media-token';

  let calls: Array<{ method: string; url: string; body?: any; headers?: any }>; 

  beforeEach(() => {
    calls = [];
  });

  function makeClientWithMock(routes: Record<string, (req: Request) => Promise<Response> | Response>) {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || 'GET').toUpperCase();
      const key = `${method} ${url}`;
      const handler = routes[key];

      // Track calls
      let reqBody: any = undefined;
      if (init?.body && typeof init.body === 'string') {
        try { reqBody = JSON.parse(init.body); } catch { reqBody = init.body; }
      }
      calls.push({ method, url, body: reqBody, headers: init?.headers });

      if (!handler) {
        throw new Error(`No mock for ${key}`);
      }
      const req = new Request(url, init);
      return handler(req);
    }) as unknown as typeof fetch;

    return new SiftClient({ dataToken, mediaToken, baseUrl, fetchImpl });
  }

  it('getPerson calls correct endpoint and returns JSON', async () => {
    const person: PersonBase = { id: 'p1', primaryEmail: 'a@b.com', displayName: 'A' };
    const routes = {
      [`GET ${baseUrl}/people/p1`]: () => jsonResponse({ data: person }),
    };
    const client = makeClientWithMock(routes);

    const got = await client.getPerson('p1');
    expect(got).toEqual(person);
    expect(calls[0].headers['Authorization'] || (calls[0].headers.get && calls[0].headers.get('Authorization'))).toContain(dataToken);
  });

  it('search pagination via getDirectReports + followSearchNext dedupes by id', async () => {
    const page1: SearchResponse<PersonBase> = {
      data: [
        { id: 'a', teamLeaderId: 'mgr' },
        { id: 'b', teamLeaderId: 'mgr' },
      ],
      links: { next: `${baseUrl}/search/people?page=2` },
    };
    const page2: SearchResponse<PersonBase> = {
      data: [
        { id: 'b', teamLeaderId: 'mgr' }, // duplicate
        { id: 'c', teamLeaderId: 'mgr' },
      ],
    };

    const routes: Record<string, (req: Request) => Response> = {
      [`POST ${baseUrl}/search/people`]: () => jsonResponse(page1),
      [`GET ${baseUrl}/search/people?page=2`]: () => jsonResponse(page2),
    };
    const client = makeClientWithMock(routes);

    const drs = await client.getDirectReports('mgr', 2);
    const ids = drs.map(p => p.id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('makeMediaUrl builds URL and can embed token in query', () => {
    const client = makeClientWithMock({});
    const url = client.makeMediaUrl('p1', 'profile-photo', { preferredType: 'official', height: 128, tokenInQuery: true });
    expect(url).toContain(`${baseUrl}/media/people/p1/profile-photo`);
    expect(url).toContain('preferredType=official');
    expect(url).toContain('height=128');
    expect(url).toContain(`token=${mediaToken}`);
  });

  it('getFields caches within TTL and refreshes when forced', async () => {
    const fields1: FieldMeta[] = [ { objectKey: 'department', name: 'Department', type: 'string' } ];
    const fields2: FieldMeta[] = [ { objectKey: 'teamLeaderId', name: 'Leader', type: 'string' } ];

    let servedSecond = false;
    const routes: Record<string, (req: Request) => Response> = {
      [`GET ${baseUrl}/fields/person`]: () => {
        if (!servedSecond) return jsonResponse({ data: fields1 });
        return jsonResponse({ data: fields2 });
      },
    };

    const client = makeClientWithMock(routes);
    const a = await client.getFields();
    const b = await client.getFields();
    expect(a).toEqual(fields1);
    expect(b).toEqual(fields1); // cached
    expect(calls.filter(c => c.url.endsWith('/fields/person')).length).toBe(1);

    servedSecond = true;
    const c = await client.getFields(true); // force refresh
    expect(c).toEqual(fields2);
    expect(calls.filter(c => c.url.endsWith('/fields/person')).length).toBe(2);
  });

  it('getOrgChain returns leader chain and supports includeSelf', async () => {
    const person = { id: 'p1', reportingPath: ['l1', 'l2'] } as any;
    const leader1 = { id: 'l1', displayName: 'Leader 1' } as any;
    const leader2 = { id: 'l2', displayName: 'Leader 2' } as any;

    const routes: Record<string, (req: Request) => Response> = {
      [`GET ${baseUrl}/people/p1`]: () => jsonResponse({ data: person }),
      [`GET ${baseUrl}/people/l1`]: () => jsonResponse({ data: leader1 }),
      [`GET ${baseUrl}/people/l2`]: () => jsonResponse({ data: leader2 }),
    };

    const client = makeClientWithMock(routes);
    const chain = await client.getOrgChain('p1');
    expect(chain.map(p => p.id)).toEqual(['l1', 'l2']);

    const chainWithSelf = await client.getOrgChain('p1', true);
    expect(chainWithSelf.map(p => p.id)).toEqual(['l1', 'l2', 'p1']);
  });
});
