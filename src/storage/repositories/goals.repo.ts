import { createModuleLogger } from '../../config/logger';
import { Goal, GoalFilter } from '../../types/goal.types';

const logger = createModuleLogger('GoalsRepository');

export class GoalsRepository {
  private static instance: GoalsRepository;
  private goals: Map<string, Goal>;

  private constructor() {
    this.goals = new Map();
  }

  public static getInstance(): GoalsRepository {
    if (!GoalsRepository.instance) {
      GoalsRepository.instance = new GoalsRepository();
    }
    return GoalsRepository.instance;
  }

  public async create(goal: Goal): Promise<Goal> {
    this.goals.set(goal.id, goal);
    logger.debug(`Goal created in DB: ${goal.id}`);
    return goal;
  }

  public async update(id: string, goal: Goal): Promise<Goal | null> {
    if (!this.goals.has(id)) {
      return null;
    }
    this.goals.set(id, goal);
    logger.debug(`Goal updated in DB: ${id}`);
    return goal;
  }

  public async delete(id: string): Promise<boolean> {
    const deleted = this.goals.delete(id);
    if (deleted) {
      logger.debug(`Goal deleted from DB: ${id}`);
    }
    return deleted;
  }

  public async findById(id: string): Promise<Goal | null> {
    return this.goals.get(id) || null;
  }

  public async findAll(): Promise<Goal[]> {
    return Array.from(this.goals.values());
  }

  public async findByFilter(filter: GoalFilter): Promise<Goal[]> {
    let goals = Array.from(this.goals.values());

    if (filter.userId) {
      goals = goals.filter(g => g.userId === filter.userId);
    }

    if (filter.symbol) {
      goals = goals.filter(g => g.symbol === filter.symbol?.toUpperCase());
    }

    if (filter.state) {
      goals = goals.filter(g => g.state === filter.state);
    }

    return goals;
  }

  public async findByUserId(userId: number): Promise<Goal[]> {
    return Array.from(this.goals.values()).filter(g => g.userId === userId);
  }
}
