import { db } from '../src/storage/db';
import { createModuleLogger } from '../src/config/logger';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const logger = createModuleLogger('Migration');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  try {
    logger.info('Starting database migration...');

    // Connect to database first
    await db.connect();

    // Read SQL file based on DB type
    const dbUrl = process.env.DATABASE_URL || '';
    const schemaFile = dbUrl.startsWith('sqlite:') ? 'users.sql' : 'users.postgres.sql';
    const sqlPath = path.join(__dirname, `../src/storage/schema/${schemaFile}`);
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    if (dbUrl.startsWith('sqlite:')) {
      // Let SQLite handler deal with multi-statement execution and "already exists" errors.
      await db.query(sql);
    } else {
      // Execute SQL (split into statements for Postgres driver compatibility)
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        await db.query(stmt);
      }
    }

    logger.info('✅ Database migration completed successfully!');
    
    // Disconnect
    await db.disconnect();
    
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    
    // Try to disconnect if connected
    try {
      await db.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    
    process.exit(1);
  }
}

migrate();
