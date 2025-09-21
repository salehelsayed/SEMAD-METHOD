const fs = require('fs').promises;
const path = require('path');

/**
 * Chunked working-memory store used by agents to persist interactions without
 * blowing up single JSON files. Each agent gets session directories with
 * limited-size chunk files containing JSONL records.
 */
class WorkingMemoryStore {
  constructor(baseDirectory = '.ai/working-memory', options = {}) {
    this.baseDirectory = path.resolve(baseDirectory);
    this.maxInteractionsPerChunk = options.maxInteractionsPerChunk || 50;
    this.maxChunksPerSession = options.maxChunksPerSession || 40;
    this.sessionTtlMs = options.sessionTtlMs || (options.sessionTtlDays ? options.sessionTtlDays * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000);
  }

  async initialize() {
    await fs.mkdir(this.baseDirectory, { recursive: true });
  }

  async resetAll() {
    await fs.rm(this.baseDirectory, { recursive: true, force: true });
    await this.initialize();
  }

  async appendInteraction(agentName, interaction) {
    await this.initialize();
    const agentDir = await this.ensureAgentDirectory(agentName);
    const metadata = await this.loadMetadata(agentDir);
    const sessionId = await this.ensureActiveSession(agentDir, metadata);
    const { chunkInfo, chunkPath } = await this.ensureWritableChunk(agentDir, sessionId, metadata, agentName);

    await fs.appendFile(chunkPath, `${JSON.stringify(interaction)}\n`);

    chunkInfo.count += 1;
    chunkInfo.updatedAt = new Date().toISOString();
    metadata.sessions[sessionId].updatedAt = chunkInfo.updatedAt;
    metadata.index[interaction.id] = {
      sessionId,
      chunkFile: chunkInfo.file
    };
    metadata.summary.totalInteractions += 1;
    metadata.summary.agentInteractions = metadata.summary.agentInteractions || {};
    metadata.summary.agentInteractions[agentName] = (metadata.summary.agentInteractions[agentName] || 0) + 1;

    await this.saveMetadata(agentDir, metadata);
  }

  async updateInteraction(agentName, interactionId, updateFn) {
    const agentDir = path.join(this.baseDirectory, agentName);
    const metadata = await this.loadMetadata(agentDir, { createIfMissing: false });
    if (!metadata || !metadata.index[interactionId]) {
      return null;
    }

    const { sessionId, chunkFile } = metadata.index[interactionId];
    const chunkPath = path.join(agentDir, sessionId, chunkFile);
    const records = await this.readChunk(chunkPath);
    const updatedRecords = [];
    let updatedInteraction = null;

    records.forEach(record => {
      if (record.id === interactionId) {
        const modified = updateFn({ ...record });
        if (modified) {
          updatedInteraction = { ...record, ...modified };
          updatedRecords.push(updatedInteraction);
        } else {
          updatedRecords.push(record);
        }
      } else {
        updatedRecords.push(record);
      }
    });

    if (!updatedInteraction) {
      return null;
    }

    await this.writeChunk(chunkPath, updatedRecords);
    const sessionInfo = metadata.sessions[sessionId];
    const chunkInfo = sessionInfo.chunks.find(chunk => chunk.file === chunkFile);
    if (chunkInfo) {
      chunkInfo.count = updatedRecords.length;
      chunkInfo.updatedAt = new Date().toISOString();
    }
    sessionInfo.updatedAt = new Date().toISOString();
    await this.saveMetadata(agentDir, metadata);

    return updatedInteraction;
  }

  async getInteractions(agentNames, options = {}) {
    await this.initialize();
    const names = Array.isArray(agentNames) ? agentNames : [agentNames];
    const limit = options.limit || Infinity;
    const filters = options.filters || {};

    const interactions = [];

    for (const name of names) {
      const agentDir = path.join(this.baseDirectory, name);
      const metadata = await this.loadMetadata(agentDir, { createIfMissing: false });
      if (!metadata) {
        continue;
      }

      const sessions = Object.entries(metadata.sessions)
        .sort(([, a], [, b]) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

      for (const [sessionId, sessionInfo] of sessions) {
        const chunks = sessionInfo.chunks
          .slice()
          .sort((a, b) => b.sequence - a.sequence);

        for (const chunk of chunks) {
          const chunkPath = path.join(agentDir, sessionId, chunk.file);
          const records = await this.readChunk(chunkPath);

          for (let i = records.length - 1; i >= 0; i -= 1) {
            const record = records[i];
            if (this.passesFilters(record, filters)) {
              interactions.push(record);
              if (interactions.length >= limit) {
                return interactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
              }
            }
          }
        }
      }
    }

    return interactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async cleanup(options = {}) {
    const cutoff = options.olderThanMs ? Date.now() - options.olderThanMs : Date.now() - this.sessionTtlMs;
    const agentNames = await this.listAgentDirectories();

    for (const agentName of agentNames) {
      const agentDir = path.join(this.baseDirectory, agentName);
      const metadata = await this.loadMetadata(agentDir, { createIfMissing: false });
      if (!metadata) {
        continue;
      }

      const sessions = Object.entries(metadata.sessions);
      for (const [sessionId, sessionInfo] of sessions) {
        const lastUpdated = new Date(sessionInfo.updatedAt || sessionInfo.createdAt).getTime();
        if (lastUpdated < cutoff) {
          await fs.rm(path.join(agentDir, sessionId), { recursive: true, force: true });
          delete metadata.sessions[sessionId];
        }
      }

      metadata.activeSession = this.resolveNewActiveSession(metadata);
      metadata.index = await this.rebuildIndex(agentDir, metadata);
      metadata.summary.totalInteractions = await this.calculateTotalInteractions(metadata);
      metadata.summary.agentInteractions = metadata.summary.agentInteractions || {};
      metadata.summary.agentInteractions[agentName] = metadata.summary.totalInteractions;
      await this.saveMetadata(agentDir, metadata);
    }
  }

  async listAgentDirectories() {
    try {
      const entries = await fs.readdir(this.baseDirectory, { withFileTypes: true });
      return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async ensureAgentDirectory(agentName) {
    const agentDir = path.join(this.baseDirectory, agentName);
    await fs.mkdir(agentDir, { recursive: true });
    return agentDir;
  }

  async ensureActiveSession(agentDir, metadata) {
    const now = Date.now();
    if (metadata.activeSession) {
      const active = metadata.sessions[metadata.activeSession];
      if (active && new Date(active.createdAt).getTime() >= now - this.sessionTtlMs) {
        return metadata.activeSession;
      }
    }

    const sessionId = `session-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
    metadata.sessions[sessionId] = {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      chunks: []
    };
    metadata.activeSession = sessionId;
    await fs.mkdir(path.join(agentDir, sessionId), { recursive: true });
    await this.saveMetadata(agentDir, metadata);
    return sessionId;
  }

  async ensureWritableChunk(agentDir, sessionId, metadata, agentName) {
    const session = metadata.sessions[sessionId];
    let chunkInfo = session.chunks[session.chunks.length - 1];

    if (!chunkInfo || chunkInfo.count >= this.maxInteractionsPerChunk || session.chunks.length >= this.maxChunksPerSession) {
      const sequence = chunkInfo ? chunkInfo.sequence + 1 : 1;
      if (session.chunks.length >= this.maxChunksPerSession) {
        const oldest = session.chunks.shift();
        await fs.rm(path.join(agentDir, sessionId, oldest.file), { force: true });
        this.removeEntriesFromIndex(metadata, sessionId, oldest.file);
        metadata.summary.totalInteractions = Math.max(0, metadata.summary.totalInteractions - oldest.count);
        if (agentName) {
          metadata.summary.agentInteractions = metadata.summary.agentInteractions || {};
          metadata.summary.agentInteractions[agentName] = Math.max(
            0,
            (metadata.summary.agentInteractions[agentName] || 0) - oldest.count
          );
        }
      }

      chunkInfo = {
        file: `chunk-${String(sequence).padStart(4, '0')}.jsonl`,
        sequence,
        count: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      session.chunks.push(chunkInfo);
      await fs.writeFile(path.join(agentDir, sessionId, chunkInfo.file), '');
    }

    const chunkPath = path.join(agentDir, sessionId, chunkInfo.file);
    return { chunkInfo, chunkPath };
  }

  async loadMetadata(agentDir, options = {}) {
    const metadataPath = path.join(agentDir, 'metadata.json');
    try {
      const raw = await fs.readFile(metadataPath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === 'ENOENT') {
        if (options.createIfMissing === false) {
          return null;
        }
        const metadata = {
          activeSession: null,
          sessions: {},
          index: {},
          summary: {
            totalInteractions: 0,
            agentInteractions: {}
          }
        };
        await this.saveMetadata(agentDir, metadata);
        return metadata;
      }
      throw error;
    }
  }

  async saveMetadata(agentDir, metadata) {
    const metadataPath = path.join(agentDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  async readChunk(chunkPath) {
    try {
      const content = await fs.readFile(chunkPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      return lines.map(line => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async writeChunk(chunkPath, records) {
    const content = records.map(record => JSON.stringify(record)).join('\n');
    await fs.writeFile(chunkPath, content + (content ? '\n' : ''));
  }

  passesFilters(record, filters) {
    if (!filters) {
      return true;
    }
    if (filters.storyId && record.context.storyId !== filters.storyId) {
      return false;
    }
    if (filters.epicId && record.context.epicId !== filters.epicId) {
      return false;
    }
    if (filters.phase && record.phase !== filters.phase) {
      return false;
    }
    return true;
  }

  resolveNewActiveSession(metadata) {
    const entries = Object.entries(metadata.sessions);
    if (entries.length === 0) {
      return null;
    }
    entries.sort(([, a], [, b]) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    return entries[0][0];
  }

  removeEntriesFromIndex(metadata, sessionId, chunkFile) {
    Object.entries(metadata.index).forEach(([interactionId, ref]) => {
      if (ref.sessionId === sessionId && ref.chunkFile === chunkFile) {
        delete metadata.index[interactionId];
      }
    });
  }

  async calculateTotalInteractions(metadata) {
    let total = 0;
    for (const sessionInfo of Object.values(metadata.sessions)) {
      sessionInfo.chunks.forEach(chunk => {
        total += chunk.count;
      });
    }
    return total;
  }

  async rebuildIndex(agentDir, metadata) {
    const index = {};

    for (const [sessionId, sessionInfo] of Object.entries(metadata.sessions)) {
      for (const chunk of sessionInfo.chunks) {
        const chunkPath = path.join(agentDir, sessionId, chunk.file);
        const records = await this.readChunk(chunkPath);
        records.forEach(record => {
          index[record.id] = {
            sessionId,
            chunkFile: chunk.file
          };
        });
      }
    }

    return index;
  }
}

module.exports = WorkingMemoryStore;
