// Chatbot-friendly wrapper for SiftClient with descriptive, natural language methods
// -------------------------------------------------------------------------------
// This wrapper provides intuitive method names and common organizational queries
// that are easy for chatbots to understand and use in conversation.

import { SiftClient, type PersonBase, type FieldMeta, type SearchPostBody, type OrgSubtreeResult } from './sift_client.js';
import { SkillsClient, type PersonWithSkills, type SkillsSearchOptions, type SkillsSuggestion } from './skills_client.js';

export interface PersonSummary extends PersonBase {
  level?: number; // derived from reportingPath length
  departmentName?: string;
  officeName?: string;
  managerName?: string;
  photoUrl?: string;
}

export interface DepartmentSummary {
  name: string;
  headCount: number;
  managerCount: number;
  avgTeamSize: number;
  maxReportingLevels: number;
  topManager?: PersonSummary;
}

export interface TeamInsights {
  manager: PersonSummary;
  directReports: PersonSummary[];
  totalTeamSize: number;
  teamDepth: number;
  avgSpanOfControl: number;
  largestSubteam: { manager: PersonSummary; size: number };
}

export interface OrgSearchOptions {
  department?: string;
  office?: string;
  title?: string;
  minReports?: number;
  maxReports?: number;
  includePhotos?: boolean;
  limit?: number;
}

export class ChatbotSiftClient {
  private client: SiftClient;
  private skillsClient: SkillsClient;
  private fieldsCache: FieldMeta[] | null = null;

  constructor(client: SiftClient) {
    this.client = client;
    this.skillsClient = new SkillsClient(client);
  }

  // -----------------------------
  // Person lookup methods
  // -----------------------------

  /** Find a person by their email address or ID with enriched information */
  async findPersonByEmail(email: string, includePhoto = false): Promise<PersonSummary> {
    const person = await this.client.getPerson<PersonBase>(email);
    return this.enrichPersonData(person, includePhoto);
  }

  /** Get someone's direct manager */
  async getPersonsManager(personEmailOrId: string, includePhoto = false): Promise<PersonSummary | null> {
    const person = await this.client.getPerson<PersonBase>(personEmailOrId);
    if (!person.teamLeaderId) return null;
    
    const manager = await this.client.getPerson<PersonBase>(person.teamLeaderId);
    return this.enrichPersonData(manager, includePhoto);
  }

  /** Get the full chain of managers above someone (their reporting line) */
  async getReportingChain(personEmailOrId: string, includeSelf = false, includePhotos = false): Promise<PersonSummary[]> {
    const chain = await this.client.getOrgChain<PersonBase>(personEmailOrId, includeSelf);
    return Promise.all(chain.map(person => this.enrichPersonData(person, includePhotos)));
  }

  // -----------------------------
  // Team and org structure methods
  // -----------------------------

  /** Get all people who report directly to a manager */
  async getDirectReports(managerEmailOrId: string, includePhotos = false): Promise<PersonSummary[]> {
    const reports = await this.client.getDirectReports<PersonBase>(managerEmailOrId);
    return Promise.all(reports.map(person => this.enrichPersonData(person, includePhotos)));
  }

  /** Get detailed insights about a manager's team */
  async getTeamInsights(managerEmailOrId: string): Promise<TeamInsights> {
    const manager = await this.client.getPerson<PersonBase>(managerEmailOrId);
    const enrichedManager = await this.enrichPersonData(manager, true);
    
    const subtree = await this.client.getOrgSubtree<PersonBase>(manager.id, { 
      includeManager: false, 
      maxDepth: 10, 
      maxNodes: 1000 
    });

    const directReports = await this.getDirectReports(manager.id, true);
    
    // Calculate team depth
    const teamDepth = Math.max(...subtree.nodes.map(p => (p.reportingPath?.length || 0) - (manager.reportingPath?.length || 0)));
    
    // Calculate average span of control for managers in the team
    const managersInTeam = subtree.nodes.filter(p => (p.directReportCount || 0) > 0);
    const avgSpanOfControl = managersInTeam.length > 0 
      ? managersInTeam.reduce((sum, m) => sum + (m.directReportCount || 0), 0) / managersInTeam.length 
      : 0;

    // Find largest subteam
    let largestSubteam = { manager: enrichedManager, size: subtree.nodes.length };
    for (const node of managersInTeam) {
      const nodeSize = node.totalReportCount || 0;
      if (nodeSize > largestSubteam.size) {
        largestSubteam = { 
          manager: await this.enrichPersonData(node, true), 
          size: nodeSize 
        };
      }
    }

    return {
      manager: enrichedManager,
      directReports,
      totalTeamSize: subtree.nodes.length,
      teamDepth,
      avgSpanOfControl,
      largestSubteam
    };
  }

  /** Get the complete organizational tree under a manager */
  async getCompleteOrgTree(managerEmailOrId: string, maxDepth = 5, includePhotos = false): Promise<{
    manager: PersonSummary;
    allTeamMembers: PersonSummary[];
    totalSize: number;
    orgChart: { nodes: PersonSummary[]; edges: Array<{ from: string; to: string }> };
  }> {
    const subtree = await this.client.getOrgSubtree<PersonBase>(managerEmailOrId, { 
      includeManager: true, 
      maxDepth, 
      maxNodes: 2000 
    });

    const enrichedNodes = await Promise.all(
      subtree.nodes.map(person => this.enrichPersonData(person, includePhotos))
    );

    const manager = enrichedNodes.find(p => p.id === subtree.manager?.id);
    const allTeamMembers = enrichedNodes.filter(p => p.id !== subtree.manager?.id);

    const edges = subtree.edges.map(edge => ({
      from: edge.leaderId || '',
      to: edge.personId
    })).filter(edge => edge.from); // Remove edges with null leaders

    return {
      manager: manager!,
      allTeamMembers,
      totalSize: enrichedNodes.length,
      orgChart: { nodes: enrichedNodes, edges }
    };
  }

  // -----------------------------
  // Search and discovery methods
  // -----------------------------

  /** Find people by their job title or role */
  async findPeopleByRole(roleKeywords: string, options: OrgSearchOptions = {}): Promise<PersonSummary[]> {
    const searchBody: SearchPostBody = {
      q: roleKeywords,
      pageSize: Math.min(options.limit || 50, 100),
      sortBy: 'displayName',
      sortDirection: 'asc'
    };

    // Add filters if specified
    const filters: any[] = [];
    if (options.department) {
      filters.push({ field: 'department', comparison: 'eq', value: options.department });
    }
    if (options.office) {
      filters.push({ field: 'officeCity', comparison: 'eq', value: options.office });
    }
    if (options.minReports !== undefined) {
      filters.push({ field: 'directReportCount', comparison: 'gte', value: options.minReports });
    }
    if (options.maxReports !== undefined) {
      filters.push({ field: 'directReportCount', comparison: 'lte', value: options.maxReports });
    }

    if (filters.length > 0) {
      searchBody.filter = filters.length === 1 ? filters[0] : { and: filters };
    }

    const response = await this.client.searchPeoplePost<PersonBase>(searchBody);
    return Promise.all(response.data.map(person => this.enrichPersonData(person, options.includePhotos)));
  }

  /** Find all managers in a specific department */
  async findManagersInDepartment(departmentName: string, includePhotos = false): Promise<PersonSummary[]> {
    return this.findPeopleByRole('', {
      department: departmentName,
      minReports: 1,
      includePhotos,
      limit: 100
    });
  }

  /** Find people in a specific office location */
  async findPeopleInOffice(officeName: string, includePhotos = false): Promise<PersonSummary[]> {
    const response = await this.client.searchPeoplePost<PersonBase>({
      pageSize: 100,
      sortBy: 'displayName',
      sortDirection: 'asc',
      filter: { field: 'officeCity', comparison: 'eq', value: officeName }
    });

    return Promise.all(response.data.map(person => this.enrichPersonData(person, includePhotos)));
  }

  /** Search for people using natural language query */
  async searchPeopleByQuery(query: string, options: OrgSearchOptions = {}): Promise<PersonSummary[]> {
    return this.findPeopleByRole(query, options);
  }

  // -----------------------------
  // Organizational analytics
  // -----------------------------

  /** Get summary statistics for a department */
  async getDepartmentSummary(departmentName: string): Promise<DepartmentSummary> {
    const people = await this.findPeopleInDepartment(departmentName);
    const managers = people.filter(p => (p.directReportCount || 0) > 0);
    
    const totalReports = managers.reduce((sum, m) => sum + (m.directReportCount || 0), 0);
    const avgTeamSize = managers.length > 0 ? totalReports / managers.length : 0;
    
    const levels = people.map(p => p.level || 0);
    const maxReportingLevels = Math.max(...levels) - Math.min(...levels);

    // Find top manager (person with shortest reporting path)
    const topManager = people.reduce((top, person) => {
      const personLevel = person.level || 0;
      const topLevel = top?.level || Infinity;
      return personLevel < topLevel ? person : top;
    }, null as PersonSummary | null);

    return {
      name: departmentName,
      headCount: people.length,
      managerCount: managers.length,
      avgTeamSize,
      maxReportingLevels,
      topManager: topManager || undefined
    };
  }

  /** Get list of all departments in the organization */
  async getAllDepartments(): Promise<string[]> {
    const fields = await this.getAvailableFields();
    const deptField = fields.find(f => f.objectKey === 'department');
    
    if (!deptField?.filterable) {
      throw new Error('Department field is not filterable in this Sift instance');
    }

    // Get a large sample of people to extract unique departments
    const response = await this.client.searchPeopleGet<PersonBase>({ pageSize: 100 });
    const departments = new Set<string>();
    
    response.data.forEach(person => {
      const dept = (person as any).department;
      if (dept && typeof dept === 'string') {
        departments.add(dept);
      }
    });

    return Array.from(departments).sort();
  }

  /** Get available fields and their metadata for this Sift instance */
  async getAvailableFields(): Promise<FieldMeta[]> {
    if (!this.fieldsCache) {
      this.fieldsCache = await this.client.getFields();
    }
    return this.fieldsCache;
  }

  // -----------------------------
  // Helper methods
  // -----------------------------

  private async findPeopleInDepartment(departmentName: string): Promise<PersonSummary[]> {
    const response = await this.client.searchPeoplePost<PersonBase>({
      pageSize: 100,
      sortBy: 'displayName',
      sortDirection: 'asc',
      filter: { field: 'department', comparison: 'eq', value: departmentName }
    });

    return Promise.all(response.data.map(person => this.enrichPersonData(person, false)));
  }

  private async enrichPersonData(person: PersonBase, includePhoto = false): Promise<PersonSummary> {
    const enriched: PersonSummary = { ...person };
    
    // Calculate level from reporting path
    enriched.level = person.reportingPath?.length || 0;
    
    // Extract common fields with fallbacks
    enriched.departmentName = (person as any).department || undefined;
    enriched.officeName = (person as any).officeCity || (person as any).office || undefined;
    
    // Get manager name if available
    if (person.teamLeaderId) {
      try {
        const manager = await this.client.getPerson<PersonBase>(person.teamLeaderId);
        enriched.managerName = manager.displayName || manager.primaryEmail || 'Unknown';
      } catch {
        enriched.managerName = 'Unknown';
      }
    }

    // Generate photo URL if requested
    if (includePhoto && person.primaryEmail) {
      enriched.photoUrl = this.client.makeMediaUrl(person.primaryEmail, 'profile-photo', {
        preferredType: 'official',
        height: 128,
        tokenInQuery: true
      });
    }

    return enriched;
  }

  // -----------------------------
  // Convenience methods for common chatbot queries
  // -----------------------------

  /** Answer "Who is X's manager?" */
  async whoIsManager(personEmailOrId: string): Promise<string> {
    const manager = await this.getPersonsManager(personEmailOrId);
    if (!manager) return "This person doesn't have a manager listed.";
    
    return `${manager.displayName || manager.primaryEmail}'s manager is ${manager.displayName || manager.primaryEmail}${manager.title ? ` (${manager.title})` : ''}.`;
  }

  /** Answer "Who reports to X?" */
  async whoReportsTo(managerEmailOrId: string): Promise<string> {
    const reports = await this.getDirectReports(managerEmailOrId);
    if (reports.length === 0) return "This person has no direct reports.";
    
    const names = reports.map(p => p.displayName || p.primaryEmail).slice(0, 10);
    const remaining = Math.max(0, reports.length - 10);
    
    let result = `${reports.length} people report to this manager: ${names.join(', ')}`;
    if (remaining > 0) result += ` and ${remaining} others`;
    
    return result + '.';
  }

  /** Answer "How big is X's team?" */
  async howBigIsTeam(managerEmailOrId: string): Promise<string> {
    const insights = await this.getTeamInsights(managerEmailOrId);
    return `${insights.manager.displayName || insights.manager.primaryEmail}'s team has ${insights.totalTeamSize} people total, with ${insights.directReports.length} direct reports and ${insights.teamDepth} levels of management.`;
  }

  /** Answer "Who works in X department?" */
  async whoWorksInDepartment(departmentName: string): Promise<string> {
    const summary = await this.getDepartmentSummary(departmentName);
    return `The ${departmentName} department has ${summary.headCount} people, including ${summary.managerCount} managers. The average team size is ${summary.avgTeamSize.toFixed(1)} people.`;
  }

  // -----------------------------
  // Skills-based search methods
  // -----------------------------

  /** Find people with specific skills */
  async findPeopleWithSkills(skills: string[], options: {
    requireAll?: boolean;
    minLevel?: number;
    department?: string;
    featuredOnly?: boolean;
    limit?: number;
  } = {}): Promise<PersonWithSkills[]> {
    const searchOptions: SkillsSearchOptions = {
      limit: options.limit || 10,
      department: options.department,
      minLevel: options.minLevel,
      featuredOnly: options.featuredOnly,
      sortBy: 'relevance'
    };

    if (options.requireAll) {
      searchOptions.allOf = skills;
    } else {
      searchOptions.anyOf = skills;
    }

    return this.skillsClient.findPeopleBySkills(searchOptions);
  }

  /** Get skill suggestions for autocomplete */
  async getSkillSuggestions(query?: string, limit = 10): Promise<SkillsSuggestion[]> {
    return this.skillsClient.getSkillsSuggestions(query, limit);
  }

  /** Find people with similar skills to a given person */
  async findPeopleWithSimilarSkills(personEmailOrId: string, limit = 5): Promise<PersonWithSkills[]> {
    return this.skillsClient.findSimilarSkillProfiles(personEmailOrId, limit);
  }

  /** Get organization-wide skills analytics */
  async getSkillsAnalytics(department?: string): Promise<{
    topSkills: Array<{ skill: string; count: number; avgLevel: number }>;
    skillsByDepartment: Map<string, string[]>;
    totalPeopleWithSkills: number;
  }> {
    return this.skillsClient.getSkillsAnalytics(department);
  }

  // -----------------------------
  // Convenience methods for skills queries
  // -----------------------------

  /** Answer "Who knows React?" */
  async whoKnowsSkill(skill: string, department?: string): Promise<string> {
    const results = await this.findPeopleWithSkills([skill], { 
      department, 
      limit: 10 
    });

    if (results.length === 0) {
      return `I couldn't find anyone with ${skill} skills${department ? ` in ${department}` : ''}.`;
    }

    const names = results.slice(0, 5).map(p => {
      const skillMatch = p.matchedSkills.find(s => 
        s.skill.toLowerCase().includes(skill.toLowerCase())
      );
      const level = skillMatch?.level ? ` (Level ${skillMatch.level})` : '';
      return `${p.displayName || p.primaryEmail}${level}`;
    });

    let response = `Found ${results.length} people with ${skill} skills${department ? ` in ${department}` : ''}:\n`;
    response += names.join('\n');
    if (results.length > 5) response += `\n... and ${results.length - 5} more`;

    return response;
  }

  /** Answer "What skills does X have?" */
  async whatSkillsDoesPersonHave(personEmailOrId: string): Promise<string> {
    const person = await this.client.getPerson<PersonBase>(personEmailOrId);
    const enriched = await this.skillsClient.findPeopleBySkills({
      anyOf: [], // Empty search to get person with skills data
      limit: 1
    });

    // Find the specific person in results or get their skills directly
    const personWithSkills = enriched.find(p => p.id === person.id);
    
    if (!personWithSkills || personWithSkills.matchedSkills.length === 0) {
      return `${person.displayName || person.primaryEmail} doesn't have any skills listed in their profile.`;
    }

    const skillsByLevel = personWithSkills.matchedSkills
      .sort((a, b) => (b.level || 1) - (a.level || 1))
      .slice(0, 10);

    const skillsText = skillsByLevel.map(s => {
      const level = s.level ? ` (Level ${s.level})` : '';
      const featured = s.isFeatured ? ' ⭐' : '';
      return `${s.skill}${level}${featured}`;
    }).join(', ');

    return `${person.displayName || person.primaryEmail}'s skills: ${skillsText}`;
  }

  /** Answer "Who are the React experts?" */
  async whoAreTheExperts(skill: string, department?: string): Promise<string> {
    const results = await this.findPeopleWithSkills([skill], {
      minLevel: 4, // Expert level
      department,
      limit: 10
    });

    if (results.length === 0) {
      return `I couldn't find any ${skill} experts${department ? ` in ${department}` : ''}. Try searching for intermediate level or above.`;
    }

    const experts = results.slice(0, 5).map(p => {
      const skillMatch = p.matchedSkills.find(s => 
        s.skill.toLowerCase().includes(skill.toLowerCase())
      );
      return `${p.displayName || p.primaryEmail} (Level ${skillMatch?.level || 'Unknown'})`;
    });

    let response = `Found ${results.length} ${skill} experts${department ? ` in ${department}` : ''}:\n`;
    response += experts.join('\n');
    if (results.length > 5) response += `\n... and ${results.length - 5} more`;

    return response;
  }
}
