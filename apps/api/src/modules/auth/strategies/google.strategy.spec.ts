import { GoogleStrategy } from './google.strategy';

describe('GoogleStrategy.validate', () => {
  const strategy = new GoogleStrategy();

  it('maps a full Google profile onto the internal user shape', (done) => {
    const profile = {
      id: 'g-123',
      displayName: 'Jane Doe',
      emails: [{ value: 'jane@example.com' }],
      photos: [{ value: 'https://lh3.google.com/a/jane.jpg' }],
    } as any;

    strategy.validate('access-tok', 'refresh-tok', profile, (err, user) => {
      expect(err).toBeNull();
      expect(user).toEqual({
        provider: 'google',
        providerId: 'g-123',
        email: 'jane@example.com',
        displayName: 'Jane Doe',
        avatarUrl: 'https://lh3.google.com/a/jane.jpg',
        accessToken: 'access-tok',
        refreshToken: 'refresh-tok',
      });
      done();
    });
  });

  it('tolerates a profile with no emails / photos / displayName', (done) => {
    strategy.validate('a', 'r', { id: 'g-9' } as any, (err, user: any) => {
      expect(err).toBeNull();
      expect(user).toMatchObject({ providerId: 'g-9', email: null, avatarUrl: null, displayName: null });
      done();
    });
  });
});
