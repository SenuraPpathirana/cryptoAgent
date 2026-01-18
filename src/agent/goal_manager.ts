import { v4 as uuidv4 } from 'uuid';
import { createModuleLogger } from '../config/logger';
import { Goal, CreateGoalDto, UpdateGoalDto, GoalFilter } from '../types/goal.types';
import { GOAL_STATES } from '../config/constants';
import { GoalsRepository } from '../storage/repositories/goals.repo';

const logger = createModuleLogger('GoalManager');

export class GoalManager {
  private static instance: GoalManager;
  private goalsRepo: GoalsRepository;

  private constructor() {
    this.goalsRepo = GoalsRepository.getInstance();
  }

  public static getInstance(): GoalManager {
    if (!GoalManager.instance) {
      GoalManager.instance = new GoalManager();
    }
    return GoalManager.instance;
  }

  private async logActiveGoals(): Promise<void> {
    try {
      const goals = await this.goalsRepo.findAll();
      const activeGoals = goals.filter(
        goal => goal.state === GOAL_STATES.WATCHING || goal.state === GOAL_STATES.TRIGGERED
      );
      logger.info(`Loaded ${activeGoals.length} active goals`);
    } catch (error) {
      logger.error('Failed to load goals', error);
    }
  }

  public async init(): Promise<void> {
    await this.logActiveGoals();
  }

  public async createGoal(dto: CreateGoalDto): Promise<Goal> {
    const goal: Goal = {
      id: uuidv4(),
      userId: (dto as any).userId || 0,
      symbol: dto.symbol.toUpperCase(),
      condition: dto.condition,
      targetPrice: dto.targetPrice,
      state: GOAL_STATES.WATCHING,
      watchMode: dto.watchMode || 'ONCE',
      notifyChannel: dto.notifyChannel ?? true,
      autoTrade: dto.autoTrade ?? false,
      tradeConfig: dto.tradeConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
      triggerCount: 0,
      maxTriggers: dto.maxTriggers,
      cooldownMinutes: dto.cooldownMinutes,
    };

    await this.goalsRepo.create(goal);

    logger.info(`Goal created: ${goal.id}`, {
      symbol: goal.symbol,
      condition: goal.condition,
      targetPrice: goal.targetPrice,
    });

    return goal;
  }

  public async updateGoal(id: string, dto: UpdateGoalDto): Promise<Goal | null> {
    const goal = await this.goalsRepo.findById(id);
    if (!goal) {
      return null;
    }

    const updatedGoal: Goal = {
      ...goal,
      ...dto,
      updatedAt: new Date(),
    };

    await this.goalsRepo.update(id, updatedGoal);

    logger.info(`Goal updated: ${id}`, dto);
    return updatedGoal;
  }

  public async deleteGoal(id: string): Promise<boolean> {
    const goal = await this.goalsRepo.findById(id);
    if (!goal) {
      return false;
    }

    await this.goalsRepo.delete(id);

    logger.info(`Goal deleted: ${id}`);
    return true;
  }

  public async getGoal(id: string): Promise<Goal | null> {
    return await this.goalsRepo.findById(id);
  }

  public async listGoals(filter?: GoalFilter): Promise<Goal[]> {
    if (filter?.symbol || filter?.state) {
      return await this.goalsRepo.findByFilter(filter);
    }
    return await this.goalsRepo.findAll();
  }

  public async getActiveGoals(): Promise<Goal[]> {
    const allGoals = await this.goalsRepo.findAll();
    return allGoals.filter(goal => 
      goal.state === GOAL_STATES.WATCHING || goal.state === GOAL_STATES.TRIGGERED
    );
  }

  public async transitionGoalState(
    goalId: string,
    newState: string,
    additionalData?: Partial<Goal>
  ): Promise<Goal | null> {
    const goal = await this.goalsRepo.findById(goalId);
    if (!goal) {
      logger.warn(`Cannot transition state for unknown goal: ${goalId}`);
      return null;
    }

    const updatedGoal: Goal = {
      ...goal,
      state: newState as any,
      updatedAt: new Date(),
      ...additionalData,
    };

    await this.goalsRepo.update(goalId, updatedGoal);

    logger.info(`Goal ${goalId} transitioned: ${goal.state} → ${newState}`);
    return updatedGoal;
  }

  public async markGoalTriggered(goalId: string, currentPrice: number): Promise<Goal | null> {
    const goal = await this.goalsRepo.findById(goalId);
    if (!goal) return null;

    return await this.transitionGoalState(goalId, GOAL_STATES.TRIGGERED, {
      currentPrice,
      triggeredAt: new Date(),
      triggerCount: goal.triggerCount + 1,
    });
  }

  public async markGoalNotified(goalId: string): Promise<Goal | null> {
    return await this.transitionGoalState(goalId, GOAL_STATES.NOTIFIED, {
      notifiedAt: new Date(),
    });
  }

  public async markGoalCompleted(goalId: string): Promise<Goal | null> {
    return await this.transitionGoalState(goalId, GOAL_STATES.COMPLETED, {
      completedAt: new Date(),
    });
  }
}
