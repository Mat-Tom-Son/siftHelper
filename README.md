# Sift Helper - Chatbot-Friendly Org API Wrapper

A TypeScript wrapper for the Sift API that provides intuitive, natural language methods perfect for chatbot integration.

## Table of Contents
- [Features](#features)
- [Quick Start](#quick-start)
- [Chatbot Query Patterns](#chatbot-query-patterns)
- [Core Methods](#core-methods)
- [Environment Setup](#environment-setup)
- [Running Examples](#running-examples)
- [Testing](#testing)
- [Architecture](#architecture)
- [Chatbot Integration Tips](#chatbot-integration-tips)
- [Data Enrichment](#data-enrichment)
- [Advanced Usage](#advanced-usage)
- [Error Handling](#error-handling)
- [Contributing](#contributing)
- [License](#license)

## Features
- **Chatbot-Friendly**: Method names that match natural language queries
- **Rich Data**: Enriched person data with levels, departments, photos
- **Org Analytics**: Team insights, department summaries, reporting chains
- **Smart Search**: Role-based, location-based, and boolean filtering
- **Type Safe**: Full TypeScript support with comprehensive interfaces
- **Production Ready**: Built on a robust, tested foundation with retry logic

## Quick Start
```typescript
import { SiftClient, ChatbotSiftClient } from 'sift-helper';

const siftClient = new SiftClient({ 
  dataToken: process.env.SIFT_DATA_TOKEN!,
  mediaToken: process.env.SIFT_MEDIA_TOKEN 
});

const chatbot = new ChatbotSiftClient(siftClient);

// Natural language queries
const manager = await chatbot.getPersonsManager('john@company.com');
const teamSize = await chatbot.howBigIsTeam('sarah@company.com');
const engineers = await chatbot.findPeopleByRole('software engineer');
```

## Chatbot Query Patterns
| Natural Language Query         | Method Call                       |
|--------------------------------|-----------------------------------|
| "Who is X's manager?"          | `whoIsManager(email)`             |
| "Who reports to X?"            | `whoReportsTo(email)`             |
| "How big is X's team?"         | `howBigIsTeam(email)`             |
| "Find all product managers"    | `findPeopleByRole('product manager')` |
| "Who works in Engineering?"     | `whoWorksInDepartment('Engineering')` |
| "Show me X's org chart"        | `getCompleteOrgTree(email)`       |

## Core Methods

### Person Lookup
```typescript
// Find someone by email with enriched data
const person = await chatbot.findPersonByEmail('jane@company.com', true);
console.log(person.level, person.departmentName, person.photoUrl);

// Get their manager
const manager = await chatbot.getPersonsManager('jane@company.com');

// Get full reporting chain
const chain = await chatbot.getReportingChain('jane@company.com');
```

### Team Analysis
```typescript
// Get detailed team insights
const insights = await chatbot.getTeamInsights('manager@company.com');
console.log({
  totalTeamSize: insights.totalTeamSize,
  directReports: insights.directReports.length,
  teamDepth: insights.teamDepth,
  avgSpanOfControl: insights.avgSpanOfControl
});

// Get complete org tree
const orgTree = await chatbot.getCompleteOrgTree('ceo@company.com', 3);
```

### Search & Discovery
```typescript
// Find people by role
const designers = await chatbot.findPeopleByRole('designer', {
  department: 'Product',
  office: 'San Francisco',
  includePhotos: true
});

// Find managers in a department
const engManagers = await chatbot.findManagersInDepartment('Engineering');

// Search with natural language
const results = await chatbot.searchPeopleByQuery('senior frontend developer');
```

### Org Analytics
```typescript
// Department summary
const deptSummary = await chatbot.getDepartmentSummary('Engineering');
console.log({
  headCount: deptSummary.headCount,
  managerCount: deptSummary.managerCount,
  avgTeamSize: deptSummary.avgTeamSize
});

// All departments
const departments = await chatbot.getAllDepartments();
```

## Environment Setup
Create a `.env` file:
```bash
SIFT_DATA_TOKEN=your_data_token_here
SIFT_MEDIA_TOKEN=your_media_token_here  # optional, for photos
SIFT_TEST_PERSON=test@yourcompany.com   # for testing
```

## Running Examples
```bash
# Install dependencies
npm install

# Run the example script
npm run dump

# Run chatbot usage examples
npx tsx examples/chatbot_usage.ts
```

## Testing
```bash
# Run unit tests
npm test

# Run integration tests (requires valid tokens)
npm run test:int
```

## Architecture
- **`SiftClient`**: Low-level, robust API client with caching and retry logic
- **`ChatbotSiftClient`**: High-level wrapper with natural language methods
- **Rich Types**: Comprehensive TypeScript interfaces for all data structures
- **Smart Enrichment**: Automatically adds computed fields like org level and manager names

## Chatbot Integration Tips
1. **Use descriptive method names**: Methods are named to match natural language
2. **Handle errors gracefully**: All methods include proper error handling
3. **Leverage convenience methods**: Use `whoIsManager()`, `whoReportsTo()` for simple responses
4. **Cache field metadata**: The client automatically caches org schema
5. **Include photos when needed**: Set `includePhotos: true` for UI components

## Data Enrichment
The `ChatbotSiftClient` automatically enriches person data with:
- **`level`**: Organizational level derived from reporting path
- **`departmentName`**: Clean department name
- **`officeName`**: Office location
- **`managerName`**: Direct manager's name
- **`photoUrl`**: Profile photo URL (when requested)

## Advanced Usage

### Custom Search Filters
```typescript
const seniorEngineers = await chatbot.findPeopleByRole('engineer', {
  department: 'Engineering',
  minReports: 2,  // Senior ICs or managers
  office: 'Seattle',
  includePhotos: true,
  limit: 20
});
```

### Org Chart Generation
```typescript
const orgData = await chatbot.getCompleteOrgTree('vp@company.com', 4);

// Use with visualization libraries
const chartNodes = orgData.orgChart.nodes.map(person => ({
  id: person.id,
  label: person.displayName,
  title: person.title,
  level: person.level,
  photo: person.photoUrl
}));

const chartEdges = orgData.orgChart.edges;
```

## Error Handling
All methods include comprehensive error handling:
```typescript
try {
  const manager = await chatbot.getPersonsManager('unknown@company.com');
} catch (error) {
  console.log('Person not found or has no manager');
}

// Or use the convenience methods that return user-friendly strings
const response = await chatbot.whoIsManager('unknown@company.com');
// Returns: "This person doesn't have a manager listed."
```

## Contributing
1. Add new methods to `ChatbotSiftClient` with descriptive names
2. Include comprehensive TypeScript types
3. Add error handling and user-friendly responses
4. Write tests for new functionality
5. Update this README with examples

## License
MIT