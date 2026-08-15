import { ScheduleModule } from '@nestjs/schedule';

export function getScheduleModuleOptions(
  disableSchedules = process.env.DISABLE_SCHEDULES,
): Parameters<typeof ScheduleModule.forRoot>[0] {
  const enabled = disableSchedules !== 'true';
  return {
    cronJobs: enabled,
    intervals: enabled,
    timeouts: enabled,
  };
}
