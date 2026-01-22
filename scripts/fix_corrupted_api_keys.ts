import { db } from '../src/storage/db';
import { createModuleLogger } from '../src/config/logger';

const logger = createModuleLogger('FixAPIKeys');

async function fixCorruptedAPIKeys() {
  try {
    // Connect to database first
    await db.connect();
    
    logger.info('Checking for corrupted API keys...');

    // Find users with corrupted API keys
    const result = await db.query(`
      SELECT user_id, binance_api_key, binance_api_secret 
      FROM user_configs 
      WHERE binance_api_key LIKE '%parameter is either empty or invalid%'
         OR binance_api_secret LIKE '%parameter is either empty or invalid%'
         OR binance_api_key LIKE '%error%'
         OR binance_api_secret LIKE '%error%'
    `);

    if (result.rows.length === 0) {
      logger.info('No corrupted API keys found.');
      return;
    }

    logger.warn(`Found ${result.rows.length} users with corrupted API keys`);

    for (const row of result.rows) {
      const userId = row.user_id;
      const apiKey = row.binance_api_key || '';
      const apiSecret = row.binance_api_secret || '';

      logger.info(`User ${userId}:`, {
        apiKeyLength: apiKey.length,
        apiKeyPreview: apiKey.substring(0, 30),
        secretLength: apiSecret.length
      });

      // Clear the corrupted keys
      await db.query(
        `UPDATE user_configs 
         SET binance_api_key = NULL, 
             binance_api_secret = NULL,
             updated_at = datetime('now')
         WHERE user_id = ?`,
        [userId]
      );

      logger.info(`Cleared corrupted API keys for user ${userId}`);
    }

    logger.info('✅ Corrupted API keys have been cleared. Users will need to re-enter their API keys in settings.');
  } catch (error) {
    logger.error('Failed to fix corrupted API keys', { error });
    throw error;
  }
}

fixCorruptedAPIKeys()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
