import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ManualBrokerageService } from './manual-brokerage.service';

@Injectable()
export class ManualBrokerageScheduledService {
  private readonly logger = new Logger(ManualBrokerageScheduledService.name);

  constructor(
    private readonly manualBrokerageService: ManualBrokerageService,
  ) {}

  @Cron('0 30 23 * * 1-5', {
    name: 'refreshManualBrokeragePrices',
    timeZone: 'UTC',
  })
  async handleRefresh(): Promise<void> {
    const result =
      await this.manualBrokerageService.refreshAllManualBrokerages();
    this.logger.log(result, 'Scheduled manual brokerage refresh completed');
  }
}
