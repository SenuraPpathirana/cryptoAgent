import WebSocket from 'ws';
import { createModuleLogger } from '../config/logger';
import { env } from '../config/env';
import { WS_PING_INTERVAL_MS, WS_PONG_TIMEOUT_MS, WS_RECONNECT_DELAY_MS } from '../config/constants';
import { CombinedStreamMessage } from '../types/market.types';
import { StreamRouter } from './stream_router';

const logger = createModuleLogger('BinanceWS');

export class BinanceWebSocket {
  private static instance: BinanceWebSocket;
  private ws: WebSocket | null = null;
  private streamRouter: StreamRouter;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private pingInterval?: NodeJS.Timeout;
  private pongTimeout?: NodeJS.Timeout;
  private subscribedStreams: Set<string>;
  private isConnecting = false;

  private constructor() {
    this.streamRouter = StreamRouter.getInstance();
    this.subscribedStreams = new Set();
  }

  public static getInstance(): BinanceWebSocket {
    if (!BinanceWebSocket.instance) {
      BinanceWebSocket.instance = new BinanceWebSocket();
    }
    return BinanceWebSocket.instance;
  }

  public connect(streams: string[]): void {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      logger.warn('WebSocket already connected or connecting');
      return;
    }

    this.isConnecting = true;
    streams.forEach(stream => this.subscribedStreams.add(stream));

    const streamNames = Array.from(this.subscribedStreams).join('/');
    const url = `${env.BINANCE_WS_URL}/${streamNames}`;

    logger.info(`Connecting to Binance WebSocket: ${url}`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      logger.info('WebSocket connected');
      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this.startPingPong();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        logger.error('Failed to parse WebSocket message', error);
      }
    });

    this.ws.on('error', (error) => {
      logger.error('WebSocket error', error);
    });

    this.ws.on('close', () => {
      logger.warn('WebSocket closed');
      this.isConnecting = false;
      this.stopPingPong();
      this.scheduleReconnect();
    });

    this.ws.on('pong', () => {
      logger.debug('Received pong');
      if (this.pongTimeout) {
        clearTimeout(this.pongTimeout);
      }
    });
  }

  private handleMessage(message: CombinedStreamMessage | any): void {
    if (message.stream && message.data) {
      // Combined stream format
      this.streamRouter.route(message);
    } else {
      // Single stream format
      this.streamRouter.route({ stream: 'single', data: message });
    }
  }

  private startPingPong(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        logger.debug('Sending ping');
        this.ws.ping();

        // Set pong timeout
        this.pongTimeout = setTimeout(() => {
          logger.warn('Pong timeout - closing connection');
          this.ws?.close();
        }, WS_PONG_TIMEOUT_MS);
      }
    }, WS_PING_INTERVAL_MS);
  }

  private stopPingPong(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = undefined;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = WS_RECONNECT_DELAY_MS * this.reconnectAttempts;

    logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect(Array.from(this.subscribedStreams));
    }, delay);
  }

  public subscribe(streams: string[]): void {
    streams.forEach(stream => this.subscribedStreams.add(stream));

    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = {
        method: 'SUBSCRIBE',
        params: streams,
        id: Date.now(),
      };
      this.ws.send(JSON.stringify(message));
      logger.info(`Subscribed to streams: ${streams.join(', ')}`);
    }
  }

  public unsubscribe(streams: string[]): void {
    streams.forEach(stream => this.subscribedStreams.delete(stream));

    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = {
        method: 'UNSUBSCRIBE',
        params: streams,
        id: Date.now(),
      };
      this.ws.send(JSON.stringify(message));
      logger.info(`Unsubscribed from streams: ${streams.join(', ')}`);
    }
  }

  public disconnect(): void {
    logger.info('Disconnecting WebSocket');
    this.stopPingPong();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
