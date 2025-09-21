/**
 * Shared Context Manager - Manages user interactions and responses across agents
 * This utility provides centralized management of user responses to minimize
 * hallucination and memory loss during agent interactions.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const WorkingMemoryStore = require('./working-memory-store');

class SharedContextManager {
  constructor(baseDirectory = '.ai') {
    this.baseDirectory = path.resolve(baseDirectory);
    this.contextFilePath = path.join(this.baseDirectory, 'shared-context.json');
    this.legacyUserInteractionsPath = path.join(this.baseDirectory, 'user-interactions.json');
    this.contextCache = null;
    this.contextCacheTimestamp = null;
    this.CACHE_TTL = 30000; // 30 seconds
    this.memoryStore = new WorkingMemoryStore(path.join(this.baseDirectory, 'working-memory'));
  }

  /**
   * Retry utility with exponential backoff for file operations
   */
  async retryWithBackoff(operation, maxRetries = 3, baseDelay = 100) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Initialize the shared context system
   */
  async initialize() {
    try {
      // Ensure base directory exists
      await fs.mkdir(this.baseDirectory, { recursive: true });

      // Initialize context file if it doesn't exist
      if (!(await this.fileExists(this.contextFilePath))) {
        await this.resetContext();
      }

      await this.memoryStore.initialize();

      // Migrate legacy interaction store if present
      if (await this.fileExists(this.legacyUserInteractionsPath)) {
        await this.migrateLegacyInteractions();
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize SharedContextManager:', error);
      return false;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reset the shared context to initial state
   */
  async resetContext() {
    const initialContext = {
      sessionId: this.generateSessionId(),
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      currentPhase: 'initialization',
      activeAgents: [],
      globalContext: {
        projectInfo: null,
        requirements: {},
        constraints: {},
        decisions: [],
        keyFacts: []
      },
      agentContext: {},
      userResponseSummary: {},
      workflowState: {
        currentStep: null,
        completedSteps: [],
        pendingSteps: []
      }
    };
    
    await this.retryWithBackoff(() => 
      fs.writeFile(this.contextFilePath, JSON.stringify(initialContext, null, 2))
    );
    this.contextCache = initialContext;
    this.contextCacheTimestamp = Date.now();
    
    return initialContext;
  }

  /**
   * Reset user interactions log
   */
  async resetUserInteractions() {
    await this.memoryStore.resetAll();
    return {
      sessionId: this.generateSessionId(),
      createdAt: new Date().toISOString(),
      interactions: [],
      summary: {
        totalInteractions: 0,
        agentBreakdown: {},
        topicsSummary: []
      }
    };
  }

  /**
   * Migrate interactions from legacy single-file storage to chunked store
   */
  async migrateLegacyInteractions() {
    try {
      const raw = await fs.readFile(this.legacyUserInteractionsPath, 'utf8');
      const legacy = JSON.parse(raw);
      const interactions = Array.isArray(legacy?.interactions) ? legacy.interactions : [];

      const ordered = interactions
        .slice()
        .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

      for (const interaction of ordered) {
        if (!interaction.id) {
          interaction.id = `${interaction.agentName || 'agent'}_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
        }
        const agentName = interaction.agentName || 'unknown';
        await this.memoryStore.appendInteraction(agentName, interaction);
      }

      await fs.rm(this.legacyUserInteractionsPath, { force: true });
      console.log('Migrated legacy user interactions into chunked working-memory store.');
    } catch (error) {
      console.error('Failed to migrate legacy interactions:', error);
    }
  }

  /**
   * Generate a unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Load shared context with caching
   */
  async loadContext() {
    try {
      const now = Date.now();
      
      // Return cached version if still valid
      if (this.contextCache && this.contextCacheTimestamp && 
          (now - this.contextCacheTimestamp) < this.CACHE_TTL) {
        return this.contextCache;
      }
      
      const contextData = await this.retryWithBackoff(() => 
        fs.readFile(this.contextFilePath, 'utf8')
      );
      const context = JSON.parse(contextData);
      
      // Update cache
      this.contextCache = context;
      this.contextCacheTimestamp = now;
      
      return context;
    } catch (error) {
      console.error('Failed to load shared context:', error);
      // Return a minimal context if loading fails
      return await this.resetContext();
    }
  }

  /**
   * Save shared context and invalidate cache
   */
  async saveContext(context) {
    try {
      context.lastUpdated = new Date().toISOString();
      await this.retryWithBackoff(() => 
        fs.writeFile(this.contextFilePath, JSON.stringify(context, null, 2))
      );
      
      // Update cache
      this.contextCache = context;
      this.contextCacheTimestamp = Date.now();
      
      return true;
    } catch (error) {
      console.error('Failed to save shared context:', error);
      return false;
    }
  }

  /**
   * Record a user interaction with comprehensive context
   */
  async recordUserInteraction(agentName, question, userResponse, options = {}) {
    try {
      const interactionId = `${agentName}_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
      
      const interaction = {
        id: interactionId,
        timestamp: new Date().toISOString(),
        agentName,
        phase: options.phase || 'unknown',
        context: {
          taskId: options.taskId,
          epicId: options.epicId,
          storyId: options.storyId,
          workflowStep: options.workflowStep
        },
        question: {
          text: question,
          type: options.questionType || 'open-ended',
          category: options.category || 'general'
        },
        userResponse: {
          original: userResponse,
          processed: this.processUserResponse(userResponse),
          confirmed: false,
          confirmationAttempts: 0
        },
        summary: options.summary || null,
        tags: options.tags || [],
        importance: options.importance || 'medium'
      };

      await this.memoryStore.appendInteraction(agentName, interaction);
      await this.updateContextWithUserInput(agentName, interaction);
      
      return interaction;
    } catch (error) {
      console.error('Failed to record user interaction:', error);
      return null;
    }
  }

  /**
   * Process and clean user response
   */
  processUserResponse(response) {
    if (typeof response !== 'string') {
      response = String(response);
    }
    
    const cleaned = response.trim();
    return {
      cleaned: cleaned,
      wordCount: cleaned === '' ? 0 : cleaned.split(/\s+/).length,
      hasSpecialRequirements: /\b(must|should|required|mandatory)\b/i.test(response),
      hasNegations: /\b(not|don't|doesn't|won't|can't|shouldn't)\b/i.test(response),
      containsNumbers: /\d+/.test(response),
      containsUrls: /https?:\/\/[^\s]+/g.test(response),
      keyPhrases: this.extractKeyPhrases(response)
    };
  }

  /**
   * Extract key phrases from user response
   */
  extractKeyPhrases(text) {
    const phrases = [];
    const words = text.toLowerCase().split(/\s+/);
    
    // Look for common requirement phrases
    const patterns = [
      /\b(needs? to|has to|must|should|required to)\s+(\w+(?:\s+\w+){0,3})/g,
      /\b(will|would|can|could|might)\s+(\w+(?:\s+\w+){0,2})/g,
      /\b(feature|functionality|requirement|constraint)\s+(\w+(?:\s+\w+){0,2})/g
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        phrases.push(match[0]);
      }
    });
    
    return phrases.slice(0, 5); // Limit to top 5 phrases
  }

  /**
   * Update shared context with user input
   */
  async updateContextWithUserInput(agentName, interaction) {
    try {
      const context = await this.loadContext();
      
      // Ensure agent context exists
      if (!context.agentContext[agentName]) {
        context.agentContext[agentName] = {
          interactions: [],
          keyFacts: [],
          decisions: [],
          lastActivity: null
        };
      }
      
      // Add interaction reference
      context.agentContext[agentName].interactions.push(interaction.id);
      context.agentContext[agentName].lastActivity = interaction.timestamp;
      
      // Extract and store key facts from user response
      const keyFacts = this.extractKeyFactsFromResponse(interaction);
      if (keyFacts.length > 0) {
        context.agentContext[agentName].keyFacts.push(...keyFacts);
        // Also add to global context
        context.globalContext.keyFacts.push(...keyFacts);
      }
      
      // Update agent activity
      if (!context.activeAgents.includes(agentName)) {
        context.activeAgents.push(agentName);
      }
      
      // Update user response summary for quick access
      if (!context.userResponseSummary[agentName]) {
        context.userResponseSummary[agentName] = [];
      }
      
      context.userResponseSummary[agentName].push({
        interactionId: interaction.id,
        timestamp: interaction.timestamp,
        question: interaction.question.text.substring(0, 100) + '...',
        response: interaction.userResponse.original.substring(0, 200) + '...',
        summary: interaction.summary,
        importance: interaction.importance
      });
      
      // Keep only last 10 summaries per agent to prevent bloating
      if (context.userResponseSummary[agentName].length > 10) {
        context.userResponseSummary[agentName] = context.userResponseSummary[agentName].slice(-10);
      }
      
      await this.saveContext(context);
      return true;
    } catch (error) {
      console.error('Failed to update context with user input:', error);
      return false;
    }
  }

  /**
   * Extract key facts from user response
   */
  extractKeyFactsFromResponse(interaction) {
    const keyFacts = [];
    const response = interaction.userResponse;
    
    // Create key facts based on response content
    if (response.processed.hasSpecialRequirements) {
      keyFacts.push({
        id: `fact_${interaction.id}_req`,
        type: 'requirement',
        content: response.original,
        source: 'user_input',
        agentName: interaction.agentName,
        timestamp: interaction.timestamp,
        confidence: 'high'
      });
    }
    
    if (response.processed.keyPhrases.length > 0) {
      response.processed.keyPhrases.forEach((phrase, index) => {
        keyFacts.push({
          id: `fact_${interaction.id}_phrase_${index}`,
          type: 'key_phrase',
          content: phrase,
          source: 'user_input',
          agentName: interaction.agentName,
          timestamp: interaction.timestamp,
          confidence: 'medium'
        });
      });
    }
    
    return keyFacts;
  }

  /**
   * Confirm user response with agent
   */
  async confirmUserResponse(interactionId, agentName, confirmationText) {
    try {
      const updated = await this.memoryStore.updateInteraction(agentName, interactionId, interaction => {
        const confirmationAttempts = (interaction.userResponse.confirmationAttempts || 0) + 1;
        return {
          ...interaction,
          userResponse: {
            ...interaction.userResponse,
            confirmed: true,
            confirmationAttempts,
            confirmationText,
            confirmedAt: new Date().toISOString()
          }
        };
      });

      if (!updated) {
        throw new Error(`Interaction ${interactionId} not found for agent ${agentName}`);
      }

      return updated;
    } catch (error) {
      console.error('Failed to confirm user response:', error);
      return null;
    }
  }

  /**
   * Get relevant context for an agent
   */
  async getContextForAgent(agentName, options = {}) {
    try {
      const context = await this.loadContext();
      
      // Get agent-specific context
      const agentContext = context.agentContext[agentName] || {};
      
      // Get relevant user interactions
      const interactions = await this.getRelevantInteractions(agentName, options);
      
      // Build comprehensive context
      const relevantContext = {
        sessionInfo: {
          sessionId: context.sessionId,
          currentPhase: context.currentPhase,
          workflowState: context.workflowState
        },
        globalContext: context.globalContext,
        agentContext: agentContext,
        userInteractions: interactions,
        recentUserResponses: context.userResponseSummary[agentName] || [],
        lastUpdated: context.lastUpdated
      };
      
      return relevantContext;
    } catch (error) {
      console.error('Failed to get context for agent:', error);
      return null;
    }
  }

  /**
   * Get relevant user interactions for an agent
   */
  async getRelevantInteractions(agentName, options = {}) {
    try {
      const includeAllAgents = options.agentSpecific === false || agentName === 'all';
      const rawAgents = includeAllAgents
        ? await this.memoryStore.listAgentDirectories()
        : [agentName];
      const targetAgents = rawAgents.filter(name => Boolean(name) && name !== 'all');

      if (targetAgents.length === 0) {
        return [];
      }

      const filters = {
        storyId: options.storyId,
        epicId: options.epicId,
        phase: options.phase
      };

      const interactions = await this.memoryStore.getInteractions(targetAgents, {
        limit: options.limit,
        filters
      });

      return interactions;
    } catch (error) {
      console.error('Failed to get relevant interactions:', error);
      return [];
    }
  }

  /**
   * Update workflow state
   */
  async updateWorkflowState(currentStep, completedSteps = [], pendingSteps = []) {
    try {
      const context = await this.loadContext();
      
      context.workflowState = {
        currentStep,
        completedSteps: [...new Set([...context.workflowState.completedSteps, ...completedSteps])],
        pendingSteps: [...new Set(pendingSteps)]
      };
      
      await this.saveContext(context);
      return true;
    } catch (error) {
      console.error('Failed to update workflow state:', error);
      return false;
    }
  }

  /**
   * Add a global decision or key fact
   */
  async addGlobalContext(type, content, source = 'system') {
    try {
      const context = await this.loadContext();
      
      const item = {
        id: `${type}_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        content,
        source,
        timestamp: new Date().toISOString()
      };
      
      if (type === 'decision') {
        context.globalContext.decisions.push(item);
      } else if (type === 'keyFact') {
        context.globalContext.keyFacts.push(item);
      }
      
      await this.saveContext(context);
      return item;
    } catch (error) {
      console.error('Failed to add global context:', error);
      return null;
    }
  }

  /**
   * Get a summary of all user interactions for handoff between agents
   */
  async getUserInteractionsSummary(options = {}) {
    try {
      const interactions = await this.getRelevantInteractions('all', { agentSpecific: false, ...options });
      
      const summary = {
        totalInteractions: interactions.length,
        agentBreakdown: {},
        importantResponses: [],
        keyDecisions: [],
        openQuestions: []
      };
      
      interactions.forEach(interaction => {
        // Count by agent
        if (!summary.agentBreakdown[interaction.agentName]) {
          summary.agentBreakdown[interaction.agentName] = 0;
        }
        summary.agentBreakdown[interaction.agentName]++;
        
        // Collect important responses
        if (interaction.importance === 'high' || 
            interaction.userResponse.processed.hasSpecialRequirements) {
          summary.importantResponses.push({
            agent: interaction.agentName,
            question: interaction.question.text,
            response: interaction.userResponse.original,
            timestamp: interaction.timestamp
          });
        }
        
        // Collect unconfirmed responses as open questions
        if (!interaction.userResponse.confirmed) {
          summary.openQuestions.push({
            agent: interaction.agentName,
            question: interaction.question.text,
            response: interaction.userResponse.original,
            needsConfirmation: true
          });
        }
      });
      
      return summary;
    } catch (error) {
      console.error('Failed to get user interactions summary:', error);
      return null;
    }
  }

  /**
   * Clear old interactions and context (cleanup)
   */
  async cleanup(olderThanDays = 7) {
    try {
      const olderThanMs = olderThanDays * 24 * 60 * 60 * 1000;
      await this.memoryStore.cleanup({ olderThanMs });
      console.log('Cleaned up old interactions from working-memory store');
      return true;
    } catch (error) {
      console.error('Failed to cleanup old interactions:', error);
      return false;
    }
  }
}

module.exports = SharedContextManager;
