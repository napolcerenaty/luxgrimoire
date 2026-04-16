package com.luxgrimoire.backend.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Spending statistics service — all data aggregated in-memory after a few
 * compact SQL queries to minimise round-trips.
 *
 * <p>All monetary values returned are converted to {@code homeCurrency}
 * via {@link CurrencyRateService}.</p>
 */
@Service
public class SpendingStatsService {

    private final JdbcTemplate jdbc;
    private final CurrencyRateService fx;

    public SpendingStatsService(JdbcTemplate jdbc, CurrencyRateService fx) {
        this.jdbc = jdbc;
        this.fx   = fx;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Public API
    // ════════════════════════════════════════════════════════════════════════

    public Map<String, Object> getStats(String username, String homeCurrency) {
        LocalDate today = LocalDate.now();
        int thisYear  = today.getYear();
        int thisMonth = today.getMonthValue();

        List<SubPeriodRow> subPeriods = loadSubPeriods(username);
        List<PurchaseRow>  purchases  = loadPurchases(username);
        BookStats          bookStats  = loadBookStats(username, homeCurrency);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("homeCurrency", homeCurrency);
        result.put("overall",         buildOverall(subPeriods, purchases, bookStats, homeCurrency, thisYear, thisMonth));
        result.put("monthly",         buildMonthly(subPeriods, purchases, homeCurrency));
        result.put("byCompany",       buildByCompany(subPeriods, homeCurrency));
        result.put("bySubscription",  buildBySubscription(subPeriods, homeCurrency));
        result.put("bySource",        buildBySource(purchases, homeCurrency));
        result.put("byYear",          buildByYear(subPeriods, purchases, homeCurrency));
        return result;
    }

    public Map<String, Object> getForecast(String username, String homeCurrency) {
        List<ActiveSubRow> activeSubs = loadActiveSubs(username);
        List<PreorderRow>  preorders  = loadPreorders(username);

        LocalDate today = LocalDate.now();
        int curYear  = today.getYear();
        int curMonth = today.getMonthValue();

        // Project next 3 months after the current month
        List<Map<String, Object>> months = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            int year  = curYear  + (curMonth + i - 1) / 12;
            int month = ((curMonth + i - 1) % 12) + 1;
            List<Map<String, Object>> subs = new ArrayList<>();
            BigDecimal subtotal = BigDecimal.ZERO;

            for (ActiveSubRow sub : activeSubs) {
                // Check if this subscription's next expected period is this projected month
                if (isNextExpected(sub, year, month)) {
                    BigDecimal amount = fx.convert(sub.lastAmount(), sub.currency(), homeCurrency);
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("companyName",       sub.companyName());
                    entry.put("subscriptionName",  sub.subscriptionName());
                    entry.put("logoUrl",           sub.logoUrl());
                    entry.put("estimatedAmount",   amount);
                    entry.put("originalAmount",    sub.lastAmount());
                    entry.put("originalCurrency",  sub.currency());
                    entry.put("renewalDay",        sub.renewalDay());
                    subs.add(entry);
                    subtotal = subtotal.add(amount);
                }
            }

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("year",  year);
            m.put("month", month);
            m.put("subscriptions", subs);
            m.put("subtotal", subtotal);
            months.add(m);
        }

        List<Map<String, Object>> preorderList = preorders.stream().map(p -> {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("bookTitle",    p.bookTitle());
            entry.put("editionName",  p.editionName());
            entry.put("allocatedPrice", fx.convert(p.allocatedPrice(), p.currency(), homeCurrency));
            entry.put("originalPrice",  p.allocatedPrice());
            entry.put("currency",       p.currency());
            return entry;
        }).collect(Collectors.toList());

        BigDecimal preorderTotal = preorderList.stream()
            .map(p -> (BigDecimal) p.get("allocatedPrice"))
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("homeCurrency", homeCurrency);
        result.put("months",       months);
        result.put("preorders",    preorderList);
        result.put("preorderTotal", preorderTotal);
        return result;
    }

    public Map<String, Object> getSaleStats(String username, String homeCurrency) {
        List<SoldBookRow> sold = loadSoldBooks(username);

        BigDecimal totalIncome   = BigDecimal.ZERO;
        BigDecimal totalCost     = BigDecimal.ZERO;
        Map<String, BigDecimal[]> byCompany = new LinkedHashMap<>(); // id → [income, cost]
        Map<String, String>       companyNames = new LinkedHashMap<>();

        List<Map<String, Object>> books = new ArrayList<>();

        for (SoldBookRow r : sold) {
            BigDecimal income = fx.convert(r.salePrice(),  r.saleCurrency(),   homeCurrency);
            BigDecimal taxes  = fx.convert(r.proportionalTaxes()    != null ? r.proportionalTaxes()    : BigDecimal.ZERO, r.boughtCurrency(), homeCurrency);
            BigDecimal ship   = fx.convert(r.proportionalShipping() != null ? r.proportionalShipping() : BigDecimal.ZERO, r.boughtCurrency(), homeCurrency);
            BigDecimal cost   = fx.convert(r.boughtPrice(), r.boughtCurrency(), homeCurrency).add(taxes).add(ship);
            BigDecimal profit = income.subtract(cost);

            totalIncome = totalIncome.add(income);
            totalCost   = totalCost.add(cost);

            if (!r.companyId().isBlank()) {
                byCompany.computeIfAbsent(r.companyId(), k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
                byCompany.get(r.companyId())[0] = byCompany.get(r.companyId())[0].add(income);
                byCompany.get(r.companyId())[1] = byCompany.get(r.companyId())[1].add(cost);
                companyNames.put(r.companyId(), r.companyName());
            }

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("bookTitle",   r.bookTitle());
            row.put("editionName", r.editionName());
            row.put("saleDate",    r.saleDate());
            row.put("saleVenue",   r.saleVenue());
            row.put("saleNotes",   r.saleNotes());
            row.put("income",      income);
            row.put("cost",        cost);
            row.put("profit",      profit);
            row.put("companyName", r.companyName());
            books.add(row);
        }

        int booksSold = sold.size();
        BigDecimal avgIncome = booksSold > 0
            ? totalIncome.divide(BigDecimal.valueOf(booksSold), 2, RoundingMode.HALF_UP)
            : BigDecimal.ZERO;
        BigDecimal totalProfit  = totalIncome.subtract(totalCost);
        BigDecimal avgProfit    = booksSold > 0
            ? totalProfit.divide(BigDecimal.valueOf(booksSold), 2, RoundingMode.HALF_UP)
            : BigDecimal.ZERO;

        // Top 5 by profit
        List<Map<String, Object>> topSales = books.stream()
            .sorted(Comparator.comparingDouble(m -> -((BigDecimal) m.get("profit")).doubleValue()))
            .limit(5)
            .collect(Collectors.toList());

        // Per-company ROI
        List<Map<String, Object>> companyROI = byCompany.entrySet().stream().map(e -> {
            BigDecimal income = e.getValue()[0];
            BigDecimal cost   = e.getValue()[1];
            BigDecimal roi = cost.compareTo(BigDecimal.ZERO) != 0
                ? income.subtract(cost).divide(cost, 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100)).setScale(1, RoundingMode.HALF_UP)
                : null;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("companyId",   e.getKey());
            row.put("companyName", companyNames.get(e.getKey()));
            row.put("totalIncome", income);
            row.put("totalCost",   cost);
            row.put("profit",      income.subtract(cost));
            row.put("roiPct",      roi);
            return row;
        }).sorted(Comparator.comparingDouble(m -> -((BigDecimal) m.get("profit")).doubleValue()))
          .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("homeCurrency", homeCurrency);
        result.put("booksSold",    booksSold);
        result.put("totalIncome",  totalIncome);
        result.put("totalCost",    totalCost);
        result.put("totalProfit",  totalProfit);
        result.put("avgIncome",    avgIncome);
        result.put("avgProfit",    avgProfit);
        result.put("topSales",     topSales);
        result.put("byCompany",    companyROI);
        result.put("soldBooks",    books);
        return result;
    }



    private static final String SUB_PERIODS_SQL = """
        SELECT bp.covered_from_year       AS year,
               bp.covered_from_month      AS month,
               COALESCE(bp.base_amount,    0) AS base_amount,
               COALESCE(bp.taxes_and_fees, 0) AS taxes_fees,
               COALESCE(bp.shipping,       0) AS shipping,
               c.default_currency         AS currency,
               c.id                       AS company_id,
               c.name                     AS company_name,
               c.logo_url                 AS logo_url,
               se.subscription_id         AS subscription_id,
               COALESCE(sub.name, se.subscription_id) AS subscription_name
        FROM user_sub_billing_period bp
        JOIN user_subscription_entry se ON bp.entry_id = se.id
        JOIN book_box_company c         ON se.company_id = c.id
        LEFT JOIN subscription sub      ON se.subscription_id = sub.id
        WHERE se.username = ?
        ORDER BY bp.covered_from_year DESC, bp.covered_from_month DESC
        """;

    private static final String PURCHASES_SQL = """
        SELECT EXTRACT(YEAR  FROM pt.purchase_date)::INT AS year,
               EXTRACT(MONTH FROM pt.purchase_date)::INT AS month,
               COALESCE(pt.base_price,     0) AS base_price,
               COALESCE(pt.taxes_and_fees, 0) AS taxes_fees,
               COALESCE(pt.shipping,       0) AS shipping,
               COALESCE(pt.currency,       'GBP') AS currency,
               pt.source
        FROM purchase_transaction pt
        WHERE pt.username = ? AND pt.type = 'PURCHASE'
        ORDER BY pt.purchase_date DESC
        """;

    private static final String ACTIVE_SUBS_SQL = """
        SELECT se.id           AS entry_id,
               se.renewal_day  AS renewal_day,
               c.name          AS company_name,
               c.logo_url      AS logo_url,
               COALESCE(c.default_currency, 'GBP') AS currency,
               COALESCE(sub.name, se.subscription_id) AS subscription_name,
               (SELECT bp2.covered_from_year  * 100 + bp2.covered_from_month
                FROM user_sub_billing_period bp2
                WHERE bp2.entry_id = se.id
                ORDER BY bp2.covered_from_year DESC, bp2.covered_from_month DESC
                LIMIT 1) AS last_period_key,
               (SELECT COALESCE(bp3.base_amount,0)
                      + COALESCE(bp3.taxes_and_fees,0)
                      + COALESCE(bp3.shipping,0)
                FROM user_sub_billing_period bp3
                WHERE bp3.entry_id = se.id
                ORDER BY bp3.covered_from_year DESC, bp3.covered_from_month DESC
                LIMIT 1) AS last_amount
        FROM user_subscription_entry se
        JOIN book_box_company c ON se.company_id = c.id
        LEFT JOIN subscription sub ON se.subscription_id = sub.id
        WHERE se.username = ? AND se.active = true
        """;

    private static final String PREORDERS_SQL = """
        SELECT COALESCE(b.title, 'Unknown') AS book_title,
               COALESCE(be.edition_name, '') AS edition_name,
               COALESCE(ube.allocated_price, 0) AS allocated_price,
               COALESCE(pt.currency, 'GBP')     AS currency
        FROM user_book_entry ube
        LEFT JOIN book b         ON ube.book_id   = b.id
        LEFT JOIN book_edition be ON ube.edition_id = be.id
        LEFT JOIN purchase_transaction pt ON ube.purchase_transaction_id = pt.id
        WHERE ube.username = ? AND ube.ownership_status = 'PREORDER'
        ORDER BY b.title
        """;

    private static final String SOLD_BOOKS_SQL = """
        SELECT COALESCE(b.title, 'Unknown')    AS book_title,
               COALESCE(be.edition_name, '')   AS edition_name,
               COALESCE(ube.allocated_price, 0) AS bought_price,
               COALESCE(pt.currency, 'GBP')    AS bought_currency,
               COALESCE(ube.sale_price, 0)     AS sale_price,
               COALESCE(ube.sale_currency, 'GBP') AS sale_currency,
               COALESCE(ube.sale_date, '')     AS sale_date,
               COALESCE(ube.sale_venue, '')    AS sale_venue,
               COALESCE(ube.sale_notes, '')    AS sale_notes,
               COALESCE(c.id, '')              AS company_id,
               COALESCE(c.name, '')            AS company_name,
               COALESCE(pt.taxes_and_fees, 0) / COALESCE(cnt.book_count, 1) AS proportional_taxes,
               COALESCE(pt.shipping, 0)        / COALESCE(cnt.book_count, 1) AS proportional_shipping
        FROM user_book_entry ube
        LEFT JOIN book b              ON ube.book_id   = b.id
        LEFT JOIN book_edition be     ON ube.edition_id = be.id
        LEFT JOIN book_box_company c  ON be.book_box_company_id = c.id
        LEFT JOIN purchase_transaction pt ON ube.purchase_transaction_id = pt.id
        LEFT JOIN (
            SELECT purchase_transaction_id, COUNT(*) AS book_count
            FROM user_book_entry
            WHERE purchase_transaction_id IS NOT NULL
            GROUP BY purchase_transaction_id
        ) cnt ON ube.purchase_transaction_id = cnt.purchase_transaction_id
        WHERE ube.username = ? AND ube.ownership_status = 'SOLD'
        ORDER BY ube.sale_date DESC NULLS LAST
        """;

    private static final String BOOK_STATS_SQL = """
        SELECT COUNT(*)                                      AS owned_count,
               COUNT(CASE WHEN reading_status = 'READ' THEN 1 END) AS read_count,
               COALESCE(SUM(CASE WHEN reading_status IN ('UNREAD','READING')
                                 THEN ube.allocated_price END), 0) AS unread_value
        FROM user_book_entry ube
        WHERE ube.username = ? AND ube.ownership_status = 'OWNED'
        """;

    // ════════════════════════════════════════════════════════════════════════
    //  Data loading
    // ════════════════════════════════════════════════════════════════════════

    private List<SubPeriodRow> loadSubPeriods(String username) {
        return jdbc.query(SUB_PERIODS_SQL, (rs, i) -> new SubPeriodRow(
            rs.getInt("year"),
            rs.getInt("month"),
            rs.getBigDecimal("base_amount"),
            rs.getBigDecimal("taxes_fees"),
            rs.getBigDecimal("shipping"),
            rs.getString("currency"),
            rs.getString("company_id"),
            rs.getString("company_name"),
            rs.getString("logo_url"),
            rs.getString("subscription_id"),
            rs.getString("subscription_name")
        ), username);
    }

    private List<PurchaseRow> loadPurchases(String username) {
        return jdbc.query(PURCHASES_SQL, (rs, i) -> new PurchaseRow(
            rs.getInt("year"),
            rs.getInt("month"),
            rs.getBigDecimal("base_price"),
            rs.getBigDecimal("taxes_fees"),
            rs.getBigDecimal("shipping"),
            rs.getString("currency"),
            rs.getString("source")
        ), username);
    }

    private List<ActiveSubRow> loadActiveSubs(String username) {
        return jdbc.query(ACTIVE_SUBS_SQL, (rs, i) -> new ActiveSubRow(
            rs.getString("entry_id"),
            rs.getObject("renewal_day", Integer.class),
            rs.getString("company_name"),
            rs.getString("logo_url"),
            rs.getString("currency"),
            rs.getString("subscription_name"),
            rs.getObject("last_period_key", Integer.class),
            rs.getBigDecimal("last_amount")
        ), username);
    }

    private BookStats loadBookStats(String username, String homeCurrency) {
        return jdbc.queryForObject(BOOK_STATS_SQL, (rs, i) -> new BookStats(
            rs.getInt("owned_count"),
            rs.getInt("read_count"),
            rs.getBigDecimal("unread_value")
        ), username);
    }

    private List<SoldBookRow> loadSoldBooks(String username) {
        return jdbc.query(SOLD_BOOKS_SQL, (rs, i) -> new SoldBookRow(
            rs.getString("book_title"),
            rs.getString("edition_name"),
            rs.getBigDecimal("bought_price"),
            rs.getString("bought_currency"),
            rs.getBigDecimal("sale_price"),
            rs.getString("sale_currency"),
            rs.getString("sale_date"),
            rs.getString("sale_venue"),
            rs.getString("sale_notes"),
            rs.getString("company_id"),
            rs.getString("company_name"),
            rs.getBigDecimal("proportional_taxes"),
            rs.getBigDecimal("proportional_shipping")
        ), username);
    }

    private List<PreorderRow> loadPreorders(String username) {
        return jdbc.query(PREORDERS_SQL, (rs, i) -> new PreorderRow(
            rs.getString("book_title"),
            rs.getString("edition_name"),
            rs.getBigDecimal("allocated_price"),
            rs.getString("currency")
        ), username);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Aggregation builders
    // ════════════════════════════════════════════════════════════════════════

    private Map<String, Object> buildOverall(
            List<SubPeriodRow> subs, List<PurchaseRow> purchases,
            BookStats bs, String hc, int thisYear, int thisMonth) {

        // Subscription totals
        BigDecimal subsAllTime  = BigDecimal.ZERO;
        BigDecimal subsThisYear = BigDecimal.ZERO;
        BigDecimal subThisMonth = BigDecimal.ZERO;
        BigDecimal subLastMonth = BigDecimal.ZERO;
        BigDecimal subBase = BigDecimal.ZERO, subTax = BigDecimal.ZERO, subShip = BigDecimal.ZERO;

        int lastYear  = thisMonth == 1 ? thisYear - 1 : thisYear;
        int lastMonth = thisMonth == 1 ? 12 : thisMonth - 1;

        for (SubPeriodRow r : subs) {
            BigDecimal total = fx.convert(r.base().add(r.taxes()).add(r.shipping()), r.currency(), hc);
            subBase = subBase.add(fx.convert(r.base(),   r.currency(), hc));
            subTax  = subTax.add( fx.convert(r.taxes(),  r.currency(), hc));
            subShip = subShip.add(fx.convert(r.shipping(),r.currency(), hc));
            subsAllTime = subsAllTime.add(total);
            if (r.year() == thisYear)                            subsThisYear = subsThisYear.add(total);
            if (r.year() == thisYear  && r.month() == thisMonth) subThisMonth = subThisMonth.add(total);
            if (r.year() == lastYear  && r.month() == lastMonth) subLastMonth = subLastMonth.add(total);
        }

        // Purchase totals
        BigDecimal ptAllTime  = BigDecimal.ZERO, ptThisYear = BigDecimal.ZERO;
        BigDecimal ptThisMonth = BigDecimal.ZERO, ptLastMonth = BigDecimal.ZERO;
        BigDecimal ptSecondHand = BigDecimal.ZERO, ptGift = BigDecimal.ZERO;
        BigDecimal ptBase = BigDecimal.ZERO, ptTax = BigDecimal.ZERO, ptShip = BigDecimal.ZERO;

        for (PurchaseRow r : purchases) {
            BigDecimal total = fx.convert(r.base().add(r.taxes()).add(r.shipping()), r.currency(), hc);
            ptBase = ptBase.add(fx.convert(r.base(),    r.currency(), hc));
            ptTax  = ptTax.add( fx.convert(r.taxes(),   r.currency(), hc));
            ptShip = ptShip.add(fx.convert(r.shipping(),r.currency(), hc));
            ptAllTime = ptAllTime.add(total);
            if (r.year() == thisYear)                             ptThisYear  = ptThisYear.add(total);
            if (r.year() == thisYear  && r.month() == thisMonth) ptThisMonth = ptThisMonth.add(total);
            if (r.year() == lastYear  && r.month() == lastMonth) ptLastMonth = ptLastMonth.add(total);
            if ("SECOND_HAND".equals(r.source())) ptSecondHand = ptSecondHand.add(total);
            if ("GIFT".equals(r.source()))         ptGift       = ptGift.add(total);
        }

        BigDecimal totalAllTime   = subsAllTime.add(ptAllTime);
        BigDecimal totalThisYear  = subsThisYear.add(ptThisYear);
        BigDecimal totalThisMonth = subThisMonth.add(ptThisMonth);
        BigDecimal totalLastMonth = subLastMonth.add(ptLastMonth);

        // Average per month (based on months with any spending)
        long monthsWithSpending = countMonthsWithData(subs, purchases);
        BigDecimal avgPerMonth = monthsWithSpending > 0
            ? totalAllTime.divide(BigDecimal.valueOf(monthsWithSpending), 2, RoundingMode.HALF_UP)
            : BigDecimal.ZERO;

        // Rolling 6-month average (last 6 months, inclusive of current)
        BigDecimal rolling6m = rollingAverage(subs, purchases, hc, thisYear, thisMonth, 6);

        // Trend: this year vs last year
        BigDecimal lastYearTotal = yearTotal(subs, purchases, hc, thisYear - 1);
        BigDecimal trendPct = lastYearTotal.compareTo(BigDecimal.ZERO) != 0
            ? totalThisYear.subtract(lastYearTotal)
                           .divide(lastYearTotal, 4, RoundingMode.HALF_UP)
                           .multiply(BigDecimal.valueOf(100))
                           .setScale(1, RoundingMode.HALF_UP)
            : null;

        Map<String, Object> o = new LinkedHashMap<>();
        o.put("totalAllTime",    totalAllTime);
        o.put("totalThisYear",   totalThisYear);
        o.put("totalThisMonth",  totalThisMonth);
        o.put("totalLastMonth",  totalLastMonth);
        o.put("subsTotal",       subsAllTime);
        o.put("purchasesTotal",  ptAllTime);
        o.put("secondHandTotal", ptSecondHand);
        o.put("giftTotal",       ptGift);
        o.put("baseTotal",       subBase.add(ptBase));
        o.put("taxesTotal",      subTax.add(ptTax));
        o.put("shippingTotal",   subShip.add(ptShip));
        o.put("avgPerMonth",     avgPerMonth);
        o.put("rolling6m",       rolling6m);
        o.put("trendVsLastYear", trendPct);
        o.put("booksOwned",      bs.booksOwned());
        o.put("booksRead",       bs.booksRead());
        o.put("unreadShelfValue", fx.convert(bs.unreadValue(), "GBP", hc));
        BigDecimal avgCostPerBook = bs.booksOwned() > 0
            ? totalAllTime.divide(BigDecimal.valueOf(bs.booksOwned()), 2, RoundingMode.HALF_UP)
            : BigDecimal.ZERO;
        o.put("avgCostPerBook",  avgCostPerBook);
        return o;
    }

    private List<Map<String, Object>> buildMonthly(
            List<SubPeriodRow> subs, List<PurchaseRow> purchases, String hc) {

        // Build a map of (year*100+month) → {subs, purchases}
        record Key(int year, int month) {}
        Map<Key, BigDecimal[]> map = new LinkedHashMap<>();

        for (SubPeriodRow r : subs) {
            Key k = new Key(r.year(), r.month());
            map.computeIfAbsent(k, x -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            map.get(k)[0] = map.get(k)[0].add(
                fx.convert(r.base().add(r.taxes()).add(r.shipping()), r.currency(), hc));
        }
        for (PurchaseRow r : purchases) {
            Key k = new Key(r.year(), r.month());
            map.computeIfAbsent(k, x -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            map.get(k)[1] = map.get(k)[1].add(
                fx.convert(r.base().add(r.taxes()).add(r.shipping()), r.currency(), hc));
        }

        // Sort descending, take last 24 months
        return map.entrySet().stream()
            .sorted(Comparator.comparingInt((Map.Entry<Key, BigDecimal[]> e)
                -> e.getKey().year() * 100 + e.getKey().month()).reversed())
            .limit(24)
            .sorted(Comparator.comparingInt(e -> e.getKey().year() * 100 + e.getKey().month()))
            .map(e -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("year",          e.getKey().year());
                row.put("month",         e.getKey().month());
                row.put("subscriptions", e.getValue()[0]);
                row.put("purchases",     e.getValue()[1]);
                row.put("total",         e.getValue()[0].add(e.getValue()[1]));
                return row;
            })
            .collect(Collectors.toList());
    }

    private List<Map<String, Object>> buildByCompany(List<SubPeriodRow> subs, String hc) {
        Map<String, BigDecimal[]> map = new LinkedHashMap<>();    // companyId → [base, taxes, ship, origTotal, count]
        Map<String, String[]> meta = new LinkedHashMap<>();       // companyId → [name, logoUrl, origCurrency]

        for (SubPeriodRow r : subs) {
            map.computeIfAbsent(r.companyId(), k -> new BigDecimal[]{
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
            BigDecimal[] v = map.get(r.companyId());
            v[0] = v[0].add(fx.convert(r.base(),    r.currency(), hc));
            v[1] = v[1].add(fx.convert(r.taxes(),   r.currency(), hc));
            v[2] = v[2].add(fx.convert(r.shipping(),r.currency(), hc));
            v[3] = v[3].add(BigDecimal.ONE);  // count
            meta.put(r.companyId(), new String[]{r.companyName(), r.logoUrl(), r.currency()});
        }

        return map.entrySet().stream()
            .map(e -> {
                BigDecimal[] v = e.getValue();
                String[] m    = meta.get(e.getKey());
                BigDecimal total = v[0].add(v[1]).add(v[2]);
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("companyId",       e.getKey());
                row.put("companyName",     m[0]);
                row.put("logoUrl",         m[1]);
                row.put("total",           total);
                row.put("baseAmount",      v[0]);
                row.put("taxes",           v[1]);
                row.put("shipping",        v[2]);
                row.put("periodCount",     v[3].intValue());
                row.put("originalCurrency", m[2]);
                return row;
            })
            .sorted(Comparator.comparing(r -> ((BigDecimal) r.get("total")).negate()))
            .collect(Collectors.toList());
    }

    private List<Map<String, Object>> buildBySubscription(List<SubPeriodRow> subs, String hc) {
        record SubKey(String subId, String companyId) {}
        Map<SubKey, BigDecimal[]> map  = new LinkedHashMap<>();
        Map<SubKey, String[]>     meta = new LinkedHashMap<>();

        for (SubPeriodRow r : subs) {
            SubKey k = new SubKey(r.subscriptionId(), r.companyId());
            map.computeIfAbsent(k, x -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            BigDecimal[] v = map.get(k);
            BigDecimal total = fx.convert(r.base().add(r.taxes()).add(r.shipping()), r.currency(), hc);
            v[0] = v[0].add(total);
            v[1] = v[1].add(BigDecimal.ONE);  // period count
            meta.put(k, new String[]{r.subscriptionName(), r.companyName(), r.currency()});
        }

        return map.entrySet().stream()
            .map(e -> {
                BigDecimal[] v = e.getValue();
                String[] m    = meta.get(e.getKey());
                int count = v[1].intValue();
                BigDecimal avg = count > 0
                    ? v[0].divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("subscriptionId",   e.getKey().subId());
                row.put("subscriptionName", m[0]);
                row.put("companyId",        e.getKey().companyId());
                row.put("companyName",      m[1]);
                row.put("total",            v[0]);
                row.put("avgPerPeriod",     avg);
                row.put("periodCount",      count);
                row.put("originalCurrency", m[2]);
                return row;
            })
            .sorted(Comparator.comparing(r -> ((BigDecimal) r.get("total")).negate()))
            .collect(Collectors.toList());
    }

    private List<Map<String, Object>> buildBySource(List<PurchaseRow> purchases, String hc) {
        Map<String, BigDecimal[]> map = new LinkedHashMap<>();

        for (PurchaseRow r : purchases) {
            String src = r.source() != null ? r.source() : "OTHER";
            map.computeIfAbsent(src, k -> new BigDecimal[]{
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
            BigDecimal[] v = map.get(src);
            v[0] = v[0].add(fx.convert(r.base(),    r.currency(), hc));
            v[1] = v[1].add(fx.convert(r.taxes(),   r.currency(), hc));
            v[2] = v[2].add(fx.convert(r.shipping(),r.currency(), hc));
            v[3] = v[3].add(BigDecimal.ONE);
        }

        return map.entrySet().stream()
            .map(e -> {
                BigDecimal[] v = e.getValue();
                BigDecimal total = v[0].add(v[1]).add(v[2]);
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("source",   e.getKey());
                row.put("total",    total);
                row.put("base",     v[0]);
                row.put("taxes",    v[1]);
                row.put("shipping", v[2]);
                row.put("count",    v[3].intValue());
                return row;
            })
            .sorted(Comparator.comparing(r -> ((BigDecimal) r.get("total")).negate()))
            .collect(Collectors.toList());
    }

    private List<Map<String, Object>> buildByYear(
            List<SubPeriodRow> subs, List<PurchaseRow> purchases, String hc) {

        Map<Integer, BigDecimal[]> map = new TreeMap<>(Comparator.reverseOrder());

        for (SubPeriodRow r : subs) {
            map.computeIfAbsent(r.year(), k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            map.get(r.year())[0] = map.get(r.year())[0].add(
                fx.convert(r.base().add(r.taxes()).add(r.shipping()), r.currency(), hc));
        }
        for (PurchaseRow r : purchases) {
            map.computeIfAbsent(r.year(), k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            map.get(r.year())[1] = map.get(r.year())[1].add(
                fx.convert(r.base().add(r.taxes()).add(r.shipping()), r.currency(), hc));
        }

        return map.entrySet().stream().map(e -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("year",          e.getKey());
            row.put("subscriptions", e.getValue()[0]);
            row.put("purchases",     e.getValue()[1]);
            row.put("total",         e.getValue()[0].add(e.getValue()[1]));
            return row;
        }).collect(Collectors.toList());
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Helper computations
    // ════════════════════════════════════════════════════════════════════════

    private long countMonthsWithData(List<SubPeriodRow> subs, List<PurchaseRow> purchases) {
        Set<Integer> keys = new HashSet<>();
        subs.forEach(r      -> keys.add(r.year()   * 100 + r.month()));
        purchases.forEach(r -> keys.add(r.year()   * 100 + r.month()));
        return keys.size();
    }

    private BigDecimal rollingAverage(
            List<SubPeriodRow> subs, List<PurchaseRow> purchases,
            String hc, int refYear, int refMonth, int months) {

        BigDecimal sum = BigDecimal.ZERO;
        Set<Integer> coveredMonths = new HashSet<>();

        for (int i = 0; i < months; i++) {
            int year  = refMonth - i <= 0 ? refYear - 1 : refYear;
            int month = ((refMonth - i - 1 + 12) % 12) + 1;
            int key   = year * 100 + month;
            coveredMonths.add(key);
        }

        for (SubPeriodRow r : subs)
            if (coveredMonths.contains(r.year() * 100 + r.month()))
                sum = sum.add(fx.convert(r.base().add(r.taxes()).add(r.shipping()), r.currency(), hc));

        for (PurchaseRow r : purchases)
            if (coveredMonths.contains(r.year() * 100 + r.month()))
                sum = sum.add(fx.convert(r.base().add(r.taxes()).add(r.shipping()), r.currency(), hc));

        return sum.divide(BigDecimal.valueOf(months), 2, RoundingMode.HALF_UP);
    }

    private BigDecimal yearTotal(
            List<SubPeriodRow> subs, List<PurchaseRow> purchases, String hc, int year) {
        BigDecimal total = BigDecimal.ZERO;
        for (SubPeriodRow r : subs)
            if (r.year() == year)
                total = total.add(fx.convert(r.base().add(r.taxes()).add(r.shipping()), r.currency(), hc));
        for (PurchaseRow r : purchases)
            if (r.year() == year)
                total = total.add(fx.convert(r.base().add(r.taxes()).add(r.shipping()), r.currency(), hc));
        return total;
    }

    /**
     * Determine if this active subscription is expected to cover the given year/month.
     * Logic: the next expected period = lastPeriodKey + 1 month.
     * We project 3 months from now, so we check all projected months.
     */
    private boolean isNextExpected(ActiveSubRow sub, int projYear, int projMonth) {
        if (sub.lastPeriodKey() == null) {
            // Never billed — assume starts this month
            return true;
        }
        int lastYear  = sub.lastPeriodKey() / 100;
        int lastMonth = sub.lastPeriodKey() % 100;

        // Compute expected year/month = last + 1 month
        int expYear  = lastMonth == 12 ? lastYear + 1 : lastYear;
        int expMonth = lastMonth == 12 ? 1 : lastMonth + 1;

        return expYear == projYear && expMonth == projMonth;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Inner data records
    // ════════════════════════════════════════════════════════════════════════

    record BookStats(int booksOwned, int booksRead, BigDecimal unreadValue) {}

    record SubPeriodRow(
        int year, int month,
        BigDecimal base, BigDecimal taxes, BigDecimal shipping,
        String currency,
        String companyId, String companyName, String logoUrl,
        String subscriptionId, String subscriptionName
    ) {}

    record PurchaseRow(
        int year, int month,
        BigDecimal base, BigDecimal taxes, BigDecimal shipping,
        String currency,
        String source
    ) {}

    record ActiveSubRow(
        String entryId,
        Integer renewalDay,
        String companyName,
        String logoUrl,
        String currency,
        String subscriptionName,
        Integer lastPeriodKey,
        BigDecimal lastAmount
    ) {}

    record PreorderRow(
        String bookTitle,
        String editionName,
        BigDecimal allocatedPrice,
        String currency
    ) {}

    record SoldBookRow(
        String bookTitle, String editionName,
        BigDecimal boughtPrice, String boughtCurrency,
        BigDecimal salePrice,   String saleCurrency,
        String saleDate, String saleVenue, String saleNotes,
        String companyId, String companyName,
        BigDecimal proportionalTaxes, BigDecimal proportionalShipping
    ) {}
}
