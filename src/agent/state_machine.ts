import { createModuleLogger } from '../config/logger';
import { Goal } from '../types/goal.types';
import { GOAL_STATES, WATCH_MODES } from '../config/constants';

const logger = createModuleLogger('StateMachine');

/**
 * Goal State Machine
 * 
 * State transitions:
 * IDLE → WATCHING → TRIGGERED → NOTIFIED → [COMPLETED | WATCHING]
 *                                          → ERROR
 * 
 * WATCHING: Actively monitoring price conditions
 * TRIGGERED: Condition met, awaiting notification
 * NOTIFIED: Notification sent, awaiting trade execution or completion
 * COMPLETED: Goal lifecycle finished
 * CANCELLED: Manually cancelled
 * ERROR: Error occurred during processing
 */

export class StateMachine {
  private static instance: StateMachine;

  private constructor() {}

  public static getInstance(): StateMachine {
    if (!StateMachine.instance) {
      StateMachine.instance = new StateMachine();
    }
    return StateMachine.instance;
  }

  /**
   * Check if a state transition is valid
   */
  public canTransition(currentState: string, newState: string): boolean {
    const transitions: Record<string, string[]> = {
      [GOAL_STATES.IDLE]: [GOAL_STATES.WATCHING, GOAL_STATES.CANCELLED],
      
      [GOAL_STATES.WATCHING]: [
        GOAL_STATES.TRIGGERED,
        GOAL_STATES.CANCELLED,
        GOAL_STATES.ERROR,
      ],
      
      [GOAL_STATES.TRIGGERED]: [
        GOAL_STATES.NOTIFIED,
        GOAL_STATES.WATCHING, // Reset for recurring
        GOAL_STATES.CANCELLED,
        GOAL_STATES.ERROR,
      ],
      
      [GOAL_STATES.NOTIFIED]: [
        GOAL_STATES.COMPLETED,
        GOAL_STATES.WATCHING, // Reset for continuous
        GOAL_STATES.CANCELLED,
        GOAL_STATES.ERROR,
      ],
      
      [GOAL_STATES.COMPLETED]: [],
      [GOAL_STATES.CANCELLED]: [],
      [GOAL_STATES.ERROR]: [GOAL_STATES.WATCHING, GOAL_STATES.CANCELLED],
    };

    const allowedTransitions = transitions[currentState] || [];
    return allowedTransitions.includes(newState);
  }

  /**
   * Get next state after notification based on watch mode
   */
  public getNextStateAfterNotification(goal: Goal): string {
    switch (goal.watchMode) {
      case WATCH_MODES.ONCE:
        return GOAL_STATES.COMPLETED;

      case WATCH_MODES.CONTINUOUS:
        return GOAL_STATES.WATCHING;

      case WATCH_MODES.RECURRING:
        // Check if max triggers reached
        if (goal.maxTriggers && goal.triggerCount >= goal.maxTriggers) {
          return GOAL_STATES.COMPLETED;
        }
        return GOAL_STATES.WATCHING;

      default:
        logger.warn(`Unknown watch mode: ${goal.watchMode}`);
        return GOAL_STATES.COMPLETED;
    }
  }

  /**
   * Validate goal state consistency
   */
  public validateGoalState(goal: Goal): boolean {
    const validStates = Object.values(GOAL_STATES);
    if (!validStates.includes(goal.state)) {
      logger.error(`Invalid goal state: ${goal.state}`, { goalId: goal.id });
      return false;
    }

    // Additional state-specific validations
    if (goal.state === GOAL_STATES.TRIGGERED && !goal.triggeredAt) {
      logger.warn(`Goal ${goal.id} is TRIGGERED but missing triggeredAt`);
      return false;
    }

    if (goal.state === GOAL_STATES.NOTIFIED && !goal.notifiedAt) {
      logger.warn(`Goal ${goal.id} is NOTIFIED but missing notifiedAt`);
      return false;
    }

    if (goal.state === GOAL_STATES.COMPLETED && !goal.completedAt) {
      logger.warn(`Goal ${goal.id} is COMPLETED but missing completedAt`);
      return false;
    }

    return true;
  }

  /**
   * Get human-readable state description
   */
  public getStateDescription(state: string): string {
    const descriptions: Record<string, string> = {
      [GOAL_STATES.IDLE]: 'Idle - not yet active',
      [GOAL_STATES.WATCHING]: 'Watching - monitoring price conditions',
      [GOAL_STATES.TRIGGERED]: 'Triggered - condition met',
      [GOAL_STATES.NOTIFIED]: 'Notified - alert sent',
      [GOAL_STATES.COMPLETED]: 'Completed - goal finished',
      [GOAL_STATES.CANCELLED]: 'Cancelled - manually stopped',
      [GOAL_STATES.ERROR]: 'Error - processing failed',
    };

    return descriptions[state] || 'Unknown state';
  }

  /**
   * Determine if goal should be evaluated
   */
  public shouldEvaluate(goal: Goal): boolean {
    return goal.state === GOAL_STATES.WATCHING;
  }

  /**
   * Determine if goal needs notification
   */
  public needsNotification(goal: Goal): boolean {
    return goal.state === GOAL_STATES.TRIGGERED && goal.notifyChannel;
  }

  /**
   * Determine if goal should execute trade
   */
  public shouldExecuteTrade(goal: Goal): boolean {
    return (
      goal.state === GOAL_STATES.NOTIFIED &&
      goal.autoTrade &&
      goal.tradeConfig !== undefined
    );
  }
}
