package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.repository.*;
import com.luxgrimoire.backend.util.AppConstants;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

@RestController
public class SaleAnnouncementController {

    private final SaleAnnouncementRepository         saleRepo;
    private final SaleAnnouncementEditionRepository  saleEditionRepo;
    private final UserSaleInterestRepository         interestRepo;
    private final BookEditionRepository              bookEditionRepo;
    private final UserBookEntryRepository            userBookEntryRepo;
    private final PurchaseTransactionRepository      purchaseTxRepo;
    private final AppUserRepository                  userRepo;
    private final BookBoxCompanyRepository           companyRepo;

    public SaleAnnouncementController(SaleAnnouncementRepository saleRepo,
                                      SaleAnnouncementEditionRepository saleEditionRepo,
                                      UserSaleInterestRepository interestRepo,
                                      BookEditionRepository bookEditionRepo,
                                      UserBookEntryRepository userBookEntryRepo,
                                      PurchaseTransactionRepository purchaseTxRepo,
                                      AppUserRepository userRepo,
                                      BookBoxCompanyRepository companyRepo) {
        this.saleRepo          = saleRepo;
        this.saleEditionRepo   = saleEditionRepo;
        this.interestRepo      = interestRepo;
        this.bookEditionRepo   = bookEditionRepo;
        this.userBookEntryRepo = userBookEntryRepo;
        this.purchaseTxRepo    = purchaseTxRepo;
        this.userRepo          = userRepo;
        this.companyRepo       = companyRepo;
    }

    // ─── Admin / manager endpoints ───────────────────────────────────────────

    /** company_manager can only access sales for their assigned company. */
    private boolean canAccessSale(HttpSession session, SaleAnnouncement sale) {
        if (AuthHelper.isAdmin(session)) return true;
        if (AuthHelper.isModerator(session)) return true;
        if (AuthHelper.isCompanyManager(session)) {
            String managed = AuthHelper.getManagedCompanyId(session);
            return managed != null && managed.equals(sale.getCompanyId());
        }
        // explicit MANAGE_SALES permission → all sales
        return true;
    }

    @GetMapping("/api/sales")
    public ResponseEntity<?> listSales(HttpSession session) {
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_SALES)) return ResponseEntity.status(403).build();
        List<SaleAnnouncement> all = saleRepo.findAll();
        if (AuthHelper.isCompanyManager(session)) {
            String managed = AuthHelper.getManagedCompanyId(session);
            all = all.stream().filter(s -> managed != null && managed.equals(s.getCompanyId())).toList();
        }
        return ResponseEntity.ok(all.stream().map(this::toSaleMap).toList());
    }

    @GetMapping("/api/sales/upcoming")
    public ResponseEntity<?> listUpcoming() {
        String today = LocalDate.now().toString();
        return ResponseEntity.ok(
            saleRepo.findByGeneralSaleDateGreaterThanEqualOrderByGeneralSaleDateAsc(today)
                    .stream().map(this::toSaleMap).toList());
    }

    @GetMapping("/api/sales/{id}")
    public ResponseEntity<?> getSale(@PathVariable String id, HttpSession session) {
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_SALES)) return ResponseEntity.status(403).build();
        return saleRepo.findById(id)
                .map(s -> canAccessSale(session, s)
                        ? ResponseEntity.ok((Object) toSaleMapWithEditions(s))
                        : ResponseEntity.status(403).<Object>build())
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/api/sales")
    public ResponseEntity<?> createSale(@RequestBody Map<String, Object> body, HttpSession session) {
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_SALES)) return ResponseEntity.status(403).build();
        SaleAnnouncement sale = fromBody(new SaleAnnouncement(), body);
        // company_manager: force companyId to their managed company
        if (AuthHelper.isCompanyManager(session)) {
            sale.setCompanyId(AuthHelper.getManagedCompanyId(session));
        }
        return ResponseEntity.ok(toSaleMap(saleRepo.save(sale)));
    }

    @PutMapping("/api/sales/{id}")
    public ResponseEntity<?> updateSale(@PathVariable String id,
                                        @RequestBody Map<String, Object> body, HttpSession session) {
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_SALES)) return ResponseEntity.status(403).build();
        return saleRepo.findById(id)
                .map(sale -> {
                    if (!canAccessSale(session, sale)) return ResponseEntity.status(403).<Object>build();
                    // company_manager cannot change companyId
                    if (AuthHelper.isCompanyManager(session)) body.remove("companyId");
                    return ResponseEntity.ok((Object) toSaleMap(saleRepo.save(fromBody(sale, body))));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/api/sales/{id}")
    public ResponseEntity<?> deleteSale(@PathVariable String id, HttpSession session) {
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_SALES)) return ResponseEntity.status(403).build();
        return saleRepo.findById(id)
                .map(sale -> {
                    if (!canAccessSale(session, sale)) return ResponseEntity.status(403).<Object>build();
                    saleEditionRepo.deleteBySaleId(id);
                    saleRepo.deleteById(id);
                    return ResponseEntity.ok((Object) Map.of("deleted", true));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // ─── Edition sub-resources ───────────────────────────────────────────────

    @GetMapping("/api/sales/{id}/editions")
    public ResponseEntity<?> getSaleEditions(@PathVariable String id, HttpSession session) {
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_SALES)) return ResponseEntity.status(403).build();
        Optional<SaleAnnouncement> saleOpt = saleRepo.findById(id);
        if (saleOpt.isEmpty()) return ResponseEntity.notFound().build();
        if (!canAccessSale(session, saleOpt.get())) return ResponseEntity.status(403).build();
        List<SaleAnnouncementEdition> saeList = saleEditionRepo.findBySaleIdOrderBySortOrderAsc(id);
        List<Map<String, Object>> enriched = saeList.stream().map(sae -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id",        sae.getId());
            item.put("saleId",    sae.getSaleId());
            item.put("editionId", sae.getEditionId());
            item.put("sortOrder", sae.getSortOrder());
            bookEditionRepo.findByIdWithBook(sae.getEditionId()).ifPresentOrElse(
                be -> {
                    item.put("editionName", be.getEditionName());
                    item.put("bookTitle",   be.getBook() != null ? be.getBook().getTitle() : null);
                },
                () -> {
                    item.put("editionName", null);
                    item.put("bookTitle",   null);
                });
            return item;
        }).toList();
        return ResponseEntity.ok(enriched);
    }

    @PostMapping("/api/sales/{id}/editions")
    public ResponseEntity<?> addEditionToSale(@PathVariable String id,
                                              @RequestBody Map<String, Object> body, HttpSession session) {
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_SALES)) return ResponseEntity.status(403).build();
        Optional<SaleAnnouncement> saleOpt = saleRepo.findById(id);
        if (saleOpt.isEmpty()) return ResponseEntity.notFound().build();
        if (!canAccessSale(session, saleOpt.get())) return ResponseEntity.status(403).build();
        String editionId = (String) body.get("editionId");
        if (editionId == null || editionId.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "editionId is required"));
        if (saleEditionRepo.existsBySaleIdAndEditionId(id, editionId))
            return ResponseEntity.badRequest().body(Map.of("error", "edition_already_added"));
        SaleAnnouncementEdition sae = new SaleAnnouncementEdition();
        sae.setSaleId(id);
        sae.setEditionId(editionId);
        if (body.get("sortOrder") instanceof Number n) sae.setSortOrder(n.intValue());
        return ResponseEntity.ok(saleEditionRepo.save(sae));
    }

    @DeleteMapping("/api/sales/{id}/editions/{editionId}")
    public ResponseEntity<?> removeEditionFromSale(@PathVariable String id,
                                                   @PathVariable String editionId, HttpSession session) {
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_SALES)) return ResponseEntity.status(403).build();
        Optional<SaleAnnouncement> saleOpt = saleRepo.findById(id);
        if (saleOpt.isEmpty()) return ResponseEntity.notFound().build();
        if (!canAccessSale(session, saleOpt.get())) return ResponseEntity.status(403).build();
        saleEditionRepo.findByEditionId(editionId).stream()
                .filter(e -> e.getSaleId().equals(id))
                .findFirst()
                .ifPresent(saleEditionRepo::delete);
        return ResponseEntity.ok(Map.of("removed", true));
    }

    @PutMapping("/api/sales/{id}/editions/reorder")
    public ResponseEntity<?> reorderEditions(@PathVariable String id,
                                             @RequestBody List<Map<String, Object>> items, HttpSession session) {
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_SALES)) return ResponseEntity.status(403).build();
        Optional<SaleAnnouncement> saleOpt = saleRepo.findById(id);
        if (saleOpt.isEmpty()) return ResponseEntity.notFound().build();
        if (!canAccessSale(session, saleOpt.get())) return ResponseEntity.status(403).build();
        for (Map<String, Object> item : items) {
            String editionId = (String) item.get("editionId");
            int order = item.get("sortOrder") instanceof Number n ? n.intValue() : 0;
            saleEditionRepo.findByEditionId(editionId).stream()
                    .filter(e -> e.getSaleId().equals(id))
                    .findFirst()
                    .ifPresent(e -> { e.setSortOrder(order); saleEditionRepo.save(e); });
        }
        return ResponseEntity.ok(saleEditionRepo.findBySaleIdOrderBySortOrderAsc(id));
    }

    // ─── User endpoints ──────────────────────────────────────────────────────

    @GetMapping("/api/user/sales/interests")
    public ResponseEntity<?> getUserInterests(HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(interestRepo.findByUsername(username));
    }

    @GetMapping("/api/user/sales/upcoming")
    public ResponseEntity<?> getUserUpcoming(HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) return ResponseEntity.status(401).build();
        String today = LocalDate.now().toString();
        List<SaleAnnouncement> upcoming =
                saleRepo.findByGeneralSaleDateGreaterThanEqualOrderByGeneralSaleDateAsc(today);
        return ResponseEntity.ok(upcoming.stream().map(sale -> {
            Map<String, Object> m = toSaleMap(sale);
            interestRepo.findByUsernameAndSaleId(username, sale.getId())
                    .ifPresentOrElse(
                        i -> m.put("userStatus", i.getStatus()),
                        () -> m.put("userStatus", null));
            return m;
        }).toList());
    }

    @PostMapping("/api/user/sales/{id}/interest")
    public ResponseEntity<?> setInterest(@PathVariable String id,
                                         @RequestBody Map<String, Object> body, HttpSession session) {
        String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
        if (username == null) return ResponseEntity.status(401).build();

        String status = body.get("status") instanceof String s && !s.isBlank() ? s : null;

        // Delete if null/empty
        if (status == null) {
            interestRepo.findByUsernameAndSaleId(username, id).ifPresent(interestRepo::delete);
            return ResponseEntity.ok(Map.of("deleted", true));
        }

        if ("BOUGHT".equals(status)) {
            return handleBuy(username, id);
        }

        UserSaleInterest interest = interestRepo.findByUsernameAndSaleId(username, id)
                .orElseGet(() -> {
                    UserSaleInterest i = new UserSaleInterest();
                    i.setUsername(username);
                    i.setSaleId(id);
                    return i;
                });
        interest.setStatus(status);
        return ResponseEntity.ok(interestRepo.save(interest));
    }

    // ─── Buy logic ────────────────────────────────────────────────────────────

    private ResponseEntity<?> handleBuy(String username, String saleId) {
        SaleAnnouncement sale = saleRepo.findById(saleId).orElse(null);
        if (sale == null) return ResponseEntity.notFound().build();

        List<SaleAnnouncementEdition> saleEditions =
                saleEditionRepo.findBySaleIdOrderBySortOrderAsc(saleId);

        AppUser appUser = userRepo.findById(username).orElse(null);
        if (appUser == null) return ResponseEntity.status(404).body(Map.of("error", "User not found"));

        // Create purchase transaction
        PurchaseTransaction tx = new PurchaseTransaction();
        tx.setUsername(username);
        tx.setBasePrice(sale.getBasePrice());
        tx.setCurrency(sale.getCurrency());
        tx.setPurchaseDate(Instant.now());
        tx.setType("PURCHASE");
        tx.setSource("OFFICIAL");
        purchaseTxRepo.save(tx);

        // Compute per-edition price
        int count = saleEditions.isEmpty() ? 1 : saleEditions.size();
        BigDecimal allocated = sale.getBasePrice() != null
                ? sale.getBasePrice().divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP)
                : null;

        // Create UserBookEntry for each edition
        for (SaleAnnouncementEdition sae : saleEditions) {
            String editionId = sae.getEditionId();
            String bookId = bookEditionRepo.findBookByEditionId(editionId)
                    .map(b -> b.getId())
                    .orElse(null);

            UserBookEntry entry = new UserBookEntry(bookId, editionId);
            entry.setUser(appUser);
            entry.setPurchaseTransactionId(tx.getId());
            entry.setAllocatedPrice(allocated);
            entry.setOwnershipStatus("OWNED");
            entry.setFlag("OWNED");
            entry.setPurchaseDate(Instant.now());
            userBookEntryRepo.save(entry);
        }

        // Save/update interest
        UserSaleInterest interest = interestRepo.findByUsernameAndSaleId(username, saleId)
                .orElseGet(() -> {
                    UserSaleInterest i = new UserSaleInterest();
                    i.setUsername(username);
                    i.setSaleId(saleId);
                    return i;
                });
        interest.setStatus("BOUGHT");
        interestRepo.save(interest);

        return ResponseEntity.ok(Map.of("status", "BOUGHT", "transactionId", tx.getId()));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private SaleAnnouncement fromBody(SaleAnnouncement sale, Map<String, Object> body) {
        if (body.containsKey("title"))            sale.setTitle((String) body.get("title"));
        if (body.containsKey("companyId"))        sale.setCompanyId((String) body.get("companyId"));
        // Accept both old "saleDate" key and new "generalSaleDate" for backward compat
        if (body.containsKey("generalSaleDate"))  sale.setGeneralSaleDate((String) body.get("generalSaleDate"));
        else if (body.containsKey("saleDate"))    sale.setGeneralSaleDate((String) body.get("saleDate"));
        if (body.containsKey("firstAccessDate"))  sale.setFirstAccessDate((String) body.get("firstAccessDate"));
        if (body.containsKey("earlyAccessDate"))  sale.setEarlyAccessDate((String) body.get("earlyAccessDate"));
        if (body.containsKey("saleTimezone"))     sale.setSaleTimezone((String) body.get("saleTimezone"));
        if (body.containsKey("currency"))         sale.setCurrency((String) body.get("currency"));
        if (body.containsKey("description"))      sale.setDescription((String) body.get("description"));
        if (body.containsKey("imageUrl"))         sale.setImageUrl((String) body.get("imageUrl"));
        if (body.containsKey("extraImagesJson"))  sale.setExtraImagesJson((String) body.get("extraImagesJson"));
        if (body.containsKey("basePrice") && body.get("basePrice") != null) {
            sale.setBasePrice(new BigDecimal(body.get("basePrice").toString()));
        }
        return sale;
    }

    private Map<String, Object> toSaleMap(SaleAnnouncement sale) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",          sale.getId());
        m.put("title",       sale.getTitle());
        m.put("companyId",   sale.getCompanyId());
        String companyName = sale.getCompanyId() != null
                ? companyRepo.findById(sale.getCompanyId()).map(c -> c.getName()).orElse(null)
                : null;
        m.put("companyName", companyName);
        m.put("generalSaleDate",  sale.getGeneralSaleDate());
        m.put("firstAccessDate",  sale.getFirstAccessDate());
        m.put("earlyAccessDate",  sale.getEarlyAccessDate());
        m.put("saleTimezone",     sale.getSaleTimezone());
        m.put("basePrice",   sale.getBasePrice());
        m.put("currency",    sale.getCurrency());
        m.put("description", sale.getDescription());
        m.put("imageUrl",    sale.getImageUrl());
        m.put("extraImagesJson", sale.getExtraImagesJson());
        m.put("createdAt",   sale.getCreatedAt());
        int editionCount = (int) saleEditionRepo.countBySaleId(sale.getId());
        m.put("editionCount", editionCount);
        return m;
    }

    private Map<String, Object> toSaleMapWithEditions(SaleAnnouncement sale) {
        Map<String, Object> m = toSaleMap(sale);
        List<SaleAnnouncementEdition> editions = saleEditionRepo.findBySaleIdOrderBySortOrderAsc(sale.getId());
        m.put("editions", editions);
        return m;
    }

    // ─── Public sale detail (no auth required) ────────────────────────────────

    @GetMapping("/api/sales/{id}/public")
    public ResponseEntity<?> getSalePublic(@PathVariable String id, HttpSession session) {
        return saleRepo.findById(id)
                .map(sale -> {
                    Map<String, Object> m = toSaleMap(sale);
                    List<SaleAnnouncementEdition> saleEditions =
                            saleEditionRepo.findBySaleIdOrderBySortOrderAsc(id);
                    List<Map<String, Object>> editionDetails = saleEditions.stream().map(sae -> {
                        Map<String, Object> ed = new LinkedHashMap<>();
                        ed.put("id",        sae.getId());
                        ed.put("saleId",    sae.getSaleId());
                        ed.put("editionId", sae.getEditionId());
                        ed.put("sortOrder", sae.getSortOrder());
                        bookEditionRepo.findByIdWithBook(sae.getEditionId()).ifPresentOrElse(
                            be -> {
                                ed.put("editionName", be.getEditionName());
                                ed.put("bookTitle", be.getBook() != null ? be.getBook().getTitle() : null);
                            },
                            () -> {
                                ed.put("editionName", null);
                                ed.put("bookTitle", null);
                            });
                        return ed;
                    }).toList();
                    m.put("editions", editionDetails);
                    // Include userStatus if logged in
                    String username = (String) session.getAttribute(AppConstants.SESSION_USERNAME);
                    if (username != null) {
                        interestRepo.findByUsernameAndSaleId(username, id)
                                .ifPresentOrElse(
                                    i -> m.put("userStatus", i.getStatus()),
                                    () -> m.put("userStatus", null));
                    }
                    return ResponseEntity.ok((Object) m);
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
