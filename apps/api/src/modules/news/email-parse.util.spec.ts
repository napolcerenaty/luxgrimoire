import { looksLikeConfirmationEmail, extractActionLink, extractTrackingPixelUrls } from './email-parse.util';

describe('looksLikeConfirmationEmail (spec 2.2.1)', () => {
  it('flags a typical double opt-in confirmation email', () => {
    expect(looksLikeConfirmationEmail(
      'Please confirm your subscription',
      '<p>Click here to confirm your email and start receiving updates.</p>',
    )).toBe(true);
  });

  it('does not flag a genuine news email', () => {
    expect(looksLikeConfirmationEmail(
      'August 2026 Theme Reveal',
      '<p>We are so excited to reveal this month\'s theme...</p>',
    )).toBe(false);
  });
});

describe('extractActionLink (spec 2.2.1)', () => {
  it('finds a link whose text says "confirm"', () => {
    const html = '<p>Welcome!</p><a href="https://list.example.com/confirm?id=abc">Confirm my subscription</a>';
    expect(extractActionLink(html)).toBe('https://list.example.com/confirm?id=abc');
  });

  it('finds a link whose href (not text) contains "verify"', () => {
    const html = '<a href="https://list.example.com/verify/xyz">Click here</a>';
    expect(extractActionLink(html)).toBe('https://list.example.com/verify/xyz');
  });

  it('returns null when no action-like link is present', () => {
    const html = '<a href="https://example.com/shop">Shop now</a>';
    expect(extractActionLink(html)).toBeNull();
  });
});

describe('extractTrackingPixelUrls (spec 2.2 — simulate open)', () => {
  it('finds a 1x1 tracking pixel by its dimensions', () => {
    const html = '<img src="https://track.example.com/open/abc" width="1" height="1" />';
    expect(extractTrackingPixelUrls(html)).toEqual(['https://track.example.com/open/abc']);
  });

  it('finds a pixel on a known ESP tracking domain even without explicit 1x1 dimensions', () => {
    const html = '<img src="https://xyz.mcusercontent.com/open.gif" alt="" />';
    expect(extractTrackingPixelUrls(html)).toEqual(['https://xyz.mcusercontent.com/open.gif']);
  });

  it('ignores ordinary content images', () => {
    const html = '<img src="https://example.com/box-photo.jpg" width="600" height="400" alt="This month\'s box" />';
    expect(extractTrackingPixelUrls(html)).toEqual([]);
  });

  it('de-duplicates repeated pixel URLs', () => {
    const html = '<img src="https://track.example.com/x" width="1" height="1"/><img src="https://track.example.com/x" width="1" height="1"/>';
    expect(extractTrackingPixelUrls(html)).toEqual(['https://track.example.com/x']);
  });
});
