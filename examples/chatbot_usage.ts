#!/usr/bin/env tsx
// Examples of how a chatbot would use the ChatbotSiftClient
// -------------------------------------------------------
// These examples show natural language queries and how they map to API calls

import 'dotenv/config';
import { SiftClient } from '../sift_client.js';
import { ChatbotSiftClient } from '../chatbot_sift_client.js';

async function main() {
  const DATA_TOKEN = process.env.SIFT_DATA_TOKEN;
  const MEDIA_TOKEN = process.env.SIFT_MEDIA_TOKEN;
  
  if (!DATA_TOKEN) throw new Error('Missing SIFT_DATA_TOKEN in environment');

  // Initialize clients
  const siftClient = new SiftClient({ 
    dataToken: DATA_TOKEN, 
    mediaToken: MEDIA_TOKEN 
  });
  const chatbot = new ChatbotSiftClient(siftClient);

  console.log('🤖 Chatbot Sift Client Examples\n');

  // Example 1: "Who is John's manager?"
  console.log('Example 1: Finding someone\'s manager');
  try {
    const testEmail = process.env.SIFT_TEST_PERSON || 'test@example.com';
    const managerInfo = await chatbot.whoIsManager(testEmail);
    console.log(`Query: "Who is ${testEmail}'s manager?"`);
    console.log(`Response: ${managerInfo}\n`);
  } catch (error) {
    console.log('Could not find manager info\n');
  }

  // Example 2: "Who reports to Sarah?"
  console.log('Example 2: Finding direct reports');
  try {
    const testEmail = process.env.SIFT_TEST_PERSON || 'test@example.com';
    const reportsInfo = await chatbot.whoReportsTo(testEmail);
    console.log(`Query: "Who reports to ${testEmail}?"`);
    console.log(`Response: ${reportsInfo}\n`);
  } catch (error) {
    console.log('Could not find reports info\n');
  }

  // Example 3: "How big is the engineering team?"
  console.log('Example 3: Department size analysis');
  try {
    const deptInfo = await chatbot.whoWorksInDepartment('Engineering');
    console.log('Query: "How big is the Engineering department?"');
    console.log(`Response: ${deptInfo}\n`);
  } catch (error) {
    console.log('Could not find Engineering department info\n');
  }

  // Example 4: "Find all product managers"
  console.log('Example 4: Role-based search');
  try {
    const productManagers = await chatbot.findPeopleByRole('product manager', { 
      limit: 5, 
      includePhotos: false 
    });
    console.log('Query: "Find all product managers"');
    console.log(`Response: Found ${productManagers.length} product managers:`);
    productManagers.forEach(pm => {
      console.log(`  - ${pm.displayName || pm.primaryEmail} (${pm.title || 'No title'})`);
    });
    console.log();
  } catch (error) {
    console.log('Could not find product managers\n');
  }

  // Example 5: "Who are the managers in the San Francisco office?"
  console.log('Example 5: Location + role search');
  try {
    const sfManagers = await chatbot.findManagersInDepartment('Engineering');
    console.log('Query: "Who are the engineering managers?"');
    console.log(`Response: Found ${sfManagers.length} engineering managers:`);
    sfManagers.slice(0, 3).forEach(mgr => {
      console.log(`  - ${mgr.displayName || mgr.primaryEmail} (${mgr.directReportCount || 0} reports)`);
    });
    console.log();
  } catch (error) {
    console.log('Could not find engineering managers\n');
  }

  // Example 6: "Show me the org chart for Alex's team"
  console.log('Example 6: Org chart generation');
  try {
    const testEmail = process.env.SIFT_TEST_PERSON || 'test@example.com';
    const orgTree = await chatbot.getCompleteOrgTree(testEmail, 2, false);
    console.log(`Query: "Show me the org chart for ${testEmail}'s team"`);
    console.log(`Response: Org chart with ${orgTree.totalSize} people:`);
    console.log(`  Manager: ${orgTree.manager.displayName || orgTree.manager.primaryEmail}`);
    console.log(`  Team members: ${orgTree.allTeamMembers.length}`);
    console.log(`  Reporting relationships: ${orgTree.orgChart.edges.length}`);
    console.log();
  } catch (error) {
    console.log('Could not generate org chart\n');
  }

  // Example 7: "What's the reporting chain above me?"
  console.log('Example 7: Reporting chain');
  try {
    const testEmail = process.env.SIFT_TEST_PERSON || 'test@example.com';
    const chain = await chatbot.getReportingChain(testEmail, false, false);
    console.log(`Query: "What's the reporting chain above ${testEmail}?"`);
    console.log(`Response: Reporting chain has ${chain.length} levels:`);
    chain.forEach((person, index) => {
      console.log(`  ${index + 1}. ${person.displayName || person.primaryEmail} (${person.title || 'No title'})`);
    });
    console.log();
  } catch (error) {
    console.log('Could not find reporting chain\n');
  }

  console.log('✅ Examples completed!');
}

// Common chatbot query patterns and their method mappings
export const CHATBOT_QUERY_PATTERNS = {
  // Manager queries
  "who is X's manager": "whoIsManager(email)",
  "who does X report to": "getPersonsManager(email)",
  "what's X's reporting line": "getReportingChain(email)",
  
  // Team queries  
  "who reports to X": "whoReportsTo(email)",
  "how big is X's team": "howBigIsTeam(email)",
  "show me X's org chart": "getCompleteOrgTree(email)",
  "get team insights for X": "getTeamInsights(email)",
  
  // Department queries
  "how many people in X department": "whoWorksInDepartment(dept)",
  "who works in X department": "findPeopleInDepartment(dept)",
  "who manages X department": "findManagersInDepartment(dept)",
  "X department summary": "getDepartmentSummary(dept)",
  
  // Role/search queries
  "find all X roles": "findPeopleByRole(role)",
  "who are the X in Y department": "findPeopleByRole(role, {department: Y})",
  "search for people like X": "searchPeopleByQuery(query)",
  
  // Location queries
  "who works in X office": "findPeopleInOffice(office)",
  "find managers in X office": "findPeopleByRole('manager', {office: X})",
  
  // Analytics queries
  "what departments exist": "getAllDepartments()",
  "available org fields": "getAvailableFields()"
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
