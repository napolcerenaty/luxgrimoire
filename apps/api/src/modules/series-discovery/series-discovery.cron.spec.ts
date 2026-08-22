import { ConfigService } from '@nestjs/config';
import { SeriesDiscoveryCron } from './series-discovery.cron';
import { SeriesDiscoveryService } from './series-discovery.service';

describe('SeriesDiscoveryCron', () => {
  let cron: SeriesDiscoveryCron;
  let service: { runCheck: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    service = { runCheck: jest.fn().mockResolvedValue({ seriesChecked: 0, suggestionsCreated: 0 }) };
    config = { get: jest.fn().mockReturnValue(undefined) };
    cron = new SeriesDiscoveryCron(service as unknown as SeriesDiscoveryService, config as unknown as ConfigService);
  });

  it('uses the default batch size of 20 when SERIES_DISCOVERY_DAILY_BATCH is unset', async () => {
    await cron.run();

    expect(service.runCheck).toHaveBeenCalledWith({ limit: 20 });
  });

  it('uses the configured batch size when it is a valid positive number', async () => {
    config.get.mockReturnValue('50');

    await cron.run();

    expect(service.runCheck).toHaveBeenCalledWith({ limit: 50 });
  });

  it('falls back to the default when the configured value is zero', async () => {
    config.get.mockReturnValue('0');

    await cron.run();

    expect(service.runCheck).toHaveBeenCalledWith({ limit: 20 });
  });

  it('falls back to the default when the configured value is negative', async () => {
    config.get.mockReturnValue('-5');

    await cron.run();

    expect(service.runCheck).toHaveBeenCalledWith({ limit: 20 });
  });

  it('falls back to the default when the configured value is not a number', async () => {
    config.get.mockReturnValue('not-a-number');

    await cron.run();

    expect(service.runCheck).toHaveBeenCalledWith({ limit: 20 });
  });
});
