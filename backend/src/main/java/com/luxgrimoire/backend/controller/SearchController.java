package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.repository.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/search")
public class SearchController {

    private static final int RESULTS_LIMIT = 20;

    private final BookRepository bookRepository;
    private final AuthorRepository authorRepository;
    private final ArtistRepository artistRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final BookBoxCompanyRepository companyRepository;

    public SearchController(BookRepository bookRepository, AuthorRepository authorRepository,
                            ArtistRepository artistRepository, SubscriptionRepository subscriptionRepository,
                            BookBoxCompanyRepository companyRepository) {
        this.bookRepository = bookRepository;
        this.authorRepository = authorRepository;
        this.artistRepository = artistRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.companyRepository = companyRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public Map<String, Object> search(
            @RequestParam(required = false, defaultValue = "") String q,
            @RequestParam(required = false, defaultValue = "all") String filter) {

        Map<String, Object> result = new LinkedHashMap<>();

        if (q.trim().length() < 2) {
            result.put("books", List.of());
            result.put("authors", List.of());
            result.put("artists", List.of());
            result.put("subscriptions", List.of());
            result.put("companies", List.of());
            return result;
        }

        String pattern = "%" + q.trim().toLowerCase() + "%";
        boolean all = "all".equals(filter);

        // ── Books ──────────────────────────────────────────────────────────
        if (all || "books".equals(filter)) {
            List<Book> books = bookRepository.searchByQuery(pattern).stream()
                    .limit(RESULTS_LIMIT)
                    .toList();

            // Collect only the companyIds that appear in results — no findAll()
            Set<String> companyIds = books.stream()
                    .flatMap(b -> b.getEditions().stream())
                    .map(BookEdition::getBookBoxCompanyId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());

            Map<String, BookBoxCompany> companyMap = companyIds.isEmpty()
                    ? Collections.emptyMap()
                    : companyRepository.findAllById(companyIds).stream()
                            .collect(Collectors.toMap(BookBoxCompany::getId, c -> c));

            List<Map<String, Object>> bookResults = new ArrayList<>();
            for (Book book : books) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", book.getId());
                item.put("title", book.getTitle());
                item.put("author", book.getAuthor());
                item.put("authorId", book.getAuthorId());
                item.put("seriesName", book.getSeriesName());
                item.put("coverUrl", book.getCoverUrl());

                String companyId = null;
                String companyName = null;
                String companyLogoUrl = null;

                for (BookEdition edition : book.getEditions()) {
                    if (companyId == null && edition.getBookBoxCompanyId() != null) {
                        companyId = edition.getBookBoxCompanyId();
                        BookBoxCompany company = companyMap.get(companyId);
                        if (company != null) {
                            companyName = company.getName();
                            companyLogoUrl = company.getLogoUrl();
                            if (edition.getSubscriptionId() != null) {
                                final String subId = edition.getSubscriptionId();
                                company.getSubscriptions().stream()
                                        .filter(s -> s.getId().equals(subId))
                                        .findFirst()
                                        .ifPresent(sub -> {
                                            item.put("subscriptionId", sub.getId());
                                            item.put("subscriptionName", sub.getName());
                                            item.put("subscriptionLogoUrl", sub.getLogoUrl());
                                        });
                            }
                        }
                        break;
                    }
                }

                item.putIfAbsent("subscriptionId", null);
                item.putIfAbsent("subscriptionName", null);
                item.putIfAbsent("subscriptionLogoUrl", null);
                item.put("companyId", companyId);
                item.put("companyName", companyName);
                item.put("companyLogoUrl", companyLogoUrl);
                bookResults.add(item);
            }
            result.put("books", bookResults);
        } else {
            result.put("books", List.of());
        }

        // ── Authors ────────────────────────────────────────────────────────
        if (all || "authors".equals(filter)) {
            List<Author> authors = authorRepository
                    .findByNameContainingIgnoreCase(q.trim(), PageRequest.of(0, RESULTS_LIMIT));
            List<Map<String, Object>> authorResults = new ArrayList<>();
            for (Author author : authors) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", author.getId());
                item.put("name", author.getName());
                item.put("imageUrl", author.getImageUrl());
                item.put("bio", author.getBio());
                item.put("bookCount", bookRepository.countApprovedByAuthorId(author.getId()));
                authorResults.add(item);
            }
            result.put("authors", authorResults);
        } else {
            result.put("authors", List.of());
        }

        // ── Artists ────────────────────────────────────────────────────────
        if (all || "artists".equals(filter)) {
            List<Artist> artists = artistRepository
                    .findByNameContainingIgnoreCase(q.trim(), PageRequest.of(0, RESULTS_LIMIT));
            List<Map<String, Object>> artistResults = new ArrayList<>();
            for (Artist artist : artists) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", artist.getId());
                item.put("name", artist.getName());
                item.put("imageUrl", artist.getImageUrl());
                item.put("bio", artist.getBio());
                artistResults.add(item);
            }
            result.put("artists", artistResults);
        } else {
            result.put("artists", List.of());
        }

        // ── Subscriptions ──────────────────────────────────────────────────
        if (all || "subscriptions".equals(filter)) {
            List<Subscription> subscriptions = subscriptionRepository
                    .searchByNamePattern(pattern, PageRequest.of(0, RESULTS_LIMIT));
            List<Map<String, Object>> subResults = new ArrayList<>();
            for (Subscription sub : subscriptions) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", sub.getId());
                item.put("name", sub.getName());
                item.put("logoUrl", sub.getLogoUrl());
                item.put("type", sub.getType());
                BookBoxCompany company = sub.getCompany();
                if (company != null) {
                    item.put("companyId", company.getId());
                    item.put("companyName", company.getName());
                    item.put("companyLogoUrl", company.getLogoUrl());
                }
                subResults.add(item);
            }
            result.put("subscriptions", subResults);
        } else {
            result.put("subscriptions", List.of());
        }

        // ── Companies ──────────────────────────────────────────────────────
        if (all || "companies".equals(filter)) {
            List<BookBoxCompany> companies = companyRepository
                    .findByNameContainingIgnoreCase(q.trim(), PageRequest.of(0, RESULTS_LIMIT));
            List<Map<String, Object>> companyResults = new ArrayList<>();
            for (BookBoxCompany company : companies) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", company.getId());
                item.put("name", company.getName());
                item.put("logoUrl", company.getLogoUrl());
                item.put("location", company.getLocation());
                companyResults.add(item);
            }
            result.put("companies", companyResults);
        } else {
            result.put("companies", List.of());
        }

        return result;
    }
}
