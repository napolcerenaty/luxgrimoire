import { SeriesDiscoveryCron } from './series-discovery.cron';
import { SeriesDiscoveryService } from './series-discovery.service';

describe('SeriesDiscoveryCron', () => {
  let cron: SeriesDiscoveryCron;
  let service: { runCheck: jest.Mock };

  beforeEach(() => {
    service = { runCheck: jest.fn().mockResolvedValue({ seriesChecked: 5, suggestionsCreated: 2, googleBooksRateLimited: false }) };
    cron = new SeriesDiscoveryCron(service as unknown as SeriesDiscoveryService);
  });

  it('calls runCheck with no explicit limit, so the service resolves the default daily batch size itself', async () => {
    await cron.run();

    expect(service.runCheck).toHaveBeenCalledWith();
  });
});
