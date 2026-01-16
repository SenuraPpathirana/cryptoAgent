import fs from 'fs/promises';
import path from 'path';
import { Goal } from '../types/goal.types.js';
import { logger } from '../config/logger.js';

export class GoalPersistence {
  private filePath: string;
  private saveTimer?: NodeJS.Timeout;

  constructor(filePath = './data/goals.json') {
    this.filePath = filePath;
  }

  async init() {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      logger.info('Persistence initialized', { path: this.filePath });
    } catch (e) {
      logger.error('Failed to init persistence', { e });
    }
  }

  async load(): Promise<Goal[]> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const goals = JSON.parse(data) as Goal[];
      logger.info('Goals loaded from disk', { count: goals.length });
      return goals;
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        logger.info('No saved goals found (first run)');
        return [];
      }
      logger.error('Failed to load goals', { e });
      return [];
    }
  }

  async save(goals: Goal[]): Promise<void> {
    // Debounce saves to avoid thrashing disk
    if (this.saveTimer) clearTimeout(this.saveTimer);
    
    this.saveTimer = setTimeout(async () => {
      try {
        const data = JSON.stringify(goals, null, 2);
        await fs.writeFile(this.filePath, data, 'utf-8');
        logger.info('Goals saved to disk', { count: goals.length });
      } catch (e) {
        logger.error('Failed to save goals', { e });
      }
    }, 1000);
  }
}
