package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.dto.BookDetailResponse;
import com.luxgrimoire.backend.dto.BookSeriesEntryResponse;
import com.luxgrimoire.backend.dto.BookSummaryDto;
import com.luxgrimoire.backend.dto.PageResponse;
import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.repository.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class BookStore {
    private static final Pattern DIGITS_PATTERN = Pattern.compile("\\d+");

    private final BookRepository bookRepo;
    private final BookEditionRepository editionRepo;
    private final BookBoxCompanyStore companyStore;

    public BookStore(BookRepository bookRepo, BookEditionRepository editionRepo,
                     BookBoxCompanyStore companyStore) {
        this.bookRepo = bookRepo;
        this.editionRepo = editionRepo;
        this.companyStore = companyStore;
    }

    @Transactional(readOnly = true)
    public List<Book> findAll() {
        return bookRepo.findAll();
    }

    @Transactional(readOnly = true)
    public List<Book> findAllApproved() {
        return bookRepo.findByStatus("approved");
    }

    @Transactional(readOnly = true)
    public PageResponse<BookSummaryDto> findAllApprovedPaged(int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("title"));
        Page<Book> bookPage = bookRepo.findByStatus("approved", pageable);
        List<BookSummaryDto> content = bookPage.getContent().stream()
                .map(b -> new BookSummaryDto(b.getId(), b.getTitle(), b.getAuthor(), b.getAuthorId(),
                        b.getSeriesName(), b.getVolumeNumber(), b.getStatus(), b.getCoverUrl()))
                .toList();
        return new PageResponse<>(content, bookPage.getNumber(), bookPage.getSize(),
                bookPage.getTotalElements(), bookPage.getTotalPages(), bookPage.isLast());
    }

    @Transactional(readOnly = true)
    public PageResponse<BookSummaryDto> findAllPaged(int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("title"));
        Page<Book> bookPage = bookRepo.findAll(pageable);
        List<BookSummaryDto> content = bookPage.getContent().stream()
                .map(b -> new BookSummaryDto(b.getId(), b.getTitle(), b.getAuthor(), b.getAuthorId(),
                        b.getSeriesName(), b.getVolumeNumber(), b.getStatus(), b.getCoverUrl()))
                .toList();
        return new PageResponse<>(content, bookPage.getNumber(), bookPage.getSize(),
                bookPage.getTotalElements(), bookPage.getTotalPages(), bookPage.isLast());
    }

    @Transactional(readOnly = true)
    public List<Book> findAllPending() {
        return bookRepo.findByStatus("pending");
    }

    @Transactional(readOnly = true)
    public Optional<Book> findById(String bookId) {
        return bookRepo.findById(bookId);
    }

    @Transactional(readOnly = true)
    public Optional<Book> findByIdWithEditions(String bookId) {
        return bookRepo.findWithEditionsById(bookId);
    }

    @Transactional(readOnly = true)
    public Optional<BookDetailResponse> findDetailById(String bookId, boolean includePending) {
        return bookRepo.findWithEditionsById(bookId)
                .filter(book -> isVisibleToRequester(book, includePending))
                .map(book -> new BookDetailResponse(
                        book.getId(),
                        book.getTitle(),
                        book.getAuthor(),
                        book.getAuthorId(),
                        book.getSeriesName(),
                        book.getVolumeNumber(),
                        new ArrayList<>(book.getEditions())
                ));
    }

    @Transactional(readOnly = true)
    public Optional<List<BookSeriesEntryResponse>> findSeriesBooksByBookId(String bookId, boolean includePending) {
        return bookRepo.findById(bookId)
                .filter(book -> isVisibleToRequester(book, includePending))
                .map(book -> resolveSeriesBooks(book, includePending).stream()
                        .map(seriesBook -> new BookSeriesEntryResponse(
                                seriesBook.getId(),
                                seriesBook.getTitle(),
                                seriesBook.getAuthor(),
                                seriesBook.getAuthorId(),
                                seriesBook.getSeriesName(),
                                seriesBook.getVolumeNumber(),
                                book.getId().equals(seriesBook.getId()),
                                seriesBook.getCoverUrl()
                        ))
                        .toList());
    }

    @Transactional(readOnly = true)
    public Optional<Book> findByTitle(String title) {
        return bookRepo.findByTitleIgnoreCase(title);
    }

    @Transactional(readOnly = true)
    public List<String> findDistinctSeriesNames() {
        return bookRepo.findDistinctSeriesNames();
    }

    @Transactional(readOnly = true)
    public List<String> findDistinctContributions() {
        return editionRepo.findDistinctContributions();
    }

    @Transactional
    public Book save(Book book) {
        if (book.getId() == null || book.getId().isBlank()) {
            book.setId(UUID.randomUUID().toString());
        }
        return bookRepo.save(book);
    }

    @Transactional
    public Optional<Book> updateBook(String id, Book updated) {
        return bookRepo.findById(id).map(existing -> {
            existing.setTitle(updated.getTitle());
            existing.setAuthor(updated.getAuthor());
            existing.setAuthorId(updated.getAuthorId());
            existing.setSeriesName(updated.getSeriesName());
            existing.setVolumeNumber(updated.getVolumeNumber());
            return bookRepo.save(existing);
        });
    }

    @Transactional
    public boolean deleteBook(String id) {
        if (!bookRepo.existsById(id)) return false;
        bookRepo.deleteById(id);
        return true;
    }

    @Transactional
    public Optional<BookEdition> addEdition(String bookId, BookEdition edition) {
        return bookRepo.findById(bookId).map(book -> {
            if (edition.getId() == null || edition.getId().isBlank()) {
                edition.setId(UUID.randomUUID().toString());
            }
            edition.setBook(book);
            BookEdition saved = editionRepo.save(edition);
            refreshCoverUrl(book);
            return saved;
        });
    }

    @Transactional
    public Optional<BookEdition> updateEdition(String bookId, String editionId, BookEdition updated) {
        return editionRepo.findById(editionId).map(existing -> {
            if (existing.getBook() == null || !bookId.equals(existing.getBook().getId())) {
                return null;
            }
            existing.setEditionName(updated.getEditionName());
            existing.setSubscriptionName(updated.getSubscriptionName());
            existing.setPublisher(updated.getPublisher());
            existing.setLanguage(updated.getLanguage());
            existing.setSubscriptionMonth(updated.getSubscriptionMonth());
            existing.setSubscriptionYear(updated.getSubscriptionYear());
            existing.setFirstAccessDate(updated.getFirstAccessDate());
            existing.setEarlyAccessDate(updated.getEarlyAccessDate());
            existing.setGeneralSaleDate(updated.getGeneralSaleDate());
            existing.setBasePrice(updated.getBasePrice());
            existing.setCurrency(updated.getCurrency());
            existing.setBookBoxCompanyId(updated.getBookBoxCompanyId());
            existing.setBookBoxCompanyCustomName(updated.getBookBoxCompanyCustomName());
            existing.setSubscriptionId(updated.getSubscriptionId());
            existing.setSubscriptionMonthId(updated.getSubscriptionMonthId());

            existing.getImageUrls().clear();
            if (updated.getImageUrls() != null) existing.getImageUrls().addAll(updated.getImageUrls());

            existing.getArtists().clear();
            if (updated.getArtists() != null) existing.getArtists().addAll(updated.getArtists());

            existing.getFeatures().clear();
            if (updated.getFeatures() != null) existing.getFeatures().addAll(updated.getFeatures());

            refreshCoverUrl(existing.getBook());
            return editionRepo.save(existing);
        }).filter(Objects::nonNull);
    }

    @Transactional
    public boolean deleteEdition(String bookId, String editionId) {
        return editionRepo.findById(editionId)
                .filter(e -> e.getBook() != null && bookId.equals(e.getBook().getId()))
                .map(e -> {
                    Book book = e.getBook();
                    editionRepo.delete(e);
                    editionRepo.flush();
                    refreshCoverUrl(book);
                    return true;
                })
                .orElse(false);
    }

    @Transactional(readOnly = true)
    public Optional<Book> findBookByEditionId(String editionId) {
        return editionRepo.findBookByEditionId(editionId);
    }

    @Transactional(readOnly = true)
    public Optional<Map<String, String>> findRandomApprovedEdition() {
        return bookRepo.findRandomApprovedEditionId()
                .flatMap(editionId -> editionRepo.findById(editionId))
                .map(e -> Map.of("bookId", e.getBook().getId(), "editionId", e.getId()));
    }

    @Transactional
    public void linkEditionToMonth(BookEdition edition) {
        if (edition.getSubscriptionMonthId() == null || edition.getBookBoxCompanyId() == null) return;
        companyStore.findById(edition.getBookBoxCompanyId()).ifPresent(company ->
            company.getSubscriptions().stream()
                .filter(s -> edition.getSubscriptionId() != null && edition.getSubscriptionId().equals(s.getId()))
                .findFirst()
                .ifPresent(sub -> sub.getMonths().stream()
                    .filter(m -> edition.getSubscriptionMonthId().equals(m.getId()))
                    .findFirst()
                    .ifPresent(m -> m.setBookId(edition.getId())))
        );
    }

    @Transactional
    public void unlinkBookFromMonth(String monthId) {
        companyStore.findAll().forEach(company ->
            company.getSubscriptions().forEach(sub ->
                sub.getMonths().stream()
                    .filter(m -> monthId.equals(m.getId()))
                    .findFirst()
                    .ifPresent(m -> m.setBookId(null))
            )
        );
    }

    private void refreshCoverUrl(Book book) {
        String coverUrl = bookRepo.findFirstImageUrlByBookId(book.getId()).orElse(null);
        book.setCoverUrl(coverUrl);
        bookRepo.save(book);
    }

    private boolean isVisibleToRequester(Book book, boolean includePending) {
        return includePending || "approved".equalsIgnoreCase(book.getStatus());
    }

    private List<Book> resolveSeriesBooks(Book book, boolean includePending) {
        String seriesName = normalize(book.getSeriesName());
        if (seriesName == null) {
            return List.of(book);
        }

        List<Book> seriesBooks = bookRepo.findBySeriesNameIgnoreCase(seriesName).stream()
                .filter(candidate -> isVisibleToRequester(candidate, includePending))
                .sorted(seriesBookComparator())
                .toList();

        if (seriesBooks.isEmpty()) {
            return List.of(book);
        }
        return seriesBooks;
    }

    private Comparator<Book> seriesBookComparator() {
        return Comparator
                .comparingInt(this::seriesPositionSortNumber)
                .thenComparing(book -> normalize(book.getVolumeNumber()), Comparator.nullsLast(String::compareTo))
                .thenComparing(book -> normalize(book.getTitle()), Comparator.nullsLast(String::compareTo))
                .thenComparing(Book::getId);
    }

    private int seriesPositionSortNumber(Book book) {
        String volumeNumber = normalize(book.getVolumeNumber());
        if (volumeNumber == null) {
            return Integer.MAX_VALUE;
        }

        Matcher matcher = DIGITS_PATTERN.matcher(volumeNumber);
        if (!matcher.find()) {
            return Integer.MAX_VALUE - 1;
        }

        try {
            return Integer.parseInt(matcher.group());
        } catch (NumberFormatException ignored) {
            return Integer.MAX_VALUE - 1;
        }
    }

    private String normalize(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized.toLowerCase(Locale.ROOT);
    }
}
