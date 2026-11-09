import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BankLinkHealthService } from './bank-link-health.service';

@Injectable()
export class BankLinkHealthScheduledService {
  constructor(private readonly health: BankLinkHealthService) {}

  // Per-link database claims prevent duplicate provider calls across replicas.
  @Cron('0 30 4 * * *', {
    name: 'bankLinkHealth',
    timeZone: 'America/Los_Angeles',
  })
  async checkConnections(): Promise<void> {
    await this.health.checkConnections();
  }
}
