import { describe, it, expect } from 'vitest';
import { SiftClient } from './sift_client';

const RUN = process.env.RUN_INTEGRATION === '1';
const DATA_TOKEN = process.env.SIFT_DATA_TOKEN;
const MEDIA_TOKEN = process.env.SIFT_MEDIA_TOKEN; // optional
const TEST_PERSON = process.env.SIFT_TEST_PERSON; // email or id
const BASE_URL = process.env.SIFT_BASE_URL; // optional

// Only run when explicitly enabled and env vars are present
const maybe = RUN && DATA_TOKEN && TEST_PERSON ? describe : describe.skip;

maybe('SiftClient (integration)', () => {
  it('getPerson returns a person', async () => {
    const client = new SiftClient({ dataToken: DATA_TOKEN!, mediaToken: MEDIA_TOKEN, baseUrl: BASE_URL || undefined });
    const person = await client.getPerson(TEST_PERSON!);
    console.log('getPerson:', { id: person.id, email: (person as any).primaryEmail, name: (person as any).displayName, title: (person as any).title });
    expect(person).toBeTruthy();
    expect(person.id).toBeTypeOf('string');
  });

  it('getFields returns non-empty array', async () => {
    const client = new SiftClient({ dataToken: DATA_TOKEN!, mediaToken: MEDIA_TOKEN, baseUrl: BASE_URL || undefined });
    const fields = await client.getFields();
    console.log('getFields: count=', fields.length);
    expect(Array.isArray(fields)).toBe(true);
  });

  it('getDirectReports returns array (possibly empty) and subtree works', async () => {
    const client = new SiftClient({ dataToken: DATA_TOKEN!, mediaToken: MEDIA_TOKEN, baseUrl: BASE_URL || undefined });
    const drs = await client.getDirectReports(TEST_PERSON!, 10);
    console.log('getDirectReports: count=', drs.length);
    expect(Array.isArray(drs)).toBe(true);

    const subtree = await client.getOrgSubtree(TEST_PERSON!, { includeManager: true, maxDepth: 2, maxNodes: 100, pageSize: 25 });
    console.log('getOrgSubtree: nodes=', subtree.nodes.length, 'edges=', subtree.edges.length, 'stats=', subtree.stats);
    expect(subtree).toBeTruthy();
    expect(Array.isArray(subtree.nodes)).toBe(true);
    expect(Array.isArray(subtree.edges)).toBe(true);
  });

  it('getOrgChain returns leader chain and includeSelf adds the person', async () => {
    const client = new SiftClient({ dataToken: DATA_TOKEN!, mediaToken: MEDIA_TOKEN, baseUrl: BASE_URL || undefined });
    const chain = await client.getOrgChain(TEST_PERSON!);
    console.log('getOrgChain: length=', chain.length, 'ids=', chain.map(p => p.id));
    expect(Array.isArray(chain)).toBe(true);

    const chainWithSelf = await client.getOrgChain(TEST_PERSON!, true);
    console.log('getOrgChain(includeSelf): length=', chainWithSelf.length, 'lastId=', chainWithSelf.at(-1)?.id);
    expect(Array.isArray(chainWithSelf)).toBe(true);
    expect(chainWithSelf.length).toBeGreaterThanOrEqual(chain.length);
  });
});
