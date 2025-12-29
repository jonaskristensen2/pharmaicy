import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import dotenv from 'dotenv';
import { Backrooms } from './src/backrooms.js';
import { getRandomPrompt } from './src/prompts.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static(join(__dirname, 'public')));

// Config
const MAX_MESSAGES = 200;
const CONVERSATIONS_DIR = join(__dirname, 'conversations');
const ADMIN_KEY = process.env.ADMIN_KEY || 'stop123'; // Change this or set in .env

// Ensure conversations directory exists
if (!existsSync(CONVERSATIONS_DIR)) {
  mkdirSync(CONVERSATIONS_DIR);
}

// Global state
let backrooms = new Backrooms();
let currentConversation = null;
let conversationRunning = false;
let clients = new Set();

// Load saved conversations index
function getConversationsList() {
  const indexPath = join(CONVERSATIONS_DIR, 'index.json');
  if (existsSync(indexPath)) {
    return JSON.parse(readFileSync(indexPath, 'utf8'));
  }
  return [];
}

function saveConversationsList(list) {
  const indexPath = join(CONVERSATIONS_DIR, 'index.json');
  writeFileSync(indexPath, JSON.stringify(list, null, 2));
}

function saveConversation(conversation) {
  const id = Date.now().toString();
  const filename = `${id}.json`;
  
  const data = {
    id,
    prompt: conversation.prompt,
    messages: conversation.messages,
    timestamp: new Date().toISOString(),
    messageCount: conversation.messages.length
  };
  
  writeFileSync(join(CONVERSATIONS_DIR, filename), JSON.stringify(data, null, 2));
  
  // Update index
  const list = getConversationsList();
  list.unshift({
    id,
    prompt: conversation.prompt,
    timestamp: data.timestamp,
    messageCount: data.messageCount
  });
  
  // Keep only last 50 conversations
  if (list.length > 50) {
    list.pop();
  }
  
  saveConversationsList(list);
  
  return id;
}

function getConversation(id) {
  const filepath = join(CONVERSATIONS_DIR, `${id}.json`);
  if (existsSync(filepath)) {
    return JSON.parse(readFileSync(filepath, 'utf8'));
  }
  return null;
}

// API endpoints
app.get('/api/conversations', (req, res) => {
  res.json(getConversationsList());
});

app.get('/api/conversations/:id', (req, res) => {
  const conversation = getConversation(req.params.id);
  if (conversation) {
    res.json(conversation);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.get('/api/current', (req, res) => {
  if (currentConversation) {
    res.json({
      prompt: currentConversation.prompt,
      messages: backrooms.messages,
      running: conversationRunning
    });
  } else {
    res.json({ prompt: null, messages: [], running: false });
  }
});

// Admin endpoints to control the conversation
app.get('/api/admin/stop', (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid key' });
  }
  
  conversationRunning = false;
  console.log('Conversation stopped by admin');
  res.json({ status: 'stopped', message: 'Conversation paused' });
});

app.get('/api/admin/start', (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid key' });
  }
  
  if (!conversationRunning) {
    if (currentConversation && backrooms.messages.length > 0) {
      // Resume existing conversation
      conversationRunning = true;
      runConversation();
      console.log('Conversation resumed by admin');
      res.json({ status: 'resumed', message: 'Conversation resumed' });
    } else {
      // Start new conversation
      startNewConversation();
      console.log('New conversation started by admin');
      res.json({ status: 'started', message: 'New conversation started' });
    }
  } else {
    res.json({ status: 'already_running', message: 'Conversation already running' });
  }
});

app.get('/api/admin/status', (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid key' });
  }
  
  res.json({
    running: conversationRunning,
    messageCount: backrooms.messages.length,
    maxMessages: MAX_MESSAGES,
    clients: clients.size
  });
});

// Broadcast to all connected clients
function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  });
}

// Start a new conversation
async function startNewConversation() {
  const prompt = getRandomPrompt();
  
  currentConversation = {
    prompt,
    messages: [],
    startedAt: Date.now()
  };
  
  backrooms = new Backrooms();
  await backrooms.start(prompt);
  conversationRunning = true;
  
  broadcast({ type: 'new_conversation', prompt });
  broadcast({ type: 'message', data: backrooms.messages[0] });
  
  console.log(`New conversation started: "${prompt}"`);
  
  runConversation();
}

// Run the conversation loop
async function runConversation() {
  while (conversationRunning && backrooms.messages.length < MAX_MESSAGES) {
    try {
      // "Thinking" delay before generating
      const thinkDelay = 500 + Math.random() * 1500;
      await sleep(thinkDelay);
      
      if (!conversationRunning) break;
      
      const message = await backrooms.generateNext();
      broadcast({ type: 'message', data: message });
      
      // Wait for typing animation + pause
      const wordCount = message.content.split(' ').length;
      const typingTime = wordCount * 50;
      const pauseAfter = 1000 + Math.random() * 2000;
      await sleep(typingTime + pauseAfter);
      
    } catch (error) {
      console.error('Conversation error:', error);
      await sleep(5000); // Wait and retry
    }
  }
  
  // Conversation ended
  if (backrooms.messages.length >= MAX_MESSAGES) {
    console.log('Conversation reached max messages, saving...');
    
    const savedId = saveConversation({
      prompt: currentConversation.prompt,
      messages: backrooms.messages
    });
    
    broadcast({ type: 'conversation_ended', id: savedId });
    
    // Start new conversation after a pause
    await sleep(5000);
    startNewConversation();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// WebSocket connections
wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);
  
  // Send current state to new client
  if (currentConversation) {
    ws.send(JSON.stringify({ 
      type: 'current_state',
      prompt: currentConversation.prompt,
      messages: backrooms.messages
    }));
  }
  
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`The Pharmaicy is open on http://localhost:${PORT}`);
  
  // Start the first conversation
  startNewConversation();
});
