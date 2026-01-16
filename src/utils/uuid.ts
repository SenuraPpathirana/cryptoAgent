import { v4 as uuidv4, validate as validateUUID } from 'uuid';

/**
 * Generate a new UUID
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Validate UUID format
 */
export function isValidUUID(id: string): boolean {
  return validateUUID(id);
}

/**
 * Generate short ID (first 8 characters of UUID)
 */
export function generateShortId(): string {
  return uuidv4().substring(0, 8);
}

/**
 * Extract short ID from UUID
 */
export function getShortId(uuid: string): string {
  return uuid.substring(0, 8);
}
