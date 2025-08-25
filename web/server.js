// Simple Express server for the org search web interface
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { SiftClient } from '../sift_client.js';
import { ChatbotSiftClient } from '../chatbot_sift_client.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Initialize Sift clients
const siftClient = new SiftClient({ 
  dataToken: process.env.SIFT_DATA_TOKEN,
  mediaToken: process.env.SIFT_MEDIA_TOKEN 
});
const chatbotClient = new ChatbotSiftClient(siftClient);

app.use(express.json());
app.use(express.static(__dirname));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Org metadata endpoints
app.get('/api/org/metadata', async (req, res) => {
  try {
    // Get departments, offices, and other org-level data
    const [departments, fields] = await Promise.all([
      chatbotClient.getAllDepartments().catch(() => []),
      chatbotClient.getAvailableFields().catch(() => [])
    ]);
    
    // Extract office locations from fields if available
    const officeField = fields.find(f => f.objectKey?.includes('office') || f.objectKey?.includes('location'));
    const offices = []; // Would need to sample data to get actual offices
    
    res.json({ 
      success: true, 
      metadata: {
        departments,
        offices,
        totalFields: fields.length,
        searchableFields: fields.filter(f => f.searchable).length,
        filterableFields: fields.filter(f => f.filterable).length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Skills search endpoints
app.post('/api/skills/search', async (req, res) => {
  try {
    const { skills, requireAll, minLevel, department, limit } = req.body;
    
    const results = await chatbotClient.findPeopleWithSkills(skills, {
      requireAll,
      minLevel,
      department,
      limit: limit || 10
    });
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/skills/who-knows/:skill', async (req, res) => {
  try {
    const { skill } = req.params;
    const { department } = req.query;
    
    const response = await chatbotClient.whoKnowsSkill(skill, department);
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/skills/experts/:skill', async (req, res) => {
  try {
    const { skill } = req.params;
    const { department } = req.query;
    
    const response = await chatbotClient.whoAreTheExperts(skill, department);
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/skills/person/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    const response = await chatbotClient.whatSkillsDoesPersonHave(email);
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/skills/similar/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const limit = parseInt(req.query.limit) || 5;
    
    const results = await chatbotClient.findPeopleWithSimilarSkills(email, limit);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/skills/analytics', async (req, res) => {
  try {
    const { department } = req.query;
    
    const analytics = await chatbotClient.getSkillsAnalytics(department);
    
    // Convert Map to Object for JSON serialization
    const skillsByDepartment = Object.fromEntries(analytics.skillsByDepartment);
    
    res.json({ 
      success: true, 
      analytics: {
        ...analytics,
        skillsByDepartment
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/skills/suggestions', async (req, res) => {
  try {
    const { query, limit } = req.query;
    
    const suggestions = await chatbotClient.getSkillSuggestions(query, parseInt(limit) || 10);
    res.json({ success: true, suggestions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Org structure endpoints
app.get('/api/org/manager/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    const response = await chatbotClient.whoIsManager(email);
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/org/reports/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    const response = await chatbotClient.whoReportsTo(email);
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/org/team-size/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    const response = await chatbotClient.howBigIsTeam(email);
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/org/department/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    const response = await chatbotClient.whoWorksInDepartment(name);
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/org/managers/:department', async (req, res) => {
  try {
    const { department } = req.params;
    
    const results = await chatbotClient.findManagersInDepartment(department);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// People search endpoints
app.get('/api/people/search', async (req, res) => {
  try {
    const { q, department, office, limit } = req.query;
    
    const results = await chatbotClient.searchPeopleByQuery(q, {
      department,
      office,
      limit: parseInt(limit) || 10
    });
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`🌐 Org Search Web Interface running at http://localhost:${port}`);
  console.log(`📊 Skills search, org structure, and people discovery available`);
});
