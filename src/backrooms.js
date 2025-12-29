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

  // Generate the next message in the conversation
  async generateNext() {
    const speaker = this.pickNextSpeaker();
    const history = this.formatHistory();
    
    // Add context about who's in the conversation
    const participantNames = this.participants.map(p => p.name).join(', ');
    const contextPrompt = `${speaker.systemPrompt}

You are [${speaker.name}] in a conversation with: ${participantNames}.
The conversation has been going organically. Respond naturally to what was just said, or take it in a new direction if it feels right. Keep your response concise - this is a flowing conversation, not a monologue.`;

    try {
      const response = await chat(contextPrompt, history, speaker.params);
      
      this.lastSpeaker = speaker.name;
      const message = {
        speaker: speaker.name,
        content: response.trim(),
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

