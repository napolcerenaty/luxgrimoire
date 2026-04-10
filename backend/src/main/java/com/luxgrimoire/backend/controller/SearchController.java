package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
@RequestMapping("/api/search")
public class SearchController {

    @Autowired private BookRepository bookRepository;
    @Autowired private AuthorRepository authorRepository;
    @Autowired private ArtistRepository artistRepository;
    @Autowired private SubscriptionRepository subscriptionRepository;
    @Autowired private BookBoxCompanyRepository companyRepository;

    @GetMapping
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
            List<Book> books = bookRepository.searchByQuery(pattern);

            // Build company lookup map once
            Map<String, BookBoxCompany> companyMap = new HashMap<>();
            companyRepository.findAll().forEach(c -> companyMap.put(c.getId(), c));

            List<Map<String, Object>> bookResults = new ArrayList<>();
            for (Book book : books) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", book.getId());
                item.put("title", book.getTitle());
                item.put("author", book.getAuthor());
                item.put("authorId", book.getAuthorId());
                item.put("seriesName", book.getSeriesName());

                String coverUrl = null;
                String companyId = null;
                String companyName = null;
                String companyLogoUrl = null;
                String subscriptionName = null;
                String subscriptionLogoUrl = null;

                for (BookEdition edition : book.getEditions()) {
                    if (coverUrl == null
                            && edition.getImageUrls() != null
                            && !edition.getImageUrls().isEmpty()) {
                        coverUrl = edition.getImageUrls().get(0);
                    }
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
                    }
                    if (coverUrl != null && companyId != null) break;
                }

                item.putIfAbsent("subscriptionId", null);
                item.putIfAbsent("subscriptionName", subscriptionName);
                item.putIfAbsent("subscriptionLogoUrl", subscriptionLogoUrl);
                item.put("coverUrl", coverUrl);
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
            List<Author> authors = authorRepository.findByNameContainingIgnoreCase(q.trim());
            List<Map<String, Object>> authorResults = new ArrayList<>();
            for (Author author : authors) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", author.getId());
                item.put("name", author.getName());
                item.put("imageUrl", author.getImageUrl());
                item.put("nationality", author.getNationality());
                item.put("bio", author.getBio());
                item.put("bookCount", bookRepository.countByAuthorId(author.getId()));
                authorResults.add(item);
            }
            result.put("authors", authorResults);
        } else {
            result.put("authors", List.of());
        }

        // ── Artists ────────────────────────────────────────────────────────
        if (all || "artists".equals(filter)) {
            List<Artist> artists = artistRepository.findByNameContainingIgnoreCase(q.trim());
            List<Map<String, Object>> artistResults = new ArrayList<>();
            for (Artist artist : artists) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", artist.getId());
                item.put("name", artist.getName());
                item.put("imageUrl", artist.getImageUrl());
                item.put("specialty", artist.getSpecialty());
                item.put("bio", artist.getBio());
                artistResults.add(item);
            }
            result.put("artists", artistResults);
        } else {
            result.put("artists", List.of());
        }

        // ── Subscriptions ──────────────────────────────────────────────────
        if (all || "subscriptions".equals(filter)) {
            List<Subscription> subscriptions = subscriptionRepository.searchByNamePattern(pattern);
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
            List<BookBoxCompany> companies = companyRepository.findByNameContainingIgnoreCase(q.trim());
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
