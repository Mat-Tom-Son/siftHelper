import { SiftClient, type PersonBase, type FieldMeta } from './sift_client.js';
import { type PersonWithSkills, type SkillsSuggestion } from './skills_client.js';
export interface PersonSummary extends PersonBase {
    level?: number;
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
    largestSubteam: {
        manager: PersonSummary;
        size: number;
    };
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
export declare class ChatbotSiftClient {
    private client;
    private skillsClient;
    private fieldsCache;
    constructor(client: SiftClient);
    /** Find a person by their email address or ID with enriched information */
    findPersonByEmail(email: string, includePhoto?: boolean): Promise<PersonSummary>;
    /** Get someone's direct manager */
    getPersonsManager(personEmailOrId: string, includePhoto?: boolean): Promise<PersonSummary | null>;
    /** Get the full chain of managers above someone (their reporting line) */
    getReportingChain(personEmailOrId: string, includeSelf?: boolean, includePhotos?: boolean): Promise<PersonSummary[]>;
    /** Get all people who report directly to a manager */
    getDirectReports(managerEmailOrId: string, includePhotos?: boolean): Promise<PersonSummary[]>;
    /** Get detailed insights about a manager's team */
    getTeamInsights(managerEmailOrId: string): Promise<TeamInsights>;
    /** Get the complete organizational tree under a manager */
    getCompleteOrgTree(managerEmailOrId: string, maxDepth?: number, includePhotos?: boolean): Promise<{
        manager: PersonSummary;
        allTeamMembers: PersonSummary[];
        totalSize: number;
        orgChart: {
            nodes: PersonSummary[];
            edges: Array<{
                from: string;
                to: string;
            }>;
        };
    }>;
    /** Find people by their job title or role */
    findPeopleByRole(roleKeywords: string, options?: OrgSearchOptions): Promise<PersonSummary[]>;
    /** Find all managers in a specific department */
    findManagersInDepartment(departmentName: string, includePhotos?: boolean): Promise<PersonSummary[]>;
    /** Find people in a specific office location */
    findPeopleInOffice(officeName: string, includePhotos?: boolean): Promise<PersonSummary[]>;
    /** Search for people using natural language query */
    searchPeopleByQuery(query: string, options?: OrgSearchOptions): Promise<PersonSummary[]>;
    /** Get summary statistics for a department */
    getDepartmentSummary(departmentName: string): Promise<DepartmentSummary>;
    /** Get list of all departments in the organization */
    getAllDepartments(): Promise<string[]>;
    /** Get available fields and their metadata for this Sift instance */
    getAvailableFields(): Promise<FieldMeta[]>;
    private findPeopleInDepartment;
    private enrichPersonData;
    /** Answer "Who is X's manager?" */
    whoIsManager(personEmailOrId: string): Promise<string>;
    /** Answer "Who reports to X?" */
    whoReportsTo(managerEmailOrId: string): Promise<string>;
    /** Answer "How big is X's team?" */
    howBigIsTeam(managerEmailOrId: string): Promise<string>;
    /** Answer "Who works in X department?" */
    whoWorksInDepartment(departmentName: string): Promise<string>;
    /** Find people with specific skills */
    findPeopleWithSkills(skills: string[], options?: {
        requireAll?: boolean;
        minLevel?: number;
        department?: string;
        featuredOnly?: boolean;
        limit?: number;
    }): Promise<PersonWithSkills[]>;
    /** Get skill suggestions for autocomplete */
    getSkillSuggestions(query?: string, limit?: number): Promise<SkillsSuggestion[]>;
    /** Find people with similar skills to a given person */
    findPeopleWithSimilarSkills(personEmailOrId: string, limit?: number): Promise<PersonWithSkills[]>;
    /** Get organization-wide skills analytics */
    getSkillsAnalytics(department?: string): Promise<{
        topSkills: Array<{
            skill: string;
            count: number;
            avgLevel: number;
        }>;
        skillsByDepartment: Map<string, string[]>;
        totalPeopleWithSkills: number;
    }>;
    /** Answer "Who knows React?" */
    whoKnowsSkill(skill: string, department?: string): Promise<string>;
    /** Answer "What skills does X have?" */
    whatSkillsDoesPersonHave(personEmailOrId: string): Promise<string>;
    /** Answer "Who are the React experts?" */
    whoAreTheExperts(skill: string, department?: string): Promise<string>;
}
