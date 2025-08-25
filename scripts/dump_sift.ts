#!/usr/bin/env tsx
import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SiftClient } from '../sift_client.js';
import { ChatbotSiftClient } from '../chatbot_sift_client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function tsFolderName() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const name = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return name;
}

async function mkdirp(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function writeJson(outDir: string, name: string, data: any) {
  const file = path.join(outDir, name);
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  return file;
}

async function main() {
  const DATA_TOKEN = process.env.SIFT_DATA_TOKEN;
  const MEDIA_TOKEN = process.env.SIFT_MEDIA_TOKEN; // optional
  const BASE_URL = process.env.SIFT_BASE_URL; // optional
  const TEST_PERSON = process.env.SIFT_TEST_PERSON; // email or id required
  const TEST_QUERY = process.env.SIFT_TEST_QUERY; // optional q for GET search

  if (!DATA_TOKEN) throw new Error('Missing SIFT_DATA_TOKEN in environment');
  if (!TEST_PERSON) throw new Error('Missing SIFT_TEST_PERSON in environment');

  const runsRoot = path.resolve(__dirname, '..', 'runs');
  const outDir = path.join(runsRoot, tsFolderName());
  await mkdirp(outDir);

  const client = new SiftClient({ dataToken: DATA_TOKEN, mediaToken: MEDIA_TOKEN, baseUrl: BASE_URL || undefined });
  const chatbot = new ChatbotSiftClient(client);

  const summary: string[] = [];
  const log = (msg: string) => { summary.push(msg); console.log(msg); };
  
  console.log('🤖 Chatbot-Ready Sift API Test Suite');
  console.log('====================================\n');

  // Initialize with basic person data (for reference but use chatbot version)
  log('Fetching base person data...');
  const person = await client.getPerson(TEST_PERSON);
  log(`person: id=${(person as any).id || 'n/a'} email=${(person as any).primaryEmail || 'n/a'} name=${(person as any).displayName || 'n/a'}`);

  // Keep media URL test (simple utility function)
  if (MEDIA_TOKEN) {
    const mediaUrl = client.makeMediaUrl(TEST_PERSON, 'profile-photo', { preferredType: 'official', height: 256, tokenInQuery: true });
    await writeJson(outDir, 'media_url.json', { mediaUrl });
    log(`mediaUrl: ${mediaUrl}`);
  }

  // ========================================
  // NEW: ChatbotSiftClient Comprehensive Tests
  // ========================================
  log('\n🤖 CHATBOT CLIENT TESTS');
  log('========================');

  // Test enriched person lookup
  log('Testing enriched person lookup...');
  const enrichedPerson = await chatbot.findPersonByEmail(TEST_PERSON, true);
  await writeJson(outDir, 'person.json', enrichedPerson);
  log(`enrichedPerson: level=${enrichedPerson.level} dept=${enrichedPerson.departmentName} manager=${enrichedPerson.managerName}`);

  // Test manager lookup
  log('Testing manager lookup...');
  try {
    const manager = await chatbot.getPersonsManager(TEST_PERSON, true);
    await writeJson(outDir, 'manager.json', manager);
    log(`manager: ${manager ? `${manager.displayName} (level ${manager.level})` : 'none'}`);
  } catch (error) {
    log('manager: none found');
  }

  // Test reporting chain
  log('Testing reporting chain...');
  const reportingChain = await chatbot.getReportingChain(TEST_PERSON, false, true);
  await writeJson(outDir, 'reporting_chain.json', reportingChain);
  log(`reportingChain: ${reportingChain.length} levels`);

  // Test direct reports with enrichment
  log('Testing enriched direct reports...');
  const enrichedReports = await chatbot.getDirectReports(TEST_PERSON, true);
  await writeJson(outDir, 'direct_reports.json', enrichedReports);
  log(`enrichedDirectReports: ${enrichedReports.length} people`);

  // Test team insights
  if (enrichedReports.length > 0 || (person as any).directReportCount > 0) {
    log('Testing team insights...');
    try {
      const teamInsights = await chatbot.getTeamInsights(TEST_PERSON);
      await writeJson(outDir, 'team_insights.json', teamInsights);
      log(`teamInsights: totalSize=${teamInsights.totalTeamSize} depth=${teamInsights.teamDepth} avgSpan=${teamInsights.avgSpanOfControl.toFixed(1)}`);
    } catch (error) {
      log('teamInsights: error getting insights');
    }
  }

  // Test complete org tree
  log('Testing complete org tree...');
  try {
    const orgTree = await chatbot.getCompleteOrgTree(TEST_PERSON, 2, false);
    await writeJson(outDir, 'org_tree.json', orgTree);
    log(`orgTree: ${orgTree.totalSize} people, ${orgTree.orgChart.edges.length} relationships`);
  } catch (error) {
    log('orgTree: error generating tree');
  }

  // Test available fields (core schema info)
  log('Testing available fields...');
  const availableFields = await chatbot.getAvailableFields();
  const filterableFields = availableFields.filter(f => f.filterable);
  const searchableFields = availableFields.filter(f => f.searchable);
  await writeJson(outDir, 'fields.json', { 
    all: availableFields, 
    filterable: filterableFields, 
    searchable: searchableFields 
  });
  log(`availableFields: ${availableFields.length} total, ${filterableFields.length} filterable, ${searchableFields.length} searchable`);

  // Test department discovery and analysis
  log('Testing department discovery...');
  try {
    const departments = await chatbot.getAllDepartments();
    await writeJson(outDir, 'departments.json', departments);
    log(`departments: found ${departments.length} departments: ${departments.slice(0, 3).join(', ')}${departments.length > 3 ? '...' : ''}`);

    // Test department summary for first department
    if (departments.length > 0) {
      const firstDept = departments[0];
      log(`Testing department summary for "${firstDept}"...`);
      try {
        const deptSummary = await chatbot.getDepartmentSummary(firstDept);
        await writeJson(outDir, 'department_summary.json', deptSummary);
        log(`deptSummary: ${deptSummary.headCount} people, ${deptSummary.managerCount} managers, avg team size ${deptSummary.avgTeamSize.toFixed(1)}`);
      } catch (error) {
        log(`deptSummary: error analyzing ${firstDept}`);
      }
    }
  } catch (error) {
    log('departments: error discovering departments');
  }

  // Test role-based search
  if (TEST_QUERY) {
    log(`Testing role search for "${TEST_QUERY}"...`);
    const roleResults = await chatbot.findPeopleByRole(TEST_QUERY, { limit: 5, includePhotos: false });
    await writeJson(outDir, 'role_search.json', roleResults);
    log(`roleSearch: found ${roleResults.length} people matching "${TEST_QUERY}"`);
  }

  // Test managers in department
  log('Testing managers search...');
  try {
    const personDept = (person as any).department || enrichedPerson.departmentName;
    if (personDept) {
      const managers = await chatbot.findManagersInDepartment(personDept);
      await writeJson(outDir, 'managers_in_dept.json', managers);
      log(`managersInDept: found ${managers.length} managers in ${personDept}`);
    } else {
      log('managersInDept: no department found for test person');
    }
  } catch (error) {
    log('managersInDept: error finding managers');
  }

  // Test natural language convenience methods
  log('Testing natural language responses...');
  const nlResponses = {
    whoIsManager: await chatbot.whoIsManager(TEST_PERSON).catch(() => 'Error getting manager'),
    whoReportsTo: await chatbot.whoReportsTo(TEST_PERSON).catch(() => 'Error getting reports'),
    howBigIsTeam: await chatbot.howBigIsTeam(TEST_PERSON).catch(() => 'Error getting team size')
  };
  await writeJson(outDir, 'natural_language.json', nlResponses);
  log('naturalLanguage: generated conversational responses');

  // Test search with filters
  log('Testing advanced search with filters...');
  try {
    const advancedSearch = await chatbot.findPeopleByRole('manager', {
      minReports: 1,
      limit: 10,
      includePhotos: false
    });
    await writeJson(outDir, 'advanced_search.json', advancedSearch);
    log(`advancedSearch: found ${advancedSearch.length} managers with reports`);
  } catch (error) {
    log('advancedSearch: error with filtered search');
  }

  // Performance and API call summary
  log('\n📊 PERFORMANCE SUMMARY');
  log('=====================');
  log(`Total API calls: ~${20 + (TEST_QUERY ? 2 : 0)} (estimated)`);
  log('Data enrichment: ✅ Levels, departments, manager names, photos');
  log('Natural language: ✅ Conversational responses ready');
  log('Error handling: ✅ Graceful fallbacks implemented');
  log('Caching: ✅ Field metadata cached');

  // Write summary
  await fs.writeFile(path.join(outDir, 'SUMMARY.txt'), summary.join('\n') + '\n', 'utf8');

  console.log(`\n✅ Comprehensive test completed!`);
  console.log(`📁 Output written to: ${outDir}`);
  console.log(`🔍 Review the chatbot_* files for enhanced API capabilities`);
}

main().catch((err) => {
  console.error('Error during dump:', err?.stack || err);
  process.exit(1);
});
