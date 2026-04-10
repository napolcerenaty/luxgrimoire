import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react/pure';
import { I18nProvider } from '../i18n';
import AccountPage from '../AccountPage';

// Mock useAuth with a STABLE object reference so useEffect([user, flag])
// in BookListSection doesn't re-run on every render (which would cause an infinite loop).
vi.mock('../AuthContext', () => {
  const stableUser = {
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    timezone: 'UTC',
    avatarUrl: '',
  };
  const stableAuth = {
    user: stableUser,
    login: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
    updateSettings: vi.fn(),
    uploadAvatar: vi.fn(),
  };
  return {
    useAuth: () => stableAuth,
    AuthProvider: ({ children }) => children,
  };
});

// Render once for all tests (from pure import = no auto-cleanup between tests)
let onSectionChangeMock;

beforeAll(async () => {
  localStorage.setItem('luxgrimoire_lang', 'en');
  global.fetch = vi.fn((url) => {
    if (url.includes('/api/user/books')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.includes('/api/user/subscriptions')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });

  onSectionChangeMock = vi.fn();
  render(
    <I18nProvider>
      <AccountPage
        onBookClick={vi.fn()}
        initialSection="calendar"
        onSectionChange={onSectionChangeMock}
      />
    </I18nProvider>
  );
  await waitFor(() => screen.getByText('My Calendar'));
});

afterAll(() => {
  cleanup();
});

beforeEach(() => {
  onSectionChangeMock.mockClear();
});

describe('AccountPage navigation', () => {
  test('renders nav items', () => {
    expect(screen.getByText('My Calendar')).toBeInTheDocument();
    expect(screen.getByText('My Collection')).toBeInTheDocument();
    expect(screen.getByText('My Subscriptions')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  test('calendar section is shown by default', () => {
    // Navigate back to calendar (prior test might have changed section)
    fireEvent.click(screen.getByText('My Calendar'));
    expect(screen.getByLabelText('previous month')).toBeInTheDocument();
  });

  test('clicking Settings nav shows settings section', async () => {
    fireEvent.click(screen.getByText('Settings'));

    await waitFor(() => {
      // 'Save Settings' button is unique to the Settings section
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
  });

  test('clicking My Collection nav switches section', () => {
    fireEvent.click(screen.getByText('My Collection'));

    // After switching to collection, the calendar nav buttons disappear
    expect(screen.queryByLabelText('previous month')).not.toBeInTheDocument();
  });

  test('clicking My Subscriptions nav switches section', () => {
    fireEvent.click(screen.getByText('My Subscriptions'));

    // After switching to subscriptions, the calendar nav buttons disappear
    expect(screen.queryByLabelText('previous month')).not.toBeInTheDocument();
  });

  test('calls onSectionChange when nav item is clicked', () => {
    fireEvent.click(screen.getByText('Settings'));

    expect(onSectionChangeMock).toHaveBeenCalledWith('settings');
  });
});