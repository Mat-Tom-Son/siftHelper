#!/usr/bin/env tsx
// Discover skills-related fields in the org data
// This helps us understand the schema before building the skills wrapper

import 'dotenv/config';
import { SiftClient } from '../sift_client.js';

async function discoverSkillsFields() {
  const DATA_TOKEN = process.env.SIFT_DATA_TOKEN;
  
  if (!DATA_TOKEN) {
    console.log('⚠️  Set SIFT_DATA_TOKEN in .env to run this script');
    return;
  }

  const client = new SiftClient({ dataToken: DATA_TOKEN });
  
  console.log('🔍 Discovering skills-related fields...\n');
  
  try {
    // Get all available fields
    const fields = await client.getFields();
    
    // Look for skills-related fields
    const skillsFields = fields.filter(field => {
      const key = field.objectKey?.toLowerCase() || '';
      const name = field.name?.toLowerCase() || '';
      return key.includes('skill') || name.includes('skill') || 
             key.includes('expertise') || name.includes('expertise') ||
             key.includes('competenc') || name.includes('competenc') ||
             key.includes('technolog') || name.includes('technolog');
    });
    
    console.log(`📊 Found ${skillsFields.length} potential skills-related fields:\n`);
    
    skillsFields.forEach(field => {
      console.log(`• ${field.name || 'Unknown'} (${field.objectKey})`);
      console.log(`  Type: ${field.type}`);
      console.log(`  Filterable: ${field.filterable ? '✅' : '❌'}`);
      console.log(`  Searchable: ${field.searchable ? '✅' : '❌'}`);
      console.log('');
    });
    
    // Also check for level-related fields
    const levelFields = fields.filter(field => {
      const key = field.objectKey?.toLowerCase() || '';
      const name = field.name?.toLowerCase() || '';
      return key.includes('level') || name.includes('level') ||
             key.includes('proficienc') || name.includes('proficienc') ||
             key.includes('rating') || name.includes('rating');
    });
    
    if (levelFields.length > 0) {
      console.log(`📈 Found ${levelFields.length} potential level-related fields:\n`);
      
      levelFields.forEach(field => {
        console.log(`• ${field.name || 'Unknown'} (${field.objectKey})`);
        console.log(`  Type: ${field.type}`);
        console.log(`  Filterable: ${field.filterable ? '✅' : '❌'}`);
        console.log(`  Searchable: ${field.searchable ? '✅' : '❌'}`);
        console.log('');
      });
    }
    
    // Sample a few people to see actual skills data structure
    console.log('🔬 Sampling actual skills data from people...\n');
    
    const sampleResponse = await client.searchPeopleGet({ pageSize: 5 });
    
    sampleResponse.data.forEach((person, index) => {
      console.log(`Person ${index + 1}: ${person.displayName || person.primaryEmail}`);
      
      skillsFields.forEach(field => {
        const value = (person as any)[field.objectKey];
        if (value !== undefined && value !== null) {
          console.log(`  ${field.objectKey}: ${JSON.stringify(value)}`);
        }
      });
      
      levelFields.forEach(field => {
        const value = (person as any)[field.objectKey];
        if (value !== undefined && value !== null) {
          console.log(`  ${field.objectKey}: ${JSON.stringify(value)}`);
        }
      });
      
      console.log('');
    });
    
  } catch (error) {
    console.error('Error discovering skills fields:', error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  discoverSkillsFields().catch(console.error);
}
