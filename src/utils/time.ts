/**
 * Format timestamp to readable date
 */
export function formatDate(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Get time ago string
 */
export function timeAgo(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if cooldown period has passed
 */
export function isCooldownPassed(lastTime: Date | null, cooldownMinutes: number): boolean {
  if (!lastTime) return true;
  
  const now = new Date();
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const elapsed = now.getTime() - lastTime.getTime();
  
  return elapsed >= cooldownMs;
}

/**
 * Get time until cooldown ends
 */
export function getCooldownRemaining(lastTime: Date, cooldownMinutes: number): number {
  const now = new Date();
  const cooldownMs = cooldownMinutes * 60 * 1000;
  const elapsed = now.getTime() - lastTime.getTime();
  const remaining = cooldownMs - elapsed;
  
  return Math.max(0, remaining);
}

/**
 * Format duration in ms to readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  
  if (seconds < 60) return `${seconds}s`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
