# Integrating sift-helper into Your Chatbot or Server App

This guide shows end-to-end steps to add `sift-helper` to a Node/TypeScript app and wire it into chat intents or HTTP routes.

## 1) Install
```bash
npm install sift-helper
```

## 2) Environment Variables
Create a `.env` file (server only; never ship tokens to the browser):
```bash
SIFT_DATA_TOKEN=your_data_token_here
SIFT_MEDIA_TOKEN=your_media_token_here
```

Load env at app startup:
```ts
// ESM
import 'dotenv/config';
```
```js
// CJS
require('dotenv/config');
```

## 3) Create a Singleton Client
```ts
// lib/sift.ts (ESM)
import 'dotenv/config';
import { SiftClient, ChatbotSiftClient } from 'sift-helper';

const sift = new SiftClient({
  dataToken: process.env.SIFT_DATA_TOKEN!,
  mediaToken: process.env.SIFT_MEDIA_TOKEN
});

export const chatbot = new ChatbotSiftClient(sift);
```

```js
// lib/sift.cjs (CommonJS)
require('dotenv/config');
const { SiftClient, ChatbotSiftClient } = require('sift-helper');

const sift = new SiftClient({
  dataToken: process.env.SIFT_DATA_TOKEN,
  mediaToken: process.env.SIFT_MEDIA_TOKEN
});

module.exports.chatbot = new ChatbotSiftClient(sift);
```

## 4) Intent Handler Example
```ts
// intents/handler.ts
import { chatbot } from '../lib/sift';

type Intent =
  | 'who_manager'
  | 'who_reports'
  | 'team_size'
  | 'dept_summary'
  | 'role_search'
  | 'skill_experts'
  | 'skill_who_knows';

export async function handleIntent(intent: Intent, args: any) {
  try {
    switch (intent) {
      case 'who_manager':
        return await chatbot.whoIsManager(args.email);
      case 'who_reports':
        return await chatbot.whoReportsTo(args.email);
      case 'team_size':
        return await chatbot.howBigIsTeam(args.email);
      case 'dept_summary':
        return await chatbot.whoWorksInDepartment(args.department);
      case 'role_search': {
        const people = await chatbot.findPeopleByRole(args.role, {
          department: args.department,
          office: args.office,
          limit: 10,
          includePhotos: false
        });
        return formatList(people.map(p => `${p.displayName || p.primaryEmail} — ${p.title || ''}`));
      }
      case 'skill_experts':
        return await chatbot.whoAreTheExperts(args.skill, args.department);
      case 'skill_who_knows':
        return await chatbot.whoKnowsSkill(args.skill, args.department);
      default:
        return "I didn't understand that request.";
    }
  } catch (e) {
    return 'Sorry, I ran into an error fetching org data.';
  }
}

function formatList(items: string[], max = 10) {
  const list = items.slice(0, max);
  const more = Math.max(0, items.length - list.length);
  return list.length
    ? `Here are some matches:\n- ${list.join('\n- ')}${more ? `\n...and ${more} more` : ''}`
    : 'No results found.';
}
```

## 5) HTTP Routes (Express)
```ts
// server/routes.ts
import express from 'express';
import { chatbot } from '../lib/sift';

export const router = express.Router();

router.get('/manager', async (req, res) => {
  try {
    const email = String(req.query.email || '');
    const text = await chatbot.whoIsManager(email);
    res.json({ ok: true, text });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/role', async (req, res) => {
  try {
    const role = String(req.query.role || '');
    const department = req.query.department ? String(req.query.department) : undefined;
    const people = await chatbot.findPeopleByRole(role, { department, limit: 10 });
    res.json({ ok: true, results: people });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
```

## 6) LLM Tooling (Function Calling)
```ts
// tools/siftTools.ts
import { chatbot } from '../lib/sift';

export const tools = [
  {
    name: 'whoIsManager',
    description: "Answer 'Who is X's manager?'",
    inputSchema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
    call: async ({ email }: { email: string }) => chatbot.whoIsManager(email)
  },
  {
    name: 'findPeopleByRole',
    description: 'Find people by role with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string' },
        department: { type: 'string' },
        office: { type: 'string' },
        limit: { type: 'number' }
      },
      required: ['role']
    },
    call: async ({ role, department, office, limit }: any) => {
      const res = await chatbot.findPeopleByRole(role, { department, office, limit: limit ?? 10 });
      return res.map(p => ({
        name: p.displayName || p.primaryEmail,
        title: p.title,
        department: p.departmentName,
        email: p.primaryEmail
      }));
    }
  }
];
```

## 7) Performance
- Use a single `ChatbotSiftClient` instance per process.
- Prefer high-level methods (they batch internally) over many low-level calls.

## 8) Error Handling & Timeouts
```ts
// utils/safeCall.ts
export async function safeCall<T>(p: Promise<T>, ms = 5000): Promise<T> {
  const timeout = new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Timeout')), ms));
  return Promise.race([p, timeout]) as Promise<T>;
}
```

## 9) Security
- Never expose `SIFT_*` tokens to the browser.
- Call this library only from server/bot code.

## 10) Quick Recipes
```ts
const person = await chatbot.findPersonByEmail('jane@company.com', true);
const manager = await chatbot.getPersonsManager('jane@company.com', true);
const chain = await chatbot.getReportingChain('jane@company.com');
const insights = await chatbot.getTeamInsights('manager@company.com');
const summary = await chatbot.getDepartmentSummary('Engineering');
const designers = await chatbot.findPeopleByRole('designer', { department: 'Product', limit: 10 });
const whoKnowsReact = await chatbot.whoKnowsSkill('React', 'Engineering');
const reactExperts = await chatbot.whoAreTheExperts('React');
```
