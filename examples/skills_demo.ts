#!/usr/bin/env tsx
// Skills search functionality demo
// Demonstrates advanced skills-based queries and analytics

import 'dotenv/config';
import { SiftClient } from '../sift_client.js';
import { ChatbotSiftClient } from '../chatbot_sift_client.js';
import { SkillsClient } from '../skills_client.js';

async function main() {
  const DATA_TOKEN = process.env.SIFT_DATA_TOKEN;
  const MEDIA_TOKEN = process.env.SIFT_MEDIA_TOKEN;
  const TEST_PERSON = process.env.SIFT_TEST_PERSON;
  
  if (!DATA_TOKEN) {
    console.log('⚠️  Set SIFT_DATA_TOKEN in .env to run this demo');
    return;
  }

  // Initialize clients
  const siftClient = new SiftClient({ 
    dataToken: DATA_TOKEN, 
    mediaToken: MEDIA_TOKEN 
  });
  const chatbotClient = new ChatbotSiftClient(siftClient);
  const skillsClient = new SkillsClient(siftClient);

  console.log('🎯 Skills Search Demo\n');

  try {
    // Initialize skills client to discover schema
    await skillsClient.initialize();
    console.log('✅ Skills schema discovered and initialized\n');

    // Demo 1: Basic skills search
    console.log('🔍 Demo 1: Basic Skills Search');
    console.log('===============================');
    
    const commonSkills = ['JavaScript', 'Python', 'React', 'AWS', 'Docker'];
    
    for (const skill of commonSkills.slice(0, 3)) {
      console.log(`\n👤 Query: "Who knows ${skill}?"`);
      try {
        const response = await chatbotClient.whoKnowsSkill(skill);
        console.log(`🤖 Response: ${response}`);
      } catch (error) {
        console.log(`🤖 Response: No results found for ${skill}`);
      }
    }

    // Demo 2: Expert-level search
    console.log('\n\n🏆 Demo 2: Expert-Level Skills Search');
    console.log('=====================================');
    
    for (const skill of ['React', 'Python']) {
      console.log(`\n👤 Query: "Who are the ${skill} experts?"`);
      try {
        const response = await chatbotClient.whoAreTheExperts(skill);
        console.log(`🤖 Response: ${response}`);
      } catch (error) {
        console.log(`🤖 Response: No ${skill} experts found`);
      }
    }

    // Demo 3: Department-specific skills search
    console.log('\n\n🏢 Demo 3: Department-Specific Skills');
    console.log('====================================');
    
    const departments = ['Information Technology', 'Engineering'];
    
    for (const dept of departments) {
      console.log(`\n👤 Query: "Who knows JavaScript in ${dept}?"`);
      try {
        const response = await chatbotClient.whoKnowsSkill('JavaScript', dept);
        console.log(`🤖 Response: ${response}`);
      } catch (error) {
        console.log(`🤖 Response: No JavaScript skills found in ${dept}`);
      }
    }

    // Demo 4: Individual skills profile
    if (TEST_PERSON) {
      console.log('\n\n👨‍💻 Demo 4: Individual Skills Profile');
      console.log('====================================');
      
      console.log(`\n👤 Query: "What skills does ${TEST_PERSON} have?"`);
      try {
        const response = await chatbotClient.whatSkillsDoesPersonHave(TEST_PERSON);
        console.log(`🤖 Response: ${response}`);
      } catch (error) {
        console.log(`🤖 Response: Could not retrieve skills for ${TEST_PERSON}`);
      }

      console.log(`\n👤 Query: "Find people with similar skills to ${TEST_PERSON}"`);
      try {
        const similarPeople = await chatbotClient.findPeopleWithSimilarSkills(TEST_PERSON, 3);
        if (similarPeople.length > 0) {
          const names = similarPeople.map(p => 
            `${p.displayName || p.primaryEmail} (${p.skillsSummary})`
          );
          console.log(`🤖 Response: Found ${similarPeople.length} people with similar skills:\n${names.join('\n')}`);
        } else {
          console.log(`🤖 Response: No people found with similar skills`);
        }
      } catch (error) {
        console.log(`🤖 Response: Could not find similar skill profiles`);
      }
    }

    // Demo 5: Advanced multi-skill search
    console.log('\n\n🎯 Demo 5: Advanced Multi-Skill Search');
    console.log('=====================================');
    
    console.log(`\n👤 Query: "Find people who know both React AND TypeScript"`);
    try {
      const results = await chatbotClient.findPeopleWithSkills(['React', 'TypeScript'], {
        requireAll: true,
        limit: 5
      });
      
      if (results.length > 0) {
        const names = results.map(p => {
          const skills = p.matchedSkills.map(s => `${s.skill} (L${s.level || '?'})`);
          return `${p.displayName || p.primaryEmail}: ${skills.join(', ')}`;
        });
        console.log(`🤖 Response: Found ${results.length} people with both React and TypeScript:\n${names.join('\n')}`);
      } else {
        console.log(`🤖 Response: No people found with both React and TypeScript skills`);
      }
    } catch (error) {
      console.log(`🤖 Response: Could not perform multi-skill search`);
    }

    console.log(`\n👤 Query: "Find people who know React OR Vue OR Angular"`);
    try {
      const results = await chatbotClient.findPeopleWithSkills(['React', 'Vue', 'Angular'], {
        requireAll: false,
        limit: 5
      });
      
      if (results.length > 0) {
        const names = results.slice(0, 3).map(p => {
          const matchedSkills = p.matchedSkills.filter(s => 
            ['react', 'vue', 'angular'].some(skill => 
              s.skill.toLowerCase().includes(skill)
            )
          );
          const skills = matchedSkills.map(s => `${s.skill} (L${s.level || '?'})`);
          return `${p.displayName || p.primaryEmail}: ${skills.join(', ')}`;
        });
        console.log(`🤖 Response: Found ${results.length} people with frontend framework skills:\n${names.join('\n')}`);
        if (results.length > 3) console.log(`... and ${results.length - 3} more`);
      } else {
        console.log(`🤖 Response: No people found with frontend framework skills`);
      }
    } catch (error) {
      console.log(`🤖 Response: Could not perform frontend skills search`);
    }

    // Demo 6: Skills analytics
    console.log('\n\n📊 Demo 6: Skills Analytics');
    console.log('===========================');
    
    try {
      const analytics = await chatbotClient.getSkillsAnalytics();
      
      console.log(`\n📈 Organization Skills Overview:`);
      console.log(`• Total people with skills: ${analytics.totalPeopleWithSkills}`);
      console.log(`• Top 5 skills in the organization:`);
      
      analytics.topSkills.slice(0, 5).forEach((skill, index) => {
        console.log(`  ${index + 1}. ${skill.skill}: ${skill.count} people (avg level: ${skill.avgLevel.toFixed(1)})`);
      });

      console.log(`\n🏢 Skills by Department:`);
      Array.from(analytics.skillsByDepartment.entries()).slice(0, 3).forEach(([dept, skills]) => {
        console.log(`• ${dept}: ${skills.slice(0, 5).join(', ')}${skills.length > 5 ? '...' : ''}`);
      });
      
    } catch (error) {
      console.log(`📊 Skills analytics not available`);
    }

    // Demo 7: Skill suggestions
    console.log('\n\n💡 Demo 7: Skill Suggestions');
    console.log('============================');
    
    try {
      const suggestions = await chatbotClient.getSkillSuggestions('java', 5);
      if (suggestions.length > 0) {
        console.log(`\n🔍 Suggestions for "java":`);
        suggestions.forEach(s => {
          console.log(`• ${s.skill} (${s.frequency} people)`);
        });
      } else {
        console.log(`\n🔍 No suggestions found for "java"`);
      }
    } catch (error) {
      console.log(`💡 Skill suggestions not available`);
    }

  } catch (error) {
    console.error('Demo error:', error);
  }

  console.log('\n✅ Skills demo completed!');
  console.log('\n💡 Skills Search Features:');
  console.log('• Natural language queries: "Who knows React?"');
  console.log('• Expert-level filtering: "Who are the Python experts?"');
  console.log('• Department-specific search: "Find JavaScript developers in IT"');
  console.log('• Multi-skill queries: "Find people who know React AND TypeScript"');
  console.log('• Skills analytics and suggestions');
  console.log('• Individual skills profiles and similar people matching');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
