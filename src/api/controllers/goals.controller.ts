import { Request, Response } from 'express';
import { createModuleLogger } from '../../config/logger';
import { Goal, CreateGoalDto, UpdateGoalDto } from '../../types/goal.types';
import { GoalManager } from '../../agent/goal_manager';

const logger = createModuleLogger('GoalsController');

export class GoalsController {
  private goalManager: GoalManager;

  constructor() {
    this.goalManager = GoalManager.getInstance();
  }

  createGoal = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).userId;
      const dto: CreateGoalDto = req.body;

      // Validate required fields
      if (!dto.symbol || !dto.condition || dto.targetPrice === undefined) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Missing required fields: symbol, condition, targetPrice',
        });
        return;
      }

      // Add userId to the goal
      const goalData = { ...dto, userId };
      const goal = await this.goalManager.createGoal(goalData);
      logger.info(`Goal created: ${goal.id}`, { symbol: goal.symbol, userId });

      res.status(201).json({
        success: true,
        data: goal,
      });
    } catch (error) {
      logger.error('Failed to create goal', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  listGoals = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).userId;
      const { status, symbol } = req.query;

      const goals = await this.goalManager.listGoals({
        userId,
        status: status as string,
        symbol: symbol as string,
      });

      res.status(200).json({
        success: true,
        data: goals,
        count: goals.length,
      });
    } catch (error) {
      logger.error('Failed to list goals', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  getGoal = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const goal = await this.goalManager.getGoal(id);

      if (!goal) {
        res.status(404).json({
          error: 'Not Found',
          message: `Goal ${id} not found`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: goal,
      });
    } catch (error) {
      logger.error('Failed to get goal', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  updateGoal = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const dto: UpdateGoalDto = req.body;

      const goal = await this.goalManager.updateGoal(id, dto);

      if (!goal) {
        res.status(404).json({
          error: 'Not Found',
          message: `Goal ${id} not found`,
        });
        return;
      }

      logger.info(`Goal updated: ${id}`);
      res.status(200).json({
        success: true,
        data: goal,
      });
    } catch (error) {
      logger.error('Failed to update goal', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  deleteGoal = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const deleted = await this.goalManager.deleteGoal(id);

      if (!deleted) {
        res.status(404).json({
          error: 'Not Found',
          message: `Goal ${id} not found`,
        });
        return;
      }

      logger.info(`Goal deleted: ${id}`);
      res.status(200).json({
        success: true,
        message: `Goal ${id} deleted`,
      });
    } catch (error) {
      logger.error('Failed to delete goal', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
