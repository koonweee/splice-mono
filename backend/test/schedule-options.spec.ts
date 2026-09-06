import { getScheduleModuleOptions } from '../src/schedule-options';

describe('getScheduleModuleOptions', () => {
  it('keeps all schedules enabled by default', () => {
    expect(getScheduleModuleOptions('false')).toEqual({
      cronJobs: true,
      intervals: true,
      timeouts: true,
    });
  });

  it('disables cron jobs, intervals, and timeouts for one-shot operations', () => {
    expect(getScheduleModuleOptions('true')).toEqual({
      cronJobs: false,
      intervals: false,
      timeouts: false,
    });
  });
});
