import { SiftClient, type PersonBase } from './sift_client.js';
export interface SkillsSchema {
    skillsNameKey: string;
    skillsLevelKey?: string;
    skillsFeaturedKey?: string;
    languageSkillsKey?: string;
    languageLevelKey?: string;
}
export interface SkillMatch {
    skill: string;
    level?: number;
    isFeatured?: boolean;
    source: 'skills' | 'languages' | 'text';
}
export interface PersonWithSkills extends PersonBase {
    matchedSkills: SkillMatch[];
    skillsScore: number;
    skillsSummary?: string;
}
export interface SkillsSearchOptions {
    anyOf?: string[];
    allOf?: string[];
    noneOf?: string[];
    minLevel?: number;
    featuredOnly?: boolean;
    includeLanguages?: boolean;
    fuzzyMatch?: boolean;
    department?: string;
    limit?: number;
    sortBy?: 'relevance' | 'name' | 'level';
    sortDirection?: 'asc' | 'desc';
}
export interface SkillsSuggestion {
    skill: string;
    frequency: number;
    coOccursWith: string[];
    departments: string[];
}
export declare class SkillsClient {
    private client;
    private schema;
    private skillsCache;
    private readonly skillAliases;
    constructor(client: SiftClient);
    /** Initialize by discovering the skills schema */
    initialize(): Promise<void>;
    /** Find people by skills with advanced filtering and scoring */
    findPeopleBySkills(options?: SkillsSearchOptions): Promise<PersonWithSkills[]>;
    /** Get skill suggestions based on org data */
    getSkillsSuggestions(query?: string, limit?: number): Promise<SkillsSuggestion[]>;
    /** Find people with similar skill profiles */
    findSimilarSkillProfiles(personEmailOrId: string, limit?: number): Promise<PersonWithSkills[]>;
    /** Get skill distribution across the organization */
    getSkillsAnalytics(department?: string): Promise<{
        topSkills: Array<{
            skill: string;
            count: number;
            avgLevel: number;
        }>;
        skillsByDepartment: Map<string, string[]>;
        totalPeopleWithSkills: number;
    }>;
    private findFieldKey;
    private buildSkillFilters;
    private canonicalizeSkill;
    private enrichPersonWithSkills;
    private extractPersonSkills;
    private calculateSkillsScore;
    private generateSkillsSummary;
    private mapLanguageLevel;
    private buildSkillsSuggestions;
}
