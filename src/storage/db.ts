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

        let ssl: { rejectUnauthorized: boolean } | undefined;
        try {
          const url = new URL(dbUrl);
          const sslmode = url.searchParams.get('sslmode');
          const isLocalhost =
            url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
          const forceSsl = (process.env.PG_SSL || '').toLowerCase() === 'true';
          const shouldUseSsl =
            forceSsl || sslmode === 'require' || url.hostname.endsWith('supabase.co') || (!isLocalhost && env.NODE_ENV === 'production');

          if (shouldUseSsl) {
            ssl = { rejectUnauthorized: false };
          }
        } catch {
          // Ignore URL parse issues and fall back to default Pool behavior
        }

        this.pool = new Pool({ connectionString: dbUrl, ssl });
        
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
      // Allow the codebase to keep using SQLite-style queries when running on Postgres
      // (e.g. `?` placeholders and `datetime('now')`).
      const adaptedText = this.adaptSqlForPostgres(text, params);
      return this.pool.query(adaptedText, params);
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
            // Skip "already exists" or duplicate column errors during migration
            const msg = error.message || '';
            if (!msg.includes('already exists') && !msg.includes('duplicate column')) {
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

  private adaptSqlForPostgres(text: string, params?: any[]): string {
    let adapted = text;

    // Replace common SQLite datetime function used in repositories
    adapted = adapted.replace(/datetime\(\s*'now'\s*\)/gi, '(now()::text)');
    adapted = adapted.replace(/datetime\(\s*"now"\s*\)/gi, '(now()::text)');

    if (!params || params.length === 0) {
      return adapted;
    }

    // Replace SQLite-style `?` placeholders with Postgres `$1`, `$2`, ...
    // Avoid touching `?` inside quoted strings/identifiers.
    let result = '';
    let paramIndex = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < adapted.length; i++) {
      const ch = adapted[i];
      const next = adapted[i + 1];

      if (!inDoubleQuote && ch === "'") {
        // Handle escaped single quote '' inside strings
        if (inSingleQuote && next === "'") {
          result += "''";
          i++;
          continue;
        }
        inSingleQuote = !inSingleQuote;
        result += ch;
        continue;
      }

      if (!inSingleQuote && ch === '"') {
        inDoubleQuote = !inDoubleQuote;
        result += ch;
        continue;
      }

      if (!inSingleQuote && !inDoubleQuote && ch === '?') {
        paramIndex++;
        result += `$${paramIndex}`;
        continue;
      }

      result += ch;
    }

    return result;
  }
}

export const db = Database.getInstance();
