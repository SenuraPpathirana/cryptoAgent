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

    // Read SQL file
    const sqlPath = path.join(__dirname, '../src/storage/schema/users.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Execute SQL
    await db.query(sql);

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
