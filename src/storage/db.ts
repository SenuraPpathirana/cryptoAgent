import pkg from 'pg';
const { Pool } = pkg;
import Database3 from 'better-sqlite3';
import { createModuleLogger } from '../config/logger';
import { env } from '../config/env';
import path from 'path';
import fs from 'fs';

const logger = createModuleLogger('Database');

class Database {
  private static instance: Database;
  private pool: pkg.Pool | null = null;
  private sqlite: Database3.Database | null = null;
  private connected = false;
  private dbType: 'postgres' | 'sqlite' = 'sqlite';

  private constructor() {}

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async connect(): Promise<void> {
    try {
      const dbUrl = env.DATABASE_URL;
      
      if (dbUrl.startsWith('sqlite:')) {
        // SQLite connection
        this.dbType = 'sqlite';
        const dbPath = dbUrl.replace('sqlite:', '');
        const dbDir = path.dirname(dbPath);
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }
        
        logger.info(`Connecting to SQLite database: ${dbPath}`);
        this.sqlite = new Database3(dbPath);
        this.connected = true;
        logger.info('SQLite database connected successfully');
        
      } else {
        // PostgreSQL connection
        this.dbType = 'postgres';
        logger.info(`Connecting to PostgreSQL database: ${dbUrl.replace(/:[^:@]*@/, ':***@')}`);
        
        this.pool = new Pool({
          connectionString: dbUrl,
        });
        
        // Test connection
        await this.pool.query('SELECT NOW()');
        this.connected = true;
        
        logger.info('PostgreSQL database connected successfully');
      }
    } catch (error) {
      logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.connected) {
      logger.info('Disconnecting from database');
      
      if (this.dbType === 'postgres' && this.pool) {
        await this.pool.end();
        this.pool = null;
      } else if (this.dbType === 'sqlite' && this.sqlite) {
        this.sqlite.close();
        this.sqlite = null;
      }
      
      this.connected = false;
      logger.info('Database disconnected');
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async query(text: string, params?: any[]): Promise<any> {
    if (!this.connected) {
      throw new Error('Database not connected. Call connect() first.');
    }

    if (this.dbType === 'postgres' && this.pool) {
      return this.pool.query(text, params);
    } else if (this.dbType === 'sqlite' && this.sqlite) {
      // For multi-statement SQL (like migrations), execute them separately
      if (text.includes(';') && !params) {
        const statements = text
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        for (const stmt of statements) {
          try {
            this.sqlite.prepare(stmt).run();
          } catch (error: any) {
            // Skip "already exists" errors during migration
            if (!error.message?.includes('already exists')) {
              throw error;
            }
          }
        }
        return { rows: [], rowCount: 0 };
      }
      
      // Convert PostgreSQL-style $1, $2 to SQLite-style ? placeholders
      let sqliteQuery = text;
      if (params && params.length > 0) {
        // Replace $1, $2, etc. with ?
        sqliteQuery = text.replace(/\$\d+/g, '?');
      }
      
      // Check if it's a SELECT query
      const isSelect = sqliteQuery.trim().toUpperCase().startsWith('SELECT');
      
      try {
        if (isSelect) {
          const stmt = this.sqlite.prepare(sqliteQuery);
          const rows = params ? stmt.all(...params) : stmt.all();
          return { rows, rowCount: rows.length };
        } else {
          const stmt = this.sqlite.prepare(sqliteQuery);
          const info = params ? stmt.run(...params) : stmt.run();
          return { rows: [], rowCount: info.changes };
        }
      } catch (error: any) {
        throw error;
      }
    }

    throw new Error('No database connection available');
  }
}

export const db = Database.getInstance();
