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
    objectKey: string;
    name: string;
    type: string;
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
    reportingPath?: string[];
    [key: string]: unknown;
}
export interface SearchGetParams {
    q?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDirection?: SortDirection;
    orQuery?: boolean;
    [key: string]: string | number | boolean | undefined;
}
export type Comparison = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'exists' | 'notExists' | 'contains';
export interface Condition {
    field: string;
    comparison: Comparison;
    value?: unknown;
}
export interface BoolGroup {
    and?: (Condition | BoolGroup)[];
    or?: (Condition | BoolGroup)[];
    not?: (Condition | BoolGroup);
}
export interface SearchPostBody {
    q?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDirection?: SortDirection;
    filter?: Condition | BoolGroup;
}
export interface SearchResponse<T = PersonBase> {
    data: T[];
    links?: {
        self?: string;
        next?: string;
        prev?: string;
        first?: string;
        last?: string;
    };
    meta?: {
        page?: number;
        pages?: number;
        pageSize?: number;
        length?: number;
        totalLength?: number;
    };
}
export interface OrgSubtreeResult<T = PersonBase> {
    manager: T | null;
    nodes: T[];
    edges: Array<{
        leaderId: string | null;
        personId: string;
    }>;
    stats: {
        expanded: number;
        enqueued: number;
        apiCalls: number;
        depthReached: number;
        truncated: boolean;
    };
}
export declare class SiftClient {
    readonly baseUrl: string;
    readonly dataToken: string;
    readonly mediaToken?: string;
    readonly timeoutMs: number;
    private readonly _fetch;
    private fieldsCache;
    private fieldsTtlMs;
    constructor(opts: SiftClientOptions);
    private requestJson;
    private requestJsonByUrl;
    getPerson<T = PersonBase>(idOrEmail: string): Promise<T>;
    getFields(forceRefresh?: boolean): Promise<FieldMeta[]>;
    searchPeopleGet<T = PersonBase>(params?: SearchGetParams): Promise<SearchResponse<T>>;
    searchPeoplePost<T = PersonBase>(body: SearchPostBody): Promise<SearchResponse<T>>;
    followSearchNext<T = PersonBase>(nextUrl: string): Promise<SearchResponse<T>>;
    /** Build a media URL for <img src>, optionally embedding the media token as a query param. */
    makeMediaUrl(idOrEmail: string, kind: MediaKind, opts?: {
        preferredType?: PreferredPhotoType;
        height?: number;
        width?: number;
        fit?: 'crop' | 'scale';
        tokenInQuery?: boolean;
    }): string;
    /** One-hop direct reports using POST (does not rely on field filterability in GET). */
    getDirectReports<T = PersonBase>(managerId: string, pageSize?: number): Promise<T[]>;
    /** Full subtree under a manager (BFS). Uses teamLeaderId eq filter. */
    getOrgSubtree<T extends PersonBase = PersonBase>(managerIdOrEmail: string, opts?: {
        includeManager?: boolean;
        maxDepth?: number;
        maxNodes?: number;
        pageSize?: number;
    }): Promise<OrgSubtreeResult<T>>;
    /** Resolve the chain of leaders for a person using reportingPath. */
    getOrgChain<T extends PersonBase = PersonBase>(idOrEmail: string, includeSelf?: boolean): Promise<T[]>;
}
