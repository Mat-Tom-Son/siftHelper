import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SiftClient, type PersonBase, type SearchResponse, type FieldMeta } from './sift_client';
import { ChatbotSiftClient, type PersonSummary } from './chatbot_sift_client';

function jsonResponse(body: any, init?: ResponseInit) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
}

describe('ChatbotSiftClient', () => {
  const baseUrl = 'https://api.justsift.com/v1';
  const dataToken = 'fake-data-token';
  const mediaToken = 'fake-media-token';

  let calls: Array<{ method: string; url: string; body?: any }>;
  let chatbot: ChatbotSiftClient;

  beforeEach(() => {
    calls = [];
    
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || 'GET').toUpperCase();
      
      let reqBody: any = undefined;
      if (init?.body && typeof init.body === 'string') {
        try { reqBody = JSON.parse(init.body); } catch { reqBody = init.body; }
      }
      calls.push({ method, url, body: reqBody });

      // Mock responses based on URL patterns
      if (url.includes('/people/john%40company.com') || url.includes('/people/john@company.com')) {
        return jsonResponse({ data: { 
          id: 'john123', 
          primaryEmail: 'john@company.com', 
          displayName: 'John Doe',
          title: 'Software Engineer',
          teamLeaderId: 'manager123',
          reportingPath: ['ceo123', 'vp123', 'manager123'],
          department: 'Engineering'
        }});
      }
      
      if (url.includes('/people/manager123')) {
        return jsonResponse({ data: { 
          id: 'manager123', 
          primaryEmail: 'manager@company.com', 
          displayName: 'Jane Manager',
          title: 'Engineering Manager',
          directReportCount: 5,
          reportingPath: ['ceo123', 'vp123']
        }});
      }

      if (url.includes('/search/people') && method === 'POST') {
        const filter = reqBody?.filter;
        if (filter?.field === 'teamLeaderId' && filter?.value === 'manager123') {
          return jsonResponse({ 
            data: [
              { id: 'john123', displayName: 'John Doe', teamLeaderId: 'manager123' },
              { id: 'alice123', displayName: 'Alice Smith', teamLeaderId: 'manager123' }
            ]
          });
        }
        if (filter?.field === 'department' && filter?.value === 'Engineering') {
          return jsonResponse({ 
            data: [
              { id: 'john123', displayName: 'John Doe', department: 'Engineering', directReportCount: 0 },
              { id: 'manager123', displayName: 'Jane Manager', department: 'Engineering', directReportCount: 5 }
            ]
          });
        }
        if (reqBody?.q === 'product manager') {
          return jsonResponse({ 
            data: [
              { id: 'pm123', displayName: 'Product Manager', title: 'Senior Product Manager' }
            ]
          });
        }
        // Handle findManagersInDepartment case (empty query with department filter and minReports)
        if (reqBody?.q === '' && filter?.and) {
          const deptFilter = filter.and.find((f: any) => f.field === 'department');
          const reportsFilter = filter.and.find((f: any) => f.field === 'directReportCount');
          if (deptFilter?.value === 'Engineering' && reportsFilter?.comparison === 'gte') {
            return jsonResponse({ 
              data: [
                { id: 'manager123', displayName: 'Jane Manager', department: 'Engineering', directReportCount: 5 }
              ]
            });
          }
        }
      }

      if (url.includes('/fields/person')) {
        return jsonResponse({ data: [
          { objectKey: 'department', name: 'Department', type: 'string', filterable: true },
          { objectKey: 'teamLeaderId', name: 'Manager', type: 'string', filterable: true }
        ]});
      }

      throw new Error(`No mock for ${method} ${url}`);
    }) as unknown as typeof fetch;

    const siftClient = new SiftClient({ dataToken, mediaToken, baseUrl, fetchImpl });
    chatbot = new ChatbotSiftClient(siftClient);
  });

  describe('Person lookup methods', () => {
    it('findPersonByEmail enriches person data', async () => {
      const person = await chatbot.findPersonByEmail('john@company.com');
      
      expect(person.id).toBe('john123');
      expect(person.displayName).toBe('John Doe');
      expect(person.level).toBe(3); // derived from reportingPath length
      expect(person.departmentName).toBe('Engineering');
      expect(person.managerName).toBe('Jane Manager');
    });

    it('getPersonsManager returns manager info', async () => {
      const manager = await chatbot.getPersonsManager('john@company.com');
      
      expect(manager?.id).toBe('manager123');
      expect(manager?.displayName).toBe('Jane Manager');
      expect(manager?.level).toBe(2);
    });

    it('whoIsManager returns natural language response', async () => {
      const response = await chatbot.whoIsManager('john@company.com');
      expect(response).toContain('Jane Manager');
      expect(response).toContain('Engineering Manager');
    });
  });

  describe('Team analysis methods', () => {
    it('getDirectReports returns enriched team members', async () => {
      const reports = await chatbot.getDirectReports('manager123');
      
      expect(reports).toHaveLength(2);
      expect(reports[0].displayName).toBe('John Doe');
      expect(reports[1].displayName).toBe('Alice Smith');
    });

    it('whoReportsTo returns natural language response', async () => {
      const response = await chatbot.whoReportsTo('manager123');
      expect(response).toContain('2 people report');
      expect(response).toContain('John Doe');
      expect(response).toContain('Alice Smith');
    });
  });

  describe('Search methods', () => {
    it('findPeopleByRole searches with query', async () => {
      const results = await chatbot.findPeopleByRole('product manager');
      
      expect(results).toHaveLength(1);
      expect(results[0].displayName).toBe('Product Manager');
      expect(results[0].title).toBe('Senior Product Manager');
    });

    it('findManagersInDepartment filters by department and reports', async () => {
      const managers = await chatbot.findManagersInDepartment('Engineering');
      
      expect(managers).toHaveLength(1);
      expect(managers[0].displayName).toBe('Jane Manager');
      expect(managers[0].directReportCount).toBe(5);
    });
  });

  describe('Analytics methods', () => {
    it('getDepartmentSummary calculates department stats', async () => {
      const summary = await chatbot.getDepartmentSummary('Engineering');
      
      expect(summary.name).toBe('Engineering');
      expect(summary.headCount).toBe(2);
      expect(summary.managerCount).toBe(1);
      expect(summary.avgTeamSize).toBe(5);
    });

    it('whoWorksInDepartment returns natural language response', async () => {
      const response = await chatbot.whoWorksInDepartment('Engineering');
      expect(response).toContain('Engineering department');
      expect(response).toContain('2 people');
      expect(response).toContain('1 managers');
    });
  });

  describe('Convenience methods', () => {
    it('handles person with no manager gracefully', async () => {
      // Mock a person with no teamLeaderId
      const fetchImpl = vi.fn(async () => {
        return jsonResponse({ data: { 
          id: 'ceo123', 
          primaryEmail: 'ceo@company.com', 
          displayName: 'CEO',
          teamLeaderId: null
        }});
      }) as unknown as typeof fetch;

      const siftClient = new SiftClient({ dataToken, mediaToken, baseUrl, fetchImpl });
      const testChatbot = new ChatbotSiftClient(siftClient);
      
      const response = await testChatbot.whoIsManager('ceo@company.com');
      expect(response).toBe("This person doesn't have a manager listed.");
    });

    it('handles person with no reports gracefully', async () => {
      const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/search/people')) {
          return jsonResponse({ data: [] });
        }
        return jsonResponse({ data: { id: 'ic123', displayName: 'Individual Contributor' }});
      }) as unknown as typeof fetch;

      const siftClient = new SiftClient({ dataToken, mediaToken, baseUrl, fetchImpl });
      const testChatbot = new ChatbotSiftClient(siftClient);
      
      const response = await testChatbot.whoReportsTo('ic123');
      expect(response).toBe("This person has no direct reports.");
    });
  });
});
