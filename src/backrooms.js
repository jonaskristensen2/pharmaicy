import { allDrugs, getRandomDrug } from './pharmaicy/index.js';
import { chat } from './openai.js';

export class Backrooms {
  constructor() {
    this.messages = [];
    this.participants = [...allDrugs];
    this.lastSpeaker = null;
    this.isRunning = false;
  }

  // Format conversation history for the AI
  formatHistory() {
    return this.messages.map(msg => ({
      role: 'user', // All previous messages appear as context
      content: `[${msg.speaker}]: ${msg.content}`
    }));
  }

  // Pick next speaker (avoid same speaker twice, weighted random)
  pickNextSpeaker() {
    // Filter out last speaker to avoid repetition
    const candidates = this.participants.filter(
      p => p.name !== this.lastSpeaker
    );
    
    // Random selection
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Clean response of any accidental name tags
  cleanResponse(text, speakerName) {
    let cleaned = text.trim();
    // Remove any variation of speaker tag at the start
    const patterns = [
      new RegExp(`^\\[${speakerName}\\]:?\\s*`, 'i'),
      new RegExp(`^${speakerName}:?\\s*`, 'i'),
      /^\[[\w]+\]:?\s*/,
    ];
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '');
    }
    return cleaned.trim();
  }

  // Generate the next message in the conversation
  async generateNext() {
    const speaker = this.pickNextSpeaker();
    const history = this.formatHistory();
    
    const contextPrompt = `${speaker.systemPrompt}

Others in this conversation: COCAINE, WEED, AYAHUASCA, KETAMINE, ALCOHOL.
Respond to what was just said. 1-3 sentences only. Do NOT start with your name.`;

    try {
      const response = await chat(contextPrompt, history, speaker.params);
      const cleaned = this.cleanResponse(response, speaker.name);
      
      this.lastSpeaker = speaker.name;
      const message = {
        speaker: speaker.name,
        content: cleaned,
        color: speaker.color,
        timestamp: Date.now()
      };
      
      this.messages.push(message);
      return message;
    } catch (error) {
      console.error('Error generating response:', error);
      throw error;
    }
  }

  // Start a conversation with an initial prompt
  async start(initialPrompt) {
    this.messages = [];
    this.lastSpeaker = null;
    this.isRunning = true;

    // Add the initial prompt as context
    this.messages.push({
      speaker: 'PROMPT',
      content: initialPrompt,
      color: '#888888',
      timestamp: Date.now()
    });

    return this.messages[0];
  }

  // Stop the conversation
  stop() {
    this.isRunning = false;
  }

  // Clear conversation history
  clear() {
    this.messages = [];
    this.lastSpeaker = null;
  }
}

