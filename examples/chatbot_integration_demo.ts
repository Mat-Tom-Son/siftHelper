#!/usr/bin/env tsx
// Complete chatbot integration demo showing real-world usage patterns
// ------------------------------------------------------------------
// This demonstrates how a chatbot would handle common org queries

import 'dotenv/config';
import { SiftClient } from '../sift_client.js';
import { ChatbotSiftClient } from '../chatbot_sift_client.js';

// Simulate chatbot query processing
class OrgChatbot {
  private chatbot: ChatbotSiftClient;

  constructor(chatbot: ChatbotSiftClient) {
    this.chatbot = chatbot;
  }

  async processQuery(query: string, context: { userEmail?: string } = {}): Promise<string> {
    const lowerQuery = query.toLowerCase();

    try {
      // Manager queries
      if (lowerQuery.includes("who is") && lowerQuery.includes("manager")) {
        const email = this.extractEmail(query) || context.userEmail;
        if (!email) return "I need an email address to find someone's manager.";
        return await this.chatbot.whoIsManager(email);
      }

      // Direct reports queries
      if (lowerQuery.includes("who reports to") || lowerQuery.includes("direct reports")) {
        const email = this.extractEmail(query) || context.userEmail;
        if (!email) return "I need an email address to find direct reports.";
        return await this.chatbot.whoReportsTo(email);
      }

      // Team size queries
      if (lowerQuery.includes("how big") && lowerQuery.includes("team")) {
        const email = this.extractEmail(query) || context.userEmail;
        if (!email) return "I need an email address to analyze team size.";
        return await this.chatbot.howBigIsTeam(email);
      }

      // Department queries
      if (lowerQuery.includes("department") && (lowerQuery.includes("how many") || lowerQuery.includes("who works"))) {
        const dept = this.extractDepartment(query);
        if (!dept) return "I need a department name to search.";
        return await this.chatbot.whoWorksInDepartment(dept);
      }

      // Role search queries
      if (lowerQuery.includes("find") && (lowerQuery.includes("manager") || lowerQuery.includes("engineer") || lowerQuery.includes("designer"))) {
        const role = this.extractRole(query);
        const dept = this.extractDepartment(query);
        
        // Special case: if looking for "managers" in a department, use the dedicated method
        if (role.toLowerCase().includes("manager") && dept) {
          const results = await this.chatbot.findManagersInDepartment(dept, false);
          
          if (results.length === 0) {
            return `I couldn't find any managers in ${dept}.`;
          }

          const names = results.slice(0, 5).map(p => 
            `${p.displayName || p.primaryEmail}${p.title ? ` (${p.title})` : ''}`
          );
          
          let response = `Found ${results.length} managers in ${dept}:\n`;
          response += names.join('\n');
          if (results.length > 5) response += `\n... and ${results.length - 5} more`;
          
          return response;
        }
        
        // General role search
        const results = await this.chatbot.findPeopleByRole(role, {
          department: dept || undefined,
          limit: 10,
          includePhotos: false
        });

        if (results.length === 0) {
          return `I couldn't find anyone matching "${role}"${dept ? ` in ${dept}` : ''}.`;
        }

        const names = results.slice(0, 5).map(p => 
          `${p.displayName || p.primaryEmail}${p.title ? ` (${p.title})` : ''}`
        );
        
        let response = `Found ${results.length} people matching "${role}"${dept ? ` in ${dept}` : ''}:\n`;
        response += names.join('\n');
        if (results.length > 5) response += `\n... and ${results.length - 5} more`;
        
        return response;
      }

      // Org chart queries
      if (lowerQuery.includes("org chart") || lowerQuery.includes("team structure")) {
        const email = this.extractEmail(query) || context.userEmail;
        if (!email) return "I need an email address to generate an org chart.";
        
        const orgTree = await this.chatbot.getCompleteOrgTree(email, 3);
        return `Org chart for ${orgTree.manager.displayName || orgTree.manager.primaryEmail}:\n` +
               `• Total team size: ${orgTree.totalSize} people\n` +
               `• Direct reports: ${orgTree.allTeamMembers.filter(p => p.teamLeaderId === orgTree.manager.id).length}\n` +
               `• Reporting relationships: ${orgTree.orgChart.edges.length}`;
      }

      return "I can help you find information about people, teams, departments, and org structure. Try asking:\n" +
             "• 'Who is [email]'s manager?'\n" +
             "• 'Who reports to [email]?'\n" +
             "• 'How big is [email]'s team?'\n" +
             "• 'Find all project managers'\n" +
             "• 'Who works in Information Technology department?'";

    } catch (error) {
      console.error('Query processing error:', error);
      return "I encountered an error processing your request. Please try again or rephrase your question.";
    }
  }

  private extractEmail(query: string): string | null {
    const emailMatch = query.match(/[\w.-]+@[\w.-]+\.\w+/);
    return emailMatch ? emailMatch[0] : null;
  }

  private extractDepartment(query: string): string | null {
    const deptPatterns = [
      /(?:in|from|department)\s+([A-Z][a-zA-Z\s]+?)(?:\s+department|$)/i,
      /(Engineering|Product|Design|Marketing|Sales|HR|Human Resources|Finance|Operations)/i
    ];
    
    for (const pattern of deptPatterns) {
      const match = query.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }

  private extractRole(query: string): string {
    const rolePatterns = [
      /find\s+(?:all\s+)?([a-zA-Z\s]+?)(?:\s+in|\s+from|$)/i,
      /(manager|engineer|designer|analyst|director|VP|CEO)/i
    ];
    
    for (const pattern of rolePatterns) {
      const match = query.match(pattern);
      if (match) return match[1].trim();
    }
    return 'person'; // fallback
  }
}

async function main() {
  const DATA_TOKEN = process.env.SIFT_DATA_TOKEN;
  const MEDIA_TOKEN = process.env.SIFT_MEDIA_TOKEN;
  const TEST_PERSON = process.env.SIFT_TEST_PERSON;
  
  if (!DATA_TOKEN) {
    console.log('⚠️  Set SIFT_DATA_TOKEN in .env to run this demo');
    return;
  }

  // Initialize the chatbot
  const siftClient = new SiftClient({ 
    dataToken: DATA_TOKEN, 
    mediaToken: MEDIA_TOKEN 
  });
  const chatbotClient = new ChatbotSiftClient(siftClient);
  const orgChatbot = new OrgChatbot(chatbotClient);

  console.log('🤖 Org Chatbot Demo\n');
  console.log('Simulating common chatbot queries...\n');

  // Demo queries
  const queries = [
    `Who is ${TEST_PERSON}'s manager?`,
    `Who reports to ${TEST_PERSON}?`,
    `How big is ${TEST_PERSON}'s team?`,
    'Find all project managers',
    'Who works in Information Technology department?',
    `Show me ${TEST_PERSON}'s org chart`,
    'Find managers in Information Technology department'
  ];

  for (const query of queries) {
    console.log(`👤 User: "${query}"`);
    try {
      const response = await orgChatbot.processQuery(query, { userEmail: TEST_PERSON });
      console.log(`🤖 Bot: ${response}`);
    } catch (error) {
      console.log(`🤖 Bot: I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    console.log('---');
  }

  // Demonstrate advanced features
  console.log('\n🔍 Advanced Features Demo\n');

  if (TEST_PERSON) {
    try {
      // Team insights
      console.log('📊 Team Insights:');
      const insights = await chatbotClient.getTeamInsights(TEST_PERSON);
      console.log(`Manager: ${insights.manager.displayName}`);
      console.log(`Total team size: ${insights.totalTeamSize}`);
      console.log(`Team depth: ${insights.teamDepth} levels`);
      console.log(`Avg span of control: ${insights.avgSpanOfControl.toFixed(1)}`);
      console.log('---');

      // Available fields
      console.log('🏗️  Available Org Fields:');
      const fields = await chatbotClient.getAvailableFields();
      const importantFields = fields.filter(f => f.filterable || f.searchable).slice(0, 5);
      importantFields.forEach(field => {
        console.log(`• ${field.name} (${field.objectKey}): ${field.type}${field.filterable ? ' [filterable]' : ''}${field.searchable ? ' [searchable]' : ''}`);
      });

    } catch (error) {
      console.log('Some advanced features require valid test data');
    }
  }

  console.log('\n✅ Demo completed!');
  console.log('\n💡 Integration Tips:');
  console.log('• Use natural language method names for easy chatbot mapping');
  console.log('• Handle errors gracefully with user-friendly messages');
  console.log('• Cache field metadata to understand org schema');
  console.log('• Use convenience methods like whoIsManager() for simple responses');
  console.log('• Include photos when building UI components');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
