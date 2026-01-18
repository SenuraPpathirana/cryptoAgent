import { db } from '../db';
import bcrypt from 'bcrypt';
import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('UsersRepo');

export interface User {
  id: number;
  email: string;
  username?: string;
  created_at: Date;
  last_login?: Date;
}

export interface UserConfig {
  user_id: number;
  telegram_bot_token?: string;
  telegram_channel_id?: string;
  binance_api_key?: string;
  binance_api_secret?: string;
  binance_testnet: boolean;
  trading_mode: 'paper' | 'testnet' | 'live';
  default_leverage: number;
  max_position_size_usdt: number;
}

export interface UserBehavior {
  user_id: number;
  keyword?: string;
  category?: string;
  occurrence_count?: number;
  action?: string;
  action_count?: number;
  last_occurred?: Date;
}

export class UsersRepository {
  private static instance: UsersRepository;

  private constructor() {}

  public static getInstance(): UsersRepository {
    if (!UsersRepository.instance) {
      UsersRepository.instance = new UsersRepository();
    }
    return UsersRepository.instance;
  }

  /**
   * Create a new user
   */
  async createUser(email: string, password: string, username?: string): Promise<User | null> {
    try {
      // Check if user already exists
      const existing = await db.query(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );
      
      if (existing.rows && existing.rows.length > 0) {
        logger.warn('User already exists', { email });
        throw new Error('EMAIL_EXISTS');
      }
      
      const passwordHash = await bcrypt.hash(password, 10);
      
      // Insert user
      await db.query(
        'INSERT INTO users (email, password_hash, username, created_at) VALUES (?, ?, ?, datetime(\'now\'))',
        [email, passwordHash, username || null]
      );
      
      // Get the inserted user
      const user = await db.query(
        'SELECT id, email, username, created_at FROM users WHERE email = ?',
        [email]
      );

      if (!user.rows || user.rows.length === 0) {
        throw new Error('Failed to retrieve created user');
      }

      logger.info('User created', { userId: user.rows[0].id, email });
      
      // Create default config for user
      await db.query(
        'INSERT INTO user_configs (user_id, binance_testnet, trading_mode, default_leverage, max_position_size_usdt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
        [user.rows[0].id, 1, 'testnet', 10, 1000]
      );

      return user.rows[0];
    } catch (error: any) {
      if (error.message === 'EMAIL_EXISTS') {
        throw error;
      }
      logger.error('Failed to create user', { error: error.message, email });
      return null;
    }
  }

  /**
   * Authenticate user
   */
  async authenticateUser(email: string, password: string): Promise<User | null> {
    try {
      const result = await db.query(
        'SELECT id, email, username, password_hash, created_at FROM users WHERE email = ?',
        [email]
      );

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        return null;
      }

      // Update last login
      await db.query('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?', [user.id]);

      logger.info('User authenticated', { userId: user.id, email });

      return {
        id: user.id,
        email: user.email,
        username: user.username,
        created_at: user.created_at,
      };
    } catch (error) {
      logger.error('Failed to authenticate user', { error, email });
      return null;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: number): Promise<User | null> {
    try {
      const result = await db.query(
        'SELECT id, email, username, created_at, last_login FROM users WHERE id = ?',
        [userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user', { error, userId });
      return null;
    }
  }

  /**
   * Get user configuration
   */
  async getUserConfig(userId: number): Promise<UserConfig | null> {
    try {
      const result = await db.query(
        'SELECT * FROM user_configs WHERE user_id = ?',
        [userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user config', { error, userId });
      return null;
    }
  }

  /**
   * Update user configuration
   */
  async updateUserConfig(userId: number, config: Partial<UserConfig>): Promise<boolean> {
    try {
      const fields: string[] = [];
      const values: any[] = [];

      Object.entries(config).forEach(([key, value]) => {
        if (key !== 'user_id' && value !== undefined) {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      });

      if (fields.length === 0) {
        logger.warn('No fields to update in user config', { userId });
        return false;
      }

      fields.push(`updated_at = datetime('now')`);
      values.push(userId);

      const query = `UPDATE user_configs SET ${fields.join(', ')} WHERE user_id = ?`;
      
      logger.info('Executing config update', { userId, query, values: values.map((v, i) => i === values.length - 1 ? v : '***') });
      
      const result = await db.query(query, values);
      
      logger.info('User config updated', { userId, fields: Object.keys(config), rowsAffected: result });
      return true;
    } catch (error) {
      logger.error('Failed to update user config', { error, userId, errorMessage: (error as Error).message });
      return false;
    }
  }

  /**
   * Track user behavior (keyword frequency)
   */
  async trackBehavior(userId: number, keyword: string, category: string): Promise<void> {
    try {
      // Check if exists
      const existing = await db.query(
        'SELECT occurrence_count FROM user_behavior WHERE user_id = ? AND keyword = ? AND category = ?',
        [userId, keyword, category]
      );

      if (existing.rows && existing.rows.length > 0) {
        // Update
        await db.query(
          'UPDATE user_behavior SET occurrence_count = occurrence_count + 1, last_occurred = datetime(\'now\') WHERE user_id = ? AND keyword = ? AND category = ?',
          [userId, keyword, category]
        );
      } else {
        // Insert
        await db.query(
          'INSERT INTO user_behavior (user_id, keyword, category, occurrence_count, last_occurred) VALUES (?, ?, ?, 1, datetime(\'now\'))',
          [userId, keyword, category]
        );
      }
    } catch (error) {
      logger.error('Failed to track behavior', { error, userId, keyword });
    }
  }

  /**
   * Track user intent actions (LIST_GOALS, CHECK_PRICE, CREATE_GOAL, etc.)
   */
  async trackAction(userId: number, action: string): Promise<void> {
    try {
      const existing = await db.query(
        'SELECT action_count FROM user_behavior WHERE user_id = ? AND action = ?',
        [userId, action]
      );

      if (existing.rows && existing.rows.length > 0) {
        await db.query(
          `UPDATE user_behavior
           SET action_count = action_count + 1,
               occurrence_count = occurrence_count + 1,
               last_occurred = datetime('now'),
               keyword = ?,
               category = 'action'
           WHERE user_id = ? AND action = ?`,
          [action, userId, action]
        );
      } else {
        await db.query(
          `INSERT INTO user_behavior (user_id, keyword, category, occurrence_count, action, action_count, last_occurred)
           VALUES (?, ?, 'action', 1, ?, 1, datetime('now'))`,
          [userId, action, action]
        );
      }
    } catch (error) {
      logger.error('Failed to track action', { error, userId, action });
    }
  }

  /**
   * Get user behavior patterns
   */
  async getUserBehavior(userId: number, limit: number = 50): Promise<UserBehavior[]> {
    try {
      const result = await db.query(
        `SELECT user_id, keyword, category, occurrence_count, action, action_count, last_occurred
         FROM user_behavior
         WHERE user_id = ?
         ORDER BY occurrence_count DESC, action_count DESC, last_occurred DESC
         LIMIT ?`,
        [userId, limit]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get user behavior', { error, userId });
      return [];
    }
  }

  /**
   * Save chat message
   */
  async saveChatMessage(
    userId: number,
    role: 'user' | 'assistant',
    message: string,
    intent?: any,
    metadata?: any
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO chat_messages (user_id, role, message, intent, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [userId, role, message, intent ? JSON.stringify(intent) : null, metadata ? JSON.stringify(metadata) : null]
      );
    } catch (error) {
      logger.error('Failed to save chat message', { error, userId });
    }
  }

  /**
   * Get chat history
   */
  async getChatHistory(userId: number, limit: number = 100): Promise<any[]> {
    try {
      const result = await db.query(
        `SELECT role, message, intent, metadata, created_at
         FROM chat_messages
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [userId, limit]
      );

      return result.rows.reverse(); // Oldest first
    } catch (error) {
      logger.error('Failed to get chat history', { error, userId });
      return [];
    }
  }

  /**
   * Analyze user behavior and get suggestions
   */
  async getSmartSuggestions(userId: number): Promise<string[]> {
    try {
      const behavior = await this.getUserBehavior(userId, 20);
      const suggestions: string[] = [];

      // Analyze patterns
      const features = behavior.reduce((acc, b) => {
        if (b.category && b.keyword) {
          acc[b.category] = acc[b.category] || [];
          acc[b.category].push(b.keyword);
        }
        return acc;
      }, {} as Record<string, string[]>);

      const actionCounts = behavior.reduce((acc, b) => {
        if (b.action) {
          acc[b.action] = (acc[b.action] || 0) + (b.action_count || 0);
        }
        return acc;
      }, {} as Record<string, number>);

      const keywordCounts = behavior.reduce((acc, b) => {
        if (b.category === 'keyword' && b.keyword) {
          acc[b.keyword] = (acc[b.keyword] || 0) + (b.occurrence_count || 0);
        }
        return acc;
      }, {} as Record<string, number>);

      // Suggest based on patterns
      if (features['feature']?.includes('telegram') && features['feature']?.includes('reminder')) {
        suggestions.push('Would you like me to send this as a Telegram reminder too?');
      }

      if (features['action']?.includes('resistance') || features['action']?.includes('support')) {
        suggestions.push('Set a goal based on this level?');
      }

      if (features['feature']?.includes('position') && !features['feature']?.includes('telegram')) {
        suggestions.push('Enable Telegram notifications for position updates?');
      }

      if ((actionCounts['CHECK_PRICE'] || 0) >= 3) {
        suggestions.push('You check prices often. Want me to create a price alert goal for you?');
      }

      if ((actionCounts['LIST_GOALS'] || 0) >= 3) {
        suggestions.push('Need help cleaning up or editing your goals?');
      }

      if ((actionCounts['CREATE_GOAL'] || 0) >= 3) {
        suggestions.push('Want Telegram notifications for all new goals?');
      }

      if ((keywordCounts['price'] || 0) >= 3) {
        suggestions.push('Want me to check the current price now?');
      }

      if ((keywordCounts['goals'] || 0) >= 3 || (keywordCounts['goal'] || 0) >= 3) {
        suggestions.push('Do you want to view your active goals?');
      }

      if ((keywordCounts['support'] || 0) >= 2 || (keywordCounts['resistance'] || 0) >= 2) {
        suggestions.push('Want me to analyze support and resistance levels?');
      }

      if ((keywordCounts['rsi'] || 0) >= 2) {
        suggestions.push('Want an RSI check on your symbol?');
      }

      if ((keywordCounts['macd'] || 0) >= 2) {
        suggestions.push('Want a MACD momentum check?');
      }

      if ((keywordCounts['divergence'] || 0) >= 2) {
        suggestions.push('Should I look for divergence signals?');
      }

      // Deduplicate while preserving order
      return Array.from(new Set(suggestions));
    } catch (error) {
      logger.error('Failed to get smart suggestions', { error, userId });
      return [];
    }
  }
}
