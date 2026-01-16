import { StateMachine } from '../src/agent/state_machine';
import { Goal } from '../src/types/goal.types';
import { GOAL_STATES, WATCH_MODES } from '../src/config/constants';

describe('StateMachine', () => {
  let stateMachine: StateMachine;

  beforeEach(() => {
    stateMachine = StateMachine.getInstance();
  });

  test('should allow valid state transitions', () => {
    expect(stateMachine.canTransition(GOAL_STATES.WATCHING, GOAL_STATES.TRIGGERED)).toBe(true);
    expect(stateMachine.canTransition(GOAL_STATES.TRIGGERED, GOAL_STATES.NOTIFIED)).toBe(true);
    expect(stateMachine.canTransition(GOAL_STATES.NOTIFIED, GOAL_STATES.COMPLETED)).toBe(true);
  });

  test('should prevent invalid state transitions', () => {
    expect(stateMachine.canTransition(GOAL_STATES.COMPLETED, GOAL_STATES.WATCHING)).toBe(false);
    expect(stateMachine.canTransition(GOAL_STATES.IDLE, GOAL_STATES.NOTIFIED)).toBe(false);
  });

  test('should return COMPLETED for ONCE watch mode', () => {
    const goal: Goal = {
      id: '1',
      symbol: 'BTCUSDT',
      condition: 'ABOVE',
      targetPrice: 50000,
      state: GOAL_STATES.NOTIFIED,
      watchMode: WATCH_MODES.ONCE,
      notifyChannel: true,
      autoTrade: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      triggerCount: 1,
    };

    const nextState = stateMachine.getNextStateAfterNotification(goal);
    expect(nextState).toBe(GOAL_STATES.COMPLETED);
  });

  test('should return WATCHING for CONTINUOUS watch mode', () => {
    const goal: Goal = {
      id: '2',
      symbol: 'ETHUSDT',
      condition: 'ABOVE',
      targetPrice: 3000,
      state: GOAL_STATES.NOTIFIED,
      watchMode: WATCH_MODES.CONTINUOUS,
      notifyChannel: true,
      autoTrade: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      triggerCount: 1,
    };

    const nextState = stateMachine.getNextStateAfterNotification(goal);
    expect(nextState).toBe(GOAL_STATES.WATCHING);
  });

  test('should validate goal state consistency', () => {
    const validGoal: Goal = {
      id: '3',
      symbol: 'BNBUSDT',
      condition: 'BELOW',
      targetPrice: 300,
      state: GOAL_STATES.TRIGGERED,
      watchMode: WATCH_MODES.ONCE,
      notifyChannel: true,
      autoTrade: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      triggeredAt: new Date(),
      triggerCount: 1,
    };

    expect(stateMachine.validateGoalState(validGoal)).toBe(true);
  });
});
