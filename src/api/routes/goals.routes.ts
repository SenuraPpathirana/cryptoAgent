import { Router } from 'express';
import { GoalsController } from '../controllers/goals.controller';

export const goalsRouter = Router();
const controller = new GoalsController();

// Create a new goal
goalsRouter.post('/', controller.createGoal);

// List all goals
goalsRouter.get('/', controller.listGoals);

// Get specific goal
goalsRouter.get('/:id', controller.getGoal);

// Update goal
goalsRouter.put('/:id', controller.updateGoal);

// Delete goal
goalsRouter.delete('/:id', controller.deleteGoal);
