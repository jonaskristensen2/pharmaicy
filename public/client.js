class PharmaicyClient {
  constructor() {
    this.ws = null;
    this.messageCount = 0;
    
    // DOM elements
    this.conversation = document.getElementById('conversation');
    this.promptInput = document.getElementById('prompt-input');
    this.startBtn = document.getElementById('start-btn');
    this.stopBtn = document.getElementById('stop-btn');
    this.status = document.getElementById('status');
    this.messageCountEl = document.getElementById('message-count');
    this.aboutToggle = document.getElementById('about-toggle');
    this.aboutPanel = document.getElementById('about-panel');
    
    this.bindEvents();
    this.connect();
  }
  
  bindEvents() {
    this.startBtn.addEventListener('click', () => this.start());
    this.stopBtn.addEventListener('click', () => this.stop());
    
    this.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.start();
      }
    });
    
    // About panel toggle
    this.aboutToggle.addEventListener('click', () => {
      this.aboutPanel.classList.toggle('open');
      this.aboutToggle.textContent = this.aboutPanel.classList.contains('open') 
        ? 'close' 
        : 'what is this?';
    });
  }
  
  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    this.ws.onopen = () => {
      this.setStatus('connected', 'connected');
    };
    
    this.ws.onclose = () => {
      this.setStatus('disconnected', '');
      // Attempt to reconnect after 3 seconds
      setTimeout(() => this.connect(), 3000);
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
  }
  
  handleMessage(message) {
    switch (message.type) {
      case 'message':
        this.addMessage(message.data);
        break;
      case 'stopped':
        this.setRunning(false);
        break;
      case 'error':
        this.addError(message.message);
        this.setRunning(false);
        break;
    }
  }
  
  start() {
    const prompt = this.promptInput.value.trim();
    if (!prompt) return;
    
    // Clear conversation
    this.conversation.innerHTML = '';
    this.messageCount = 0;
    this.updateMessageCount();
    
    // Close about panel if open
    this.aboutPanel.classList.remove('open');
    this.aboutToggle.textContent = 'what is this?';
    
    // Send start command
    this.ws.send(JSON.stringify({
      type: 'start',
      prompt: prompt
    }));
    
    this.setRunning(true);
    this.promptInput.value = '';
  }
  
  stop() {
    this.ws.send(JSON.stringify({ type: 'stop' }));
    this.setRunning(false);
  }
  
  addMessage(data) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${data.speaker.toLowerCase()}`;
    
    if (data.speaker === 'PROMPT') {
      messageEl.classList.add('prompt');
    }
    
    messageEl.innerHTML = `
      <span class="speaker" style="color: ${data.color}">[${data.speaker}]</span>
      <span class="content">${this.escapeHtml(data.content)}</span>
    `;
    
    this.conversation.appendChild(messageEl);
    this.scrollToBottom();
    
    this.messageCount++;
    this.updateMessageCount();
  }
  
  addError(errorMessage) {
    const errorEl = document.createElement('div');
    errorEl.className = 'message error';
    errorEl.style.color = '#ff6b6b';
    errorEl.textContent = `[ERROR] ${errorMessage}`;
    this.conversation.appendChild(errorEl);
    this.scrollToBottom();
  }
  
  scrollToBottom() {
    this.conversation.scrollTop = this.conversation.scrollHeight;
  }
  
  setRunning(running) {
    this.startBtn.disabled = running;
    this.stopBtn.disabled = !running;
    this.promptInput.disabled = running;
    
    if (running) {
      this.setStatus('running', 'running');
    } else {
      this.setStatus('connected', 'connected');
    }
  }
  
  setStatus(text, className) {
    this.status.textContent = text;
    this.status.className = className;
  }
  
  updateMessageCount() {
    this.messageCountEl.textContent = `${this.messageCount} messages`;
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize
const client = new PharmaicyClient();
