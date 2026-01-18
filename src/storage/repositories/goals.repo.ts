import { createModuleLogger } from '../../config/logger';
import { Goal, GoalFilter, TradeConfig } from '../../types/goal.types';
import { db } from '../db';

const logger = createModuleLogger('GoalsRepository');

export class GoalsRepository {
  private static instance: GoalsRepository;

  private constructor() {}

  public static getInstance(): GoalsRepository {
    if (!GoalsRepository.instance) {
      GoalsRepository.instance = new GoalsRepository();
    }
    return GoalsRepository.instance;
  }

  private parseJson<T>(value: any): T | undefined {
    if (!value) return undefined;
    if (typeof value === 'object') return value as T;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  private toDate(value: any): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private toDbDate(value?: Date): string | null {
    if (!value) return null;
    return value.toISOString();
  }

  private rowToGoal(row: any): Goal {
    return {
      id: row.id,
      userId: Number(row.user_id),
      symbol: row.symbol,
      condition: row.condition,
      targetPrice: Number(row.target_price),
      currentPrice: row.current_price !== null && row.current_price !== undefined ? Number(row.current_price) : undefined,
      state: row.state,
      watchMode: row.watch_mode,
      notifyChannel: Number(row.notify_channel) === 1,
      autoTrade: Number(row.auto_trade) === 1,
      tradeConfig: this.parseJson<TradeConfig>(row.trade_config),
      createdAt: this.toDate(row.created_at) || new Date(),
      updatedAt: this.toDate(row.updated_at) || new Date(),
      triggeredAt: this.toDate(row.triggered_at),
      notifiedAt: this.toDate(row.notified_at),
      completedAt: this.toDate(row.completed_at),
      triggerCount: Number(row.trigger_count ?? 0),
      maxTriggers: row.max_triggers !== null && row.max_triggers !== undefined ? Number(row.max_triggers) : undefined,
      cooldownMinutes: row.cooldown_minutes !== null && row.cooldown_minutes !== undefined ? Number(row.cooldown_minutes) : undefined,
      lastTriggerAt: this.toDate(row.last_trigger_at),
    };
  }

  public async create(goal: Goal): Promise<Goal> {
    const sql = `INSERT INTO goals (
        id, user_id, symbol, condition, target_price, current_price, state, watch_mode,
        notify_channel, auto_trade, trade_config, created_at, updated_at,
        triggered_at, notified_at, completed_at, trigger_count, max_triggers,
        cooldown_minutes, last_trigger_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      goal.id,
      goal.userId,
      goal.symbol,
      goal.condition,
      goal.targetPrice,
      goal.currentPrice ?? null,
      goal.state,
      goal.watchMode,
      goal.notifyChannel ? 1 : 0,
      goal.autoTrade ? 1 : 0,
      goal.tradeConfig ? JSON.stringify(goal.tradeConfig) : null,
      this.toDbDate(goal.createdAt) ?? this.toDbDate(new Date()),
      this.toDbDate(goal.updatedAt) ?? this.toDbDate(new Date()),
      this.toDbDate(goal.triggeredAt),
      this.toDbDate(goal.notifiedAt),
      this.toDbDate(goal.completedAt),
      goal.triggerCount ?? 0,
      goal.maxTriggers ?? null,
      goal.cooldownMinutes ?? null,
      this.toDbDate(goal.lastTriggerAt),
    ];

    await db.query(sql, values);
    logger.debug(`Goal created in DB: ${goal.id}`);
    return goal;
  }

  public async update(id: string, goal: Goal): Promise<Goal | null> {
    const sql = `UPDATE goals SET
        user_id = ?, symbol = ?, condition = ?, target_price = ?, current_price = ?, state = ?, watch_mode = ?,
        notify_channel = ?, auto_trade = ?, trade_config = ?, created_at = ?, updated_at = ?, triggered_at = ?,
        notified_at = ?, completed_at = ?, trigger_count = ?, max_triggers = ?, cooldown_minutes = ?, last_trigger_at = ?
      WHERE id = ?`;

    const values = [
      goal.userId,
      goal.symbol,
      goal.condition,
      goal.targetPrice,
      goal.currentPrice ?? null,
      goal.state,
      goal.watchMode,
      goal.notifyChannel ? 1 : 0,
      goal.autoTrade ? 1 : 0,
      goal.tradeConfig ? JSON.stringify(goal.tradeConfig) : null,
      this.toDbDate(goal.createdAt) ?? this.toDbDate(new Date()),
      this.toDbDate(goal.updatedAt) ?? this.toDbDate(new Date()),
      this.toDbDate(goal.triggeredAt),
      this.toDbDate(goal.notifiedAt),
      this.toDbDate(goal.completedAt),
      goal.triggerCount ?? 0,
      goal.maxTriggers ?? null,
      goal.cooldownMinutes ?? null,
      this.toDbDate(goal.lastTriggerAt),
      id,
    ];

    const result = await db.query(sql, values);
    const updated = typeof result?.rowCount === 'number' ? result.rowCount > 0 : true;
    if (!updated) return null;
    logger.debug(`Goal updated in DB: ${id}`);
    return goal;
  }

  public async delete(id: string): Promise<boolean> {
    const result = await db.query('DELETE FROM goals WHERE id = ?', [id]);
    const deleted = typeof result?.rowCount === 'number' ? result.rowCount > 0 : true;
    if (deleted) {
      logger.debug(`Goal deleted from DB: ${id}`);
    }
    return deleted;
  }

  public async findById(id: string): Promise<Goal | null> {
    const result = await db.query('SELECT * FROM goals WHERE id = ?', [id]);
    if (!result.rows || result.rows.length === 0) return null;
    return this.rowToGoal(result.rows[0]);
  }

  public async findAll(): Promise<Goal[]> {
    const result = await db.query('SELECT * FROM goals');
    return (result.rows || []).map((row: any) => this.rowToGoal(row));
  }

  public async findByFilter(filter: GoalFilter): Promise<Goal[]> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filter.userId) {
      conditions.push('user_id = ?');
      values.push(filter.userId);
    }

    if (filter.symbol) {
      conditions.push('symbol = ?');
      values.push(filter.symbol.toUpperCase());
    }

    if (filter.state) {
      conditions.push('state = ?');
      values.push(filter.state);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(`SELECT * FROM goals ${where}`, values);
    return (result.rows || []).map((row: any) => this.rowToGoal(row));
  }

  public async findByUserId(userId: number): Promise<Goal[]> {
    const result = await db.query('SELECT * FROM goals WHERE user_id = ?', [userId]);
    return (result.rows || []).map((row: any) => this.rowToGoal(row));
  }
}
