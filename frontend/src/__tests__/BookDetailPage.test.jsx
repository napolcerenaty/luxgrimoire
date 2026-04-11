import { describe, test, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BookDetailEditPage from "../BookDetailEditPage";
import BookDetailPage from "../BookDetailPage";
import { I18nProvider } from "../i18n";

vi.mock("../AuthContext", () => {
  const stableUser = { username: "reader" };
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

vi.mock("../BookCarousel", () => ({
  default: ({ images }) => <div data-testid="book-carousel">{images?.length ?? 0}</div>,
}));

describe("Book detail flows", () => {
  beforeEach(() => {
    localStorage.setItem("luxgrimoire_lang", "en");
    globalThis.fetch = vi.fn((url) => {
      if (url.includes("/api/book-details/book-1")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: "book-1",
            title: "Current Book",
            author: "Author One",
            seriesName: "Lux Saga",
            volumeNumber: "2",
            editions: [{ id: "edition-current", editionName: "Collector", imageUrls: [] }],
            seriesBooks: [
              {
                id: "book-0",
                title: "Previous Book",
                author: "Author One",
                seriesName: "Lux Saga",
                volumeNumber: "1",
                current: false,
                editions: [{ id: "edition-prev", editionName: "Standard", imageUrls: [] }],
              },
              {
                id: "book-1",
                title: "Current Book",
                author: "Author One",
                seriesName: "Lux Saga",
                volumeNumber: "2",
                current: true,
                editions: [{ id: "edition-current", editionName: "Collector", imageUrls: [] }],
              },
            ],
          }),
        });
      }
      if (url.includes("/api/companies")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes("/api/user/books")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (
        url.includes("/api/authors")
        || url.includes("/api/artists")
        || url.includes("/series-names")
        || url.includes("/contributions")
      ) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  test("renders current book metadata and all series editions", async () => {
    const onSeriesClick = vi.fn();

    render(
      <I18nProvider>
        <BookDetailPage
          bookId="book-1"
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onEditEdition={vi.fn()}
          onNewEdition={vi.fn()}
          onNavigateNew={vi.fn()}
          onCompanyClick={vi.fn()}
          onSeriesClick={onSeriesClick}
        />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getAllByText("Current Book")[0]).toBeInTheDocument());

    expect(screen.getAllByText("Author One").length).toBeGreaterThan(0);
    expect(screen.queryByText("Available editions in this series")).not.toBeInTheDocument();
    expect(screen.queryByText("Previous Book")).not.toBeInTheDocument();
    expect(screen.getByText("Collector")).toBeInTheDocument();
    expect(screen.queryByText("Standard")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Lux Saga"));
    expect(onSeriesClick).toHaveBeenCalledWith("book-1");
  });

  test("shows prefilled book metadata when adding an edition from an existing book", async () => {
    render(
      <I18nProvider>
        <BookDetailEditPage
          initialData={{
            id: "book-1",
            title: "Current Book",
            author: "Author One",
            seriesName: "Lux Saga",
            volumeNumber: "2",
          }}
          editingEdition="new"
          onSaved={vi.fn()}
          onBack={vi.fn()}
        />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText("Book metadata")).toBeInTheDocument());

    expect(screen.getByText("Current Book")).toBeInTheDocument();
    expect(screen.getByText("Author One")).toBeInTheDocument();
    expect(screen.getByText("Lux Saga")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
