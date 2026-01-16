import { createModuleLogger } from '../../config/logger';
import { AgentEvent } from '../../types/events.types';

const logger = createModuleLogger('EventsRepository');

export class EventsRepository {
  private events: AgentEvent[];

  constructor() {
    this.events = [];
  }

  public async create(event: AgentEvent): Promise<AgentEvent> {
    this.events.push(event);
    logger.debug(`Event logged: ${event.type}`);
    return event;
  }

  public async findAll(limit: number = 100): Promise<AgentEvent[]> {
    return this.events.slice(-limit);
  }

  public async findByType(type: string, limit: number = 100): Promise<AgentEvent[]> {
    return this.events.filter(e => e.type === type).slice(-limit);
  }
}
