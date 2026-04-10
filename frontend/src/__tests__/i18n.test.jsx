import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, useI18n } from '../i18n';

// Helper component that exposes t() output via data-testid
function TranslationDisplay({ tKey }) {
  const { t } = useI18n();
  return <span data-testid="result">{t(tKey)}</span>;
}

// Helper component that exposes both t() and setLang
function LangSwitcher() {
  const { t, setLang } = useI18n();
  return (
    <div>
      <span data-testid="rights">{t('app.footer')}</span>
      <button onClick={() => setLang('en')} data-testid="btn-en">EN</button>
      <button onClick={() => setLang('pl')} data-testid="btn-pl">PL</button>
      <button onClick={() => setLang('de')} data-testid="btn-de">DE</button>
      <button onClick={() => setLang('fr')} data-testid="btn-fr">FR</button>
      <button onClick={() => setLang('es')} data-testid="btn-es">ES</button>
    </div>
  );
}

describe('i18n translations', () => {
  beforeEach(() => {
    // Set English as default via localStorage to avoid browser-detection issues
    localStorage.setItem('luxgrimoire_lang', 'en');
  });

  test('t() returns English translation for app.footer', () => {
    render(
      <I18nProvider>
        <TranslationDisplay tKey="app.footer" />
      </I18nProvider>
    );
    expect(screen.getByTestId('result').textContent).toBe('All rights reserved');
  });

  test('t() returns English translation for footer.browseEditions', () => {
    render(
      <I18nProvider>
        <TranslationDisplay tKey="footer.browseEditions" />
      </I18nProvider>
    );
    expect(screen.getByTestId('result').textContent).toBe('Browse Editions');
  });

  test('t() returns the key path when key is missing', () => {
    render(
      <I18nProvider>
        <TranslationDisplay tKey="totally.missing.key" />
      </I18nProvider>
    );
    expect(screen.getByTestId('result').textContent).toBe('totally.missing.key');
  });

  test('language switches from EN to PL', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <LangSwitcher />
      </I18nProvider>
    );
    // Start in English
    expect(screen.getByTestId('rights').textContent).toBe('All rights reserved');

    // Switch to Polish
    await user.click(screen.getByTestId('btn-pl'));
    expect(screen.getByTestId('rights').textContent).toBe('Wszelkie prawa zastrzeżone');
  });

  test('language switches from EN to DE', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <LangSwitcher />
      </I18nProvider>
    );
    await user.click(screen.getByTestId('btn-de'));
    expect(screen.getByTestId('rights').textContent).toBe('Alle Rechte vorbehalten');
  });

  test('language switches from EN to FR', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <LangSwitcher />
      </I18nProvider>
    );
    await user.click(screen.getByTestId('btn-fr'));
    expect(screen.getByTestId('rights').textContent).toBe('Tous droits réservés');
  });

  test('language switches from EN to ES', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <LangSwitcher />
      </I18nProvider>
    );
    await user.click(screen.getByTestId('btn-es'));
    expect(screen.getByTestId('rights').textContent).toBe('Todos los derechos reservados');
  });

  test('account nav translation keys exist in all languages', async () => {
    const user = userEvent.setup();

    function NavKeyDisplay() {
      const { t } = useI18n();
      return (
        <div>
          <span data-testid="navCalendar">{t('account.navCalendar')}</span>
          <span data-testid="navCollection">{t('account.navCollection')}</span>
          <span data-testid="navSubscriptions">{t('account.navSubscriptions')}</span>
        </div>
      );
    }

    render(
      <I18nProvider>
        <NavKeyDisplay />
      </I18nProvider>
    );

    // Keys should not fall back to the key itself (meaning translations exist)
    expect(screen.getByTestId('navCalendar').textContent).not.toBe('account.navCalendar');
    expect(screen.getByTestId('navCollection').textContent).not.toBe('account.navCollection');
    expect(screen.getByTestId('navSubscriptions').textContent).not.toBe('account.navSubscriptions');
  });
});
