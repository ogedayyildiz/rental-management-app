import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import { LIVE_EVENTS, liveChannel } from '@rental/shared';
import { Redis } from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { config } from '../config.js';
import { resolveDevOrganization } from '../tenant/tenant.js';

const room = (organizationId: string) => `org:${organizationId}`;

/**
 * Pushes live machine state to clients. Ingestion publishes to Redis per
 * organization; every API instance relays to its connected sockets, so the
 * API can scale horizontally.
 */
@WebSocketGateway({ namespace: '/live', cors: { origin: config.corsOrigins } })
export class LiveGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(LiveGateway.name);
  private readonly subscriber = new Redis(config.redisUrl);

  async onModuleInit(): Promise<void> {
    await this.subscriber.psubscribe(liveChannel('*'));
    this.subscriber.on('pmessage', (_pattern, channel: string, message: string) => {
      const organizationId = channel.slice(liveChannel('').length);
      this.server.to(room(organizationId)).emit(LIVE_EVENTS.machineState, JSON.parse(message));
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.quit();
  }

  handleConnection(client: Socket): void {
    // TODO(auth): derive the organization from the authenticated session.
    const organizationId = resolveDevOrganization(client.handshake.auth?.organizationId);
    if (!organizationId) {
      client.disconnect(true);
      return;
    }
    void client.join(room(organizationId));
    this.logger.debug(`client ${client.id} joined ${room(organizationId)}`);
  }
}
