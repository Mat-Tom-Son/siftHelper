// Skills-focused search client for Sift API
// Handles skill-based queries, canonicalization, and scoring
// --------------------------------------------------------
export class SkillsClient {
    constructor(client) {
        this.schema = null;
        this.skillsCache = new Map();
        // Skill canonicalization and aliases
        this.skillAliases = new Map([
            // Programming languages
            ['javascript', ['js', 'node', 'nodejs', 'node.js']],
            ['typescript', ['ts']],
            ['python', ['py']],
            ['c#', ['csharp', 'c-sharp', 'c sharp', 'dotnet', '.net']],
            ['c++', ['cpp', 'cplusplus']],
            ['objective-c', ['objc', 'objective c']],
            // Frameworks & Libraries
            ['react', ['reactjs', 'react.js']],
            ['angular', ['angularjs']],
            ['vue', ['vuejs', 'vue.js']],
            ['next.js', ['nextjs', 'next']],
            ['express', ['expressjs', 'express.js']],
            // Databases
            ['postgresql', ['postgres', 'psql']],
            ['mysql', ['my sql']],
            ['mongodb', ['mongo']],
            // Cloud & DevOps
            ['amazon web services', ['aws']],
            ['google cloud platform', ['gcp', 'google cloud']],
            ['microsoft azure', ['azure']],
            ['kubernetes', ['k8s']],
            ['docker', ['containerization']],
            // General
            ['machine learning', ['ml', 'artificial intelligence', 'ai']],
            ['user experience', ['ux']],
            ['user interface', ['ui']],
            ['search engine optimization', ['seo']],
        ]);
        this.client = client;
    }
    /** Initialize by discovering the skills schema */
    async initialize() {
        if (this.schema)
            return;
        const fields = await this.client.getFields();
        this.schema = {
            skillsNameKey: this.findFieldKey(fields, ['skills.name']),
            skillsLevelKey: this.findFieldKey(fields, ['skills.level']),
            skillsFeaturedKey: this.findFieldKey(fields, ['skills.isFeatured']),
            languageSkillsKey: this.findFieldKey(fields, ['languages.proficiency.skills']),
            languageLevelKey: this.findFieldKey(fields, ['languages.proficiency.level']),
        };
    }
    /** Find people by skills with advanced filtering and scoring */
    async findPeopleBySkills(options = {}) {
        await this.initialize();
        const searchBody = {
            pageSize: Math.min(options.limit || 50, 100),
            sortBy: options.sortBy === 'name' ? 'displayName' : 'displayName',
            sortDirection: options.sortDirection || 'asc'
        };
        // Build filters
        const filters = [];
        // Skills filters
        if (options.anyOf?.length) {
            const skillFilters = this.buildSkillFilters(options.anyOf, 'or');
            if (skillFilters.length > 0) {
                filters.push(skillFilters.length === 1 ? skillFilters[0] : { or: skillFilters });
            }
        }
        if (options.allOf?.length) {
            const skillFilters = this.buildSkillFilters(options.allOf, 'and');
            filters.push(...skillFilters);
        }
        if (options.noneOf?.length) {
            const skillFilters = this.buildSkillFilters(options.noneOf, 'or');
            if (skillFilters.length > 0) {
                filters.push({
                    not: skillFilters.length === 1 ? skillFilters[0] : { or: skillFilters }
                });
            }
        }
        // Level filter
        if (options.minLevel && this.schema?.skillsLevelKey) {
            filters.push({
                field: this.schema.skillsLevelKey,
                comparison: 'gte',
                value: options.minLevel
            });
        }
        // Featured skills filter
        if (options.featuredOnly && this.schema?.skillsFeaturedKey) {
            filters.push({
                field: this.schema.skillsFeaturedKey,
                comparison: 'eq',
                value: true
            });
        }
        // Department filter
        if (options.department) {
            filters.push({
                field: 'department',
                comparison: 'eq',
                value: options.department
            });
        }
        // Apply filters
        if (filters.length > 0) {
            searchBody.filter = filters.length === 1 ? filters[0] : { and: filters };
        }
        // Fuzzy text search fallback
        if (options.fuzzyMatch && (options.anyOf?.length || options.allOf?.length)) {
            const allSkills = [...(options.anyOf || []), ...(options.allOf || [])];
            const canonicalSkills = allSkills.flatMap(skill => this.canonicalizeSkill(skill));
            searchBody.q = canonicalSkills.join(' ');
        }
        const response = await this.client.searchPeoplePost(searchBody);
        // Enrich results with skills data and scoring
        const enrichedResults = await Promise.all(response.data.map(person => this.enrichPersonWithSkills(person, options)));
        // Sort by relevance if requested
        if (options.sortBy === 'relevance') {
            enrichedResults.sort((a, b) => b.skillsScore - a.skillsScore);
        }
        return enrichedResults;
    }
    /** Get skill suggestions based on org data */
    async getSkillsSuggestions(query, limit = 20) {
        await this.initialize();
        // If we have cached suggestions, filter and return
        if (this.skillsCache.size > 0) {
            const suggestions = Array.from(this.skillsCache.values());
            if (query) {
                const filtered = suggestions.filter(s => s.skill.toLowerCase().includes(query.toLowerCase()));
                return filtered.slice(0, limit);
            }
            return suggestions
                .sort((a, b) => b.frequency - a.frequency)
                .slice(0, limit);
        }
        // Build suggestions from org data
        return this.buildSkillsSuggestions(query, limit);
    }
    /** Find people with similar skill profiles */
    async findSimilarSkillProfiles(personEmailOrId, limit = 10) {
        const person = await this.client.getPerson(personEmailOrId);
        const personSkills = await this.extractPersonSkills(person);
        if (personSkills.length === 0) {
            return [];
        }
        // Find people with overlapping skills
        return this.findPeopleBySkills({
            anyOf: personSkills.map(s => s.skill),
            limit: limit + 1, // +1 to exclude the original person
            sortBy: 'relevance'
        }).then(results => results.filter(p => p.id !== person.id).slice(0, limit));
    }
    /** Get skill distribution across the organization */
    async getSkillsAnalytics(department) {
        await this.initialize();
        // Sample a large set of people to analyze skills
        const searchBody = {
            pageSize: 100,
            sortBy: 'displayName'
        };
        if (department) {
            searchBody.filter = {
                field: 'department',
                comparison: 'eq',
                value: department
            };
        }
        const response = await this.client.searchPeoplePost(searchBody);
        const skillCounts = new Map();
        const skillsByDept = new Map();
        let peopleWithSkills = 0;
        for (const person of response.data) {
            const skills = await this.extractPersonSkills(person);
            if (skills.length > 0) {
                peopleWithSkills++;
                const personDept = person.department || 'Unknown';
                if (!skillsByDept.has(personDept)) {
                    skillsByDept.set(personDept, new Set());
                }
                for (const skill of skills) {
                    const canonical = this.canonicalizeSkill(skill.skill)[0];
                    if (!skillCounts.has(canonical)) {
                        skillCounts.set(canonical, { count: 0, totalLevel: 0 });
                    }
                    const entry = skillCounts.get(canonical);
                    entry.count++;
                    entry.totalLevel += skill.level || 1;
                    skillsByDept.get(personDept).add(canonical);
                }
            }
        }
        const topSkills = Array.from(skillCounts.entries())
            .map(([skill, data]) => ({
            skill,
            count: data.count,
            avgLevel: data.totalLevel / data.count
        }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20);
        const skillsByDepartment = new Map(Array.from(skillsByDept.entries()).map(([dept, skills]) => [dept, Array.from(skills)]));
        return {
            topSkills,
            skillsByDepartment,
            totalPeopleWithSkills: peopleWithSkills
        };
    }
    // Private helper methods
    findFieldKey(fields, candidates) {
        for (const candidate of candidates) {
            const field = fields.find(f => f.objectKey === candidate);
            if (field)
                return candidate;
        }
        return candidates[0]; // fallback to first candidate
    }
    buildSkillFilters(skills, operator) {
        if (!this.schema?.skillsNameKey)
            return [];
        const filters = [];
        for (const skill of skills) {
            const canonicalSkills = this.canonicalizeSkill(skill);
            const skillFilters = canonicalSkills.map(canonical => ({
                field: this.schema.skillsNameKey,
                comparison: 'eq',
                value: canonical
            }));
            if (skillFilters.length === 1) {
                filters.push(skillFilters[0]);
            }
            else if (skillFilters.length > 1) {
                filters.push({ or: skillFilters });
            }
        }
        return filters;
    }
    canonicalizeSkill(skill) {
        const normalized = skill.toLowerCase().trim();
        // Check for direct aliases
        for (const [canonical, aliases] of this.skillAliases) {
            if (aliases.includes(normalized) || canonical === normalized) {
                return [canonical];
            }
        }
        // Handle common patterns
        const processed = normalized
            .replace(/[^\w\s+.-]/g, '') // Remove special chars except +.-
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        return [processed];
    }
    async enrichPersonWithSkills(person, options) {
        const skills = await this.extractPersonSkills(person);
        const score = this.calculateSkillsScore(skills, options);
        return {
            ...person,
            matchedSkills: skills,
            skillsScore: score,
            skillsSummary: this.generateSkillsSummary(skills)
        };
    }
    async extractPersonSkills(person) {
        const skills = [];
        // Extract from skills.name field
        if (this.schema?.skillsNameKey) {
            const skillsData = person[this.schema.skillsNameKey.split('.')[0]];
            if (Array.isArray(skillsData)) {
                for (const skillItem of skillsData) {
                    if (typeof skillItem === 'object' && skillItem.name) {
                        skills.push({
                            skill: skillItem.name,
                            level: skillItem.level,
                            isFeatured: skillItem.isFeatured,
                            source: 'skills'
                        });
                    }
                }
            }
        }
        // Extract from languages if requested
        if (this.schema?.languageSkillsKey) {
            const langData = person.languages?.proficiency;
            if (Array.isArray(langData)) {
                for (const lang of langData) {
                    if (lang.skills && Array.isArray(lang.skills)) {
                        for (const skill of lang.skills) {
                            skills.push({
                                skill: skill,
                                level: this.mapLanguageLevel(lang.level),
                                source: 'languages'
                            });
                        }
                    }
                }
            }
        }
        return skills;
    }
    calculateSkillsScore(skills, options) {
        let score = 0;
        const requestedSkills = [
            ...(options.anyOf || []),
            ...(options.allOf || [])
        ].map(s => this.canonicalizeSkill(s)[0]);
        for (const skill of skills) {
            const canonical = this.canonicalizeSkill(skill.skill)[0];
            if (requestedSkills.includes(canonical)) {
                // Base score from skill level
                score += (skill.level || 1) * 2;
                // Bonus for featured skills
                if (skill.isFeatured)
                    score += 1;
                // Bonus for exact matches
                if (requestedSkills.includes(skill.skill.toLowerCase())) {
                    score += 0.5;
                }
            }
        }
        return score;
    }
    generateSkillsSummary(skills) {
        if (skills.length === 0)
            return 'No skills listed';
        const featured = skills.filter(s => s.isFeatured);
        const topSkills = skills
            .sort((a, b) => (b.level || 1) - (a.level || 1))
            .slice(0, 5);
        if (featured.length > 0) {
            return `Featured: ${featured.map(s => s.skill).join(', ')}`;
        }
        return `Top skills: ${topSkills.map(s => s.skill).join(', ')}`;
    }
    mapLanguageLevel(level) {
        const levelMap = {
            'beginner': 1,
            'intermediate': 2,
            'advanced': 3,
            'expert': 4,
            'native': 5
        };
        return levelMap[level?.toLowerCase()] || 1;
    }
    async buildSkillsSuggestions(query, limit = 20) {
        // This would typically analyze org data to build suggestions
        // For now, return common tech skills as examples
        const commonSkills = [
            'JavaScript', 'Python', 'React', 'Node.js', 'TypeScript',
            'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'MongoDB',
            'Machine Learning', 'Data Analysis', 'Project Management',
            'Agile', 'Scrum', 'Leadership', 'Communication'
        ];
        return commonSkills
            .filter(skill => !query || skill.toLowerCase().includes(query.toLowerCase()))
            .slice(0, limit)
            .map(skill => ({
            skill,
            frequency: Math.floor(Math.random() * 50) + 10,
            coOccursWith: [],
            departments: []
        }));
    }
}
