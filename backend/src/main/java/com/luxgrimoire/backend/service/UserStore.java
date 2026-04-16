package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.dto.CollectionViewDto;
import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.repository.*;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class UserStore {

    private final AppUserRepository userRepo;
    private final UserBookEntryRepository bookEntryRepo;
    private final PurchaseTransactionRepository purchaseTxRepo;
    private final UserEditionTagRepository editionTagRepo;
    private final UserSubEntryTagRepository subEntryTagRepo;
    private final UserSubscriptionEntryRepository subEntryRepo;
    private final UserSubscriptionCostChangeRepository costChangeRepo;
    private final UserSubBillingPeriodRepository billingPeriodRepo;
    private final SubscriptionRepository subscriptionRepo;
    private final BookRepository bookRepo;
    private final BookEditionRepository bookEditionRepo;

    public UserStore(AppUserRepository userRepo,
                     UserBookEntryRepository bookEntryRepo,
                     PurchaseTransactionRepository purchaseTxRepo,
                     UserEditionTagRepository editionTagRepo,
                     UserSubEntryTagRepository subEntryTagRepo,
                     UserSubscriptionEntryRepository subEntryRepo,
                     UserSubscriptionCostChangeRepository costChangeRepo,
                     UserSubBillingPeriodRepository billingPeriodRepo,
                     SubscriptionRepository subscriptionRepo,
                     BookRepository bookRepo,
                     BookEditionRepository bookEditionRepo) {
        this.userRepo = userRepo;
        this.bookEntryRepo = bookEntryRepo;
        this.purchaseTxRepo = purchaseTxRepo;
        this.editionTagRepo = editionTagRepo;
        this.subEntryTagRepo = subEntryTagRepo;
        this.subEntryRepo = subEntryRepo;
        this.costChangeRepo = costChangeRepo;
        this.billingPeriodRepo = billingPeriodRepo;
        this.subscriptionRepo = subscriptionRepo;
        this.bookRepo = bookRepo;
        this.bookEditionRepo = bookEditionRepo;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void init() {
        userRepo.findById("admin").ifPresent(userRepo::delete);
        userRepo.findById("user1").ifPresent(userRepo::delete);
        if (!userRepo.existsById("napolcerenaty")) {
            userRepo.save(new AppUser(
                "napolcerenaty", "napolcerenaty",
                "Renata", "Foremny", "Europe/Warsaw",
                "napolcerenaty@gmail.com", "admin"
            ));
        }
    }

    @Transactional(readOnly = true)
    public Optional<AppUser> findByUsername(String username) {
        return userRepo.findById(username);
    }

    @Transactional(readOnly = true)
    public Optional<AppUser> findByEmail(String email) {
        return userRepo.findByEmail(email);
    }

    @Transactional
    public AppUser save(AppUser user) {
        return userRepo.save(user);
    }

    @Transactional(readOnly = true)
    public boolean authenticate(String loginId, String password) {
        Optional<AppUser> user = loginId.contains("@")
            ? userRepo.findByEmail(loginId)
            : userRepo.findById(loginId);
        return user.map(u -> u.getPassword().equals(password)).orElse(false);
    }

    @Transactional(readOnly = true)
    public Optional<AppUser> findByLoginId(String loginId) {
        return loginId.contains("@")
            ? userRepo.findByEmail(loginId)
            : userRepo.findById(loginId);
    }

    @Transactional
    public AppUser register(String username, String email, String password,
                            String firstName, String lastName) {
        if (userRepo.existsById(username)) {
            throw new IllegalArgumentException("Username already taken");
        }
        if (userRepo.findByEmail(email).isPresent()) {
            throw new IllegalArgumentException("Email already registered");
        }
        AppUser user = new AppUser(username, password, firstName, lastName, "Europe/Warsaw", email, "user");
        return userRepo.save(user);
    }

    // ── Book collection ────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<UserBookEntry> getBooks(String username) {
        return bookEntryRepo.findByUserUsername(username);
    }

    @Transactional(readOnly = true)
    public List<CollectionViewDto> getCollectionView(String username) {
        List<UserBookEntry> entries = bookEntryRepo.findByUserUsername(username);
        if (entries.isEmpty()) return List.of();

        Set<String> bookIds = entries.stream()
                .map(UserBookEntry::getBookId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<String> editionIds = entries.stream()
                .map(UserBookEntry::getEditionId).filter(Objects::nonNull).collect(Collectors.toSet());

        Map<String, Book> books = bookRepo.findAllById(bookIds).stream()
                .collect(Collectors.toMap(Book::getId, b -> b));
        Map<String, BookEdition> editions = bookEditionRepo.findAllById(editionIds).stream()
                .collect(Collectors.toMap(BookEdition::getId, e -> e));

        return entries.stream().map(e -> {
            Book book = books.get(e.getBookId());
            BookEdition edition = editions.get(e.getEditionId());
            String features = (edition != null && edition.getFeatures() != null)
                    ? String.join(", ", edition.getFeatures()) : null;
            String purchaseDateStr = e.getPurchaseDate() != null
                    ? e.getPurchaseDate().toString().substring(0, 10) : null;
            return new CollectionViewDto(
                    e.getId(),
                    e.getBookId(),
                    e.getEditionId(),
                    edition != null ? edition.getLanguage() : null,
                    book != null ? book.getAuthor() : null,
                    book != null ? book.getTitle() : null,
                    book != null ? book.getSeriesName() : null,
                    book != null ? book.getVolumeNumber() : null,
                    edition != null ? edition.getEditionName() : null,
                    edition != null ? edition.getPublisher() : null,
                    features,
                    e.getReadingStatus(),
                    e.getOwnershipStatus(),
                    e.getCondition(),
                    purchaseDateStr,
                    e.getAllocatedPrice(),
                    e.getSaleDate(),
                    e.getSalePrice(),
                    e.getSaleVenue()
            );
        }).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<UserBookEntry> getBooksByFlag(String username, String flag) {
        return bookEntryRepo.findByUsernameAndFlag(username, flag);
    }

    @Transactional(readOnly = true)
    public List<UserBookEntry> getBooksByOwnershipStatus(String username, String status) {
        return bookEntryRepo.findByUsernameAndOwnershipStatus(username, status);
    }

    @Transactional(readOnly = true)
    public long countBooksByEdition(String username, String editionId) {
        return bookEntryRepo.countByUserUsernameAndEditionId(username, editionId);
    }

    @Transactional
    public UserBookEntry addBook(String username, String bookId, String editionId, String flag) {
        AppUser user = userRepo.findById(username).orElseThrow();
        UserBookEntry entry = new UserBookEntry(bookId, editionId);
        entry.setUser(user);
        String ownership = flag != null && !flag.isBlank() ? flag : "OWNED";
        entry.setOwnershipStatus(ownership);
        entry.setFlag(ownership); // keep legacy field in sync
        return bookEntryRepo.save(entry);
    }

    @Transactional
    public UserBookEntry updateBook(String username, String entryId, Map<String, Object> body) {
        UserBookEntry entry = bookEntryRepo.findById(entryId)
                .filter(e -> e.getUser() != null && username.equals(e.getUser().getUsername()))
                .orElseThrow(() -> new IllegalArgumentException("Not found"));
        if (body.containsKey("ownershipStatus")) {
            String s = (String) body.get("ownershipStatus");
            entry.setOwnershipStatus(s);
            entry.setFlag(s);
        }
        if (body.containsKey("readingStatus")) entry.setReadingStatus((String) body.get("readingStatus"));
        if (body.containsKey("condition")) entry.setCondition((String) body.get("condition"));
        if (body.containsKey("saleDate"))     entry.setSaleDate((String) body.get("saleDate"));
        if (body.containsKey("salePrice")  && body.get("salePrice") instanceof Number n)
            entry.setSalePrice(new BigDecimal(n.toString()));
        if (body.containsKey("saleCurrency")) entry.setSaleCurrency((String) body.get("saleCurrency"));
        if (body.containsKey("saleVenue"))    entry.setSaleVenue((String) body.get("saleVenue"));
        if (body.containsKey("saleNotes"))    entry.setSaleNotes((String) body.get("saleNotes"));
        return bookEntryRepo.save(entry);
    }

    @Transactional
    public boolean removeBook(String username, String entryId) {
        return bookEntryRepo.findById(entryId)
                .filter(e -> e.getUser() != null && username.equals(e.getUser().getUsername()))
                .map(e -> { bookEntryRepo.delete(e); return true; })
                .orElse(false);
    }

    // ── Purchase transactions ──────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<PurchaseTransaction> getPurchaseTransactions(String username) {
        return purchaseTxRepo.findByUsernameOrderByPurchaseDateDesc(username);
    }

    @Transactional(readOnly = true)
    public List<UserBookEntry> getEntriesForTransaction(String username, String transactionId) {
        return bookEntryRepo.findByUserUsernameAndPurchaseTransactionId(username, transactionId);
    }

    /**
     * Creates a PurchaseTransaction and adds all books in one shot.
     * books: list of {bookId, editionId, allocatedPrice (optional)}
     * Body: { purchaseDate, basePrice, taxesAndFees, shipping, currency, source, notes,
     *         books: [{bookId, editionId, allocatedPrice?, ownershipStatus?, condition?}] }
     * Auto-splits basePrice across books if individual allocatedPrice not given.
     */
    @Transactional
    public PurchaseTransaction addPurchase(String username, Map<String, Object> body) {
        AppUser user = userRepo.findById(username).orElseThrow();

        PurchaseTransaction tx = new PurchaseTransaction();
        tx.setUsername(username);
        if (body.get("purchaseDate") instanceof String s && !s.isBlank()) {
            String iso = s.length() == 10 ? s + "T00:00:00Z" : s;
            tx.setPurchaseDate(Instant.parse(iso));
        }
        if (body.get("basePrice")    instanceof Number n) tx.setBasePrice(new BigDecimal(n.toString()));
        if (body.get("taxesAndFees") instanceof Number n) tx.setTaxesAndFees(new BigDecimal(n.toString()));
        if (body.get("shipping")     instanceof Number n) tx.setShipping(new BigDecimal(n.toString()));
        if (body.get("currency") instanceof String s) tx.setCurrency(s);
        if (body.get("source")   instanceof String s) tx.setSource(s);
        if (body.get("notes")    instanceof String s) tx.setNotes(s);
        tx = purchaseTxRepo.save(tx);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> books = (List<Map<String, Object>>) body.get("books");
        if (books == null) books = new ArrayList<>();

        // Auto-split basePrice across books without explicit allocatedPrice
        BigDecimal autoSplit = null;
        if (tx.getBasePrice() != null && !books.isEmpty()) {
            long withoutPrice = books.stream()
                    .filter(b -> !(b.get("allocatedPrice") instanceof Number)).count();
            if (withoutPrice > 0)
                autoSplit = tx.getBasePrice().divide(BigDecimal.valueOf(books.size()), 2, RoundingMode.HALF_UP);
        }

        for (Map<String, Object> b : books) {
            String bookId    = (String) b.get("bookId");
            String editionId = (String) b.get("editionId");
            if (editionId == null && bookId == null) continue;

            UserBookEntry entry = new UserBookEntry(bookId, editionId);
            entry.setUser(user);
            entry.setPurchaseTransactionId(tx.getId());
            String ownership = b.get("ownershipStatus") instanceof String os ? os : "OWNED";
            entry.setOwnershipStatus(ownership);
            entry.setFlag(ownership);
            if (b.get("allocatedPrice") instanceof Number n)
                entry.setAllocatedPrice(new BigDecimal(n.toString()));
            else if (autoSplit != null)
                entry.setAllocatedPrice(autoSplit);
            if (b.get("condition") instanceof String s) entry.setCondition(s);
            entry.setPurchaseDate(tx.getPurchaseDate());
            bookEntryRepo.save(entry);
        }
        return tx;
    }

    // ── Subscription collection ────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<UserSubscriptionEntry> getSubscriptions(String username) {
        return subEntryRepo.findByUserUsername(username);
    }

    @Transactional(readOnly = true)
    public long countSubscriptions(String username, String companyId, String subscriptionId) {
        return subEntryRepo.countByUserUsernameAndSubscriptionIdAndCompanyId(username, subscriptionId, companyId);
    }

    @Transactional
    public UserSubscriptionEntry addSubscription(String username, String companyId, String subscriptionId, Map<String, Object> body) {
        AppUser user = userRepo.findById(username).orElseThrow();
        UserSubscriptionEntry entry = new UserSubscriptionEntry(companyId, subscriptionId);
        entry.setUser(user);
        if (body != null) {
            if (body.get("startDate") instanceof String sd && !sd.isBlank()) {
                entry.setStartDate(sd);
            }
            if (body.get("startingMonth") instanceof Number sm) {
                entry.setStartingMonth(sm.intValue());
            }
            if (body.get("shippingCost") instanceof Number sc) {
                entry.setShippingCost(new BigDecimal(sc.toString()));
            }
            if (body.get("taxesAndFees") instanceof Number tf) {
                entry.setTaxesAndFees(new BigDecimal(tf.toString()));
            }
            if (body.get("renewalDay") instanceof Number rd) {
                entry.setRenewalDay(rd.intValue());
            }
        }
        UserSubscriptionEntry saved = subEntryRepo.save(entry);
        // Auto-fill startingMonth from current month when reset type is SUBSCRIPTION_START
        if (entry.getStartingMonth() == null) {
            Subscription sub = subscriptionRepo.findById(subscriptionId).orElse(null);
            if (sub != null && "SUBSCRIPTION_START".equals(sub.getSkipResetType())) {
                entry.setStartingMonth(LocalDate.now().getMonthValue());
                saved = subEntryRepo.save(entry);
            }
        }
        // Record first billing period if provided
        if (body != null && body.get("billingPeriod") instanceof Map<?,?> bpRaw) {
            @SuppressWarnings("unchecked") Map<String, Object> bp = (Map<String, Object>) bpRaw;
            addBillingPeriodToEntry(saved, bp);
        }
        return saved;
    }

    @Transactional
    public boolean removeSubscription(String username, String entryId) {
        return subEntryRepo.findById(entryId)
                .filter(e -> e.getUser() != null && username.equals(e.getUser().getUsername()))
                .map(e -> { subEntryRepo.delete(e); return true; })
                .orElse(false);
    }

    @Transactional
    public UserSubscriptionEntry updateSubscriptionCosts(String username, String entryId,
            BigDecimal shippingCost, BigDecimal taxesAndFees,
            int effectiveFromMonth, int effectiveFromYear) {
        UserSubscriptionEntry entry = subEntryRepo.findById(entryId)
                .filter(e -> e.getUser() != null && username.equals(e.getUser().getUsername()))
                .orElseThrow();

        UserSubscriptionCostChange change = new UserSubscriptionCostChange();
        change.setEntry(entry);
        change.setEffectiveFromMonth(effectiveFromMonth);
        change.setEffectiveFromYear(effectiveFromYear);
        change.setShippingCost(shippingCost);
        change.setTaxesAndFees(taxesAndFees);
        costChangeRepo.save(change);

        entry.setShippingCost(shippingCost);
        entry.setTaxesAndFees(taxesAndFees);
        return subEntryRepo.save(entry);
    }

    @Transactional
    public UserSubscriptionEntry updateSubscriptionStatus(String username, String entryId,
            boolean active, String cancellationDate) {
        UserSubscriptionEntry entry = subEntryRepo.findById(entryId)
                .filter(e -> e.getUser() != null && username.equals(e.getUser().getUsername()))
                .orElseThrow();
        entry.setActive(active);
        entry.setCancellationDate(active ? null : cancellationDate);
        return subEntryRepo.save(entry);
    }

    @Transactional(readOnly = true)
    public List<UserSubscriptionCostChange> getCostChanges(String username, String entryId) {
        subEntryRepo.findById(entryId)
                .filter(e -> e.getUser() != null && username.equals(e.getUser().getUsername()))
                .orElseThrow();
        return costChangeRepo.findByEntryIdOrderByEffectiveFromYearAscEffectiveFromMonthAsc(entryId);
    }

    // ── Billing periods ────────────────────────────────────────────────────

    @Transactional
    public UserSubBillingPeriod addBillingPeriod(String username, String entryId, Map<String, Object> body) {
        UserSubscriptionEntry entry = subEntryRepo.findById(entryId)
                .filter(e -> e.getUser() != null && username.equals(e.getUser().getUsername()))
                .orElseThrow();
        return addBillingPeriodToEntry(entry, body);
    }

    private UserSubBillingPeriod addBillingPeriodToEntry(UserSubscriptionEntry entry, Map<String, Object> body) {
        UserSubBillingPeriod period = new UserSubBillingPeriod();
        period.setEntry(entry);
        if (body.get("billedAt") instanceof String ba) period.setBilledAt(ba);
        if (body.get("baseAmount")   instanceof Number n) period.setBaseAmount(new BigDecimal(n.toString()));
        if (body.get("taxesAndFees") instanceof Number n) period.setTaxesAndFees(new BigDecimal(n.toString()));
        if (body.get("shipping")     instanceof Number n) period.setShipping(new BigDecimal(n.toString()));
        if (body.get("monthsCovered")  instanceof Number mc)  period.setMonthsCovered(mc.intValue());
        if (body.get("coveredFromMonth") instanceof Number cfm) period.setCoveredFromMonth(cfm.intValue());
        if (body.get("coveredFromYear")  instanceof Number cfy) period.setCoveredFromYear(cfy.intValue());
        if (body.get("prepayOptionId") instanceof String poi) period.setPrepayOptionId(poi);
        if (body.get("notes") instanceof String n) period.setNotes(n);
        period = billingPeriodRepo.save(period);

        // Auto-create a linked PurchaseTransaction for unified spending statistics
        if (period.getAmountPaid().compareTo(BigDecimal.ZERO) > 0
                || period.getBaseAmount() != null) {
            String username = entry.getUser().getUsername();
            PurchaseTransaction tx = new PurchaseTransaction();
            tx.setUsername(username);
            tx.setType("SUBSCRIPTION");
            tx.setBasePrice(period.getBaseAmount());
            tx.setTaxesAndFees(period.getTaxesAndFees());
            tx.setShipping(period.getShipping());
            tx.setCurrency(body.get("currency") instanceof String c ? c : null);
            tx.setSource("SUBSCRIPTION");
            if (body.get("billedAt") instanceof String ba && !ba.isBlank())
                try { tx.setPurchaseDate(Instant.parse(ba + "T00:00:00Z")); } catch (Exception ignored) {}
            tx.setNotes("Subscription billing period " + period.getCoveredFromMonth() + "/" + period.getCoveredFromYear());
            tx = purchaseTxRepo.save(tx);
            period.setPurchaseTransactionId(tx.getId());
            period = billingPeriodRepo.save(period);
        }
        return period;
    }

    // ── Edition tags ───────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<String> getUserTags(String username) {
        return editionTagRepo.findDistinctTagsByUsername(username);
    }

    @Transactional(readOnly = true)
    public List<UserEditionTag> getEditionTags(String username, String editionId) {
        return editionTagRepo.findByUsernameAndEditionId(username, editionId);
    }

    @Transactional
    public UserEditionTag addEditionTag(String username, String editionId, String tag) {
        if (editionTagRepo.existsByUsernameAndEditionIdAndTag(username, editionId, tag))
            return editionTagRepo.findByUsernameAndEditionId(username, editionId)
                    .stream().filter(t -> tag.equals(t.getTag())).findFirst().orElseThrow();
        UserEditionTag t = new UserEditionTag();
        t.setUsername(username);
        t.setEditionId(editionId);
        t.setTag(tag);
        return editionTagRepo.save(t);
    }

    @Transactional
    public boolean removeEditionTag(String username, String tagId) {
        return editionTagRepo.findById(tagId)
                .filter(t -> username.equals(t.getUsername()))
                .map(t -> { editionTagRepo.delete(t); return true; })
                .orElse(false);
    }

    @Transactional(readOnly = true)
    public List<UserSubBillingPeriod> getBillingPeriods(String username, String entryId) {
        subEntryRepo.findById(entryId)
                .filter(e -> e.getUser() != null && username.equals(e.getUser().getUsername()))
                .orElseThrow();
        return billingPeriodRepo.findByEntryIdOrderByCoveredFromYearAscCoveredFromMonthAsc(entryId);
    }

    @Transactional
    public boolean deleteBillingPeriod(String username, String entryId, String periodId) {
        return billingPeriodRepo.findById(periodId)
                .filter(p -> p.getEntry() != null && entryId.equals(p.getEntry().getId())
                        && p.getEntry().getUser() != null && username.equals(p.getEntry().getUser().getUsername()))
                .map(p -> { billingPeriodRepo.delete(p); return true; })
                .orElse(false);
    }

    // ── Subscription entry tags ────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<UserSubEntryTag> getSubTags(String username, String entryId) {
        subEntryRepo.findById(entryId)
                .filter(e -> e.getUser() != null && username.equals(e.getUser().getUsername()))
                .orElseThrow();
        return subEntryTagRepo.findByUsernameAndEntryId(username, entryId);
    }

    @Transactional
    public UserSubEntryTag addSubTag(String username, String entryId, String tag) {
        subEntryRepo.findById(entryId)
                .filter(e -> e.getUser() != null && username.equals(e.getUser().getUsername()))
                .orElseThrow();
        if (subEntryTagRepo.existsByUsernameAndEntryIdAndTag(username, entryId, tag))
            return subEntryTagRepo.findByUsernameAndEntryId(username, entryId)
                    .stream().filter(t -> tag.equals(t.getTag())).findFirst().orElseThrow();
        UserSubEntryTag t = new UserSubEntryTag();
        t.setUsername(username);
        t.setEntryId(entryId);
        t.setTag(tag);
        return subEntryTagRepo.save(t);
    }

    @Transactional
    public boolean removeSubTag(String username, String tagId) {
        return subEntryTagRepo.findById(tagId)
                .filter(t -> username.equals(t.getUsername()))
                .map(t -> { subEntryTagRepo.delete(t); return true; })
                .orElse(false);
    }
}

