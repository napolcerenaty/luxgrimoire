package com.luxgrimoire.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.luxgrimoire.backend.model.OlImportLog;
import com.luxgrimoire.backend.repository.OlImportLogRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.BufferedInputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;

@Service
public class OlImportService {

    private static final Logger log = LoggerFactory.getLogger(OlImportService.class);

    private static final String OL_AUTHORS_URL =
            "https://openlibrary.org/data/ol_dump_authors_latest.txt.gz";
    private static final String OL_WORKS_URL =
            "https://openlibrary.org/data/ol_dump_works_latest.txt.gz";

    private static final int MIN_YEAR    = 1980;
    private static final int BATCH_SIZE  = 1000;

    /** Lowercase keywords — a work matches if any subject contains any keyword. */
    private static final Set<String> GENRE_KEYWORDS = Set.of(
        "fantasy", "romantasy", "dark romance",
        "science fiction", "sci-fi", "dystopian", "space opera", "cyberpunk",
        "horror",
        "mystery", "thriller", "detective", "crime fiction",
        "romance", "love stories", "romantic fiction",
        "young adult", "ya fiction"
    );

    private static final String UPSERT_AUTHOR =
            "INSERT INTO ol_author (ol_key, name, ol_modified)" +
            " VALUES (?,?,?)" +
            " ON CONFLICT (ol_key) DO UPDATE" +
            "   SET name=EXCLUDED.name, ol_modified=EXCLUDED.ol_modified";

    private static final String UPSERT_BOOK =
            "INSERT INTO ol_book (ol_key, title, series_name, series_position, first_pub_year, ol_modified)" +
            " VALUES (?,?,?,?,?,?)" +
            " ON CONFLICT (ol_key) DO UPDATE" +
            "   SET title=EXCLUDED.title, series_name=EXCLUDED.series_name," +
            "       series_position=EXCLUDED.series_position," +
            "       first_pub_year=EXCLUDED.first_pub_year," +
            "       ol_modified=EXCLUDED.ol_modified";

    private static final String UPSERT_BOOK_AUTHOR =
            "INSERT INTO ol_book_author (ol_book_key, ol_author_key)" +
            " VALUES (?,?) ON CONFLICT DO NOTHING";

    // Matches patterns like "#1", "Book 2", ", Vol. 3" at the end of a series string
    private static final Pattern SERIES_POS_PATTERN =
            Pattern.compile("[,\\s]+(?:#|Book\\s+|Vol\\.?\\s*|Part\\s+|Volume\\s+)(\\d+[\\w.]*)\\s*$",
                    Pattern.CASE_INSENSITIVE);

    private final JdbcTemplate           jdbc;
    private final OlImportLogRepository  logRepo;
    private final ObjectMapper           mapper;

    // Live status fields — read by status endpoint while running
    private final AtomicBoolean running       = new AtomicBoolean(false);
    private volatile String     currentPhase  = null;
    private volatile long       currentLines  = 0;

    public OlImportService(JdbcTemplate jdbc,
                           OlImportLogRepository logRepo,
                           ObjectMapper mapper) {
        this.jdbc    = jdbc;
        this.logRepo = logRepo;
        this.mapper  = mapper;
    }

    @PostConstruct
    public void ensureJunctionTable() {
        jdbc.execute(
            "CREATE TABLE IF NOT EXISTS ol_book_author (" +
            "  ol_book_key   TEXT NOT NULL," +
            "  ol_author_key TEXT NOT NULL," +
            "  PRIMARY KEY (ol_book_key, ol_author_key)" +
            ")"
        );
    }

    // ── Scheduling ────────────────────────────────────────────────────────────

    @Scheduled(cron = "0 0 3 1 * *")
    public void scheduledMonthlyDiff() {
        if (running.compareAndSet(false, true)) {
            try {
                doImport("diff");
            } catch (Exception e) {
                log.error("Scheduled OL import failed: {}", e.getMessage(), e);
            } finally {
                running.set(false);
            }
        }
    }

    /** Called by admin endpoint — runs on the olImportExecutor thread pool. */
    @Async("olImportExecutor")
    public void runAsync(String mode) {
        if (!running.compareAndSet(false, true)) return;
        try {
            doImport(mode);
        } catch (Exception e) {
            log.error("OL import ({}) failed: {}", mode, e.getMessage(), e);
        } finally {
            running.set(false);
            currentPhase = null;
        }
    }

    /** Returns true if the import was started (false = already running). */
    public boolean trigger(String mode) {
        if (running.get()) return false;
        runAsync(mode);
        return true;
    }

    // ── Core import ───────────────────────────────────────────────────────────

    private void doImport(String mode) throws Exception {
        Instant startTime  = Instant.now();
        Instant lastImport = "diff".equals(mode) ? getLastImportTime() : null;

        log.info("OL import started, mode={}, lastImport={}", mode, lastImport);

        String status = "ok";
        String errorMsg = null;
        long authorsInserted = 0;
        long[] workResult = {0L, 0L};

        try {
            currentPhase = "authors";
            currentLines = 0;
            authorsInserted = importAuthors(lastImport);
        } catch (java.io.IOException e) {
            log.warn("Authors stream ended early (partial download): {}", e.getMessage());
            status = "partial";
            errorMsg = "Authors partial: " + e.getMessage();
        }

        if (!"partial".equals(status) || authorsInserted > 0) {
            try {
                currentPhase = "works";
                currentLines = 0;
                workResult = importWorks(lastImport);
            } catch (java.io.IOException e) {
                log.warn("Works stream ended early (partial download): {}", e.getMessage());
                if ("ok".equals(status)) {
                    status = "partial";
                    errorMsg = "Works partial: " + e.getMessage();
                } else {
                    errorMsg += "; Works partial: " + e.getMessage();
                }
            }
        }

        int duration = (int) Duration.between(startTime, Instant.now()).getSeconds();

        OlImportLog entry = new OlImportLog();
        entry.setRunAt(Instant.now());
        entry.setMode(mode);
        entry.setBooksProcessed(workResult[0]);
        entry.setBooksInserted(workResult[1]);
        entry.setAuthorsInserted(authorsInserted);
        entry.setDurationSeconds(duration);
        entry.setStatus(status);
        entry.setErrorMessage(errorMsg);
        logRepo.save(entry);

        log.info("OL import {}. mode={} authors={} books={}/{} duration={}s",
                status, mode, authorsInserted, workResult[1], workResult[0], duration);
    }

    private Instant getLastImportTime() {
        return logRepo.findLatest()
                .map(OlImportLog::getRunAt)
                .orElse(null);
    }

    // ── Author import ─────────────────────────────────────────────────────────

    private long importAuthors(Instant lastImport) throws Exception {
        log.info("Streaming authors dump…");
        List<Object[]> batch = new ArrayList<>(BATCH_SIZE);
        long[] counts = {0L};

        try {
            processLines(OL_AUTHORS_URL, "authors", (line) -> {
                String[] parts = splitLine(line);
                if (parts == null) return;

                Instant modified = parseTimestamp(parts[3]);
                if (lastImport != null && modified != null && !modified.isAfter(lastImport)) return;

                JsonNode data = parseJson(parts[4]);
                if (data == null) return;

                String key  = parts[1];
                String name = data.path("name").asText(null);
                if (name == null || name.isBlank()) return;

                batch.add(new Object[]{ key, name, modified != null ? Timestamp.from(modified) : null });
                if (batch.size() >= BATCH_SIZE) {
                    counts[0] += flushBatch(UPSERT_AUTHOR, batch);
                }
                currentLines++;
            });
        } catch (java.io.IOException e) {
            // Flush whatever is left before rethrowing
            if (!batch.isEmpty()) {
                counts[0] += flushBatch(UPSERT_AUTHOR, batch);
            }
            log.warn("Authors stream truncated at line {}: {}", currentLines, e.getMessage());
            throw e;
        }

        if (!batch.isEmpty()) {
            counts[0] += flushBatch(UPSERT_AUTHOR, batch);
        }
        log.info("Authors upserted: {}", counts[0]);
        return counts[0];
    }

    // ── Works import ──────────────────────────────────────────────────────────

    private long[] importWorks(Instant lastImport) throws Exception {
        log.info("Streaming works dump…");
        List<Object[]> bookBatch   = new ArrayList<>(BATCH_SIZE);
        List<Object[]> authorBatch = new ArrayList<>(BATCH_SIZE);
        long[] counts = {0L, 0L}; // [processed, inserted]

        try {
            processLines(OL_WORKS_URL, "works", (line) -> {
            String[] parts = splitLine(line);
            if (parts == null) return;

            Instant modified = parseTimestamp(parts[3]);
            if (lastImport != null && modified != null && !modified.isAfter(lastImport)) return;

            JsonNode data = parseJson(parts[4]);
            if (data == null) return;

            // Title is mandatory
            String title = data.path("title").asText(null);
            if (title == null || title.isBlank()) return;

            // Year filter
            int year = data.path("first_publish_year").asInt(0);
            if (year > 0 && year < MIN_YEAR) return;

            // Language filter: absent = English; present = must contain /languages/eng
            JsonNode langs = data.get("languages");
            if (langs != null && langs.isArray() && !langs.isEmpty()) {
                boolean hasEng = false;
                for (JsonNode lang : langs) {
                    if ("/languages/eng".equals(lang.path("key").asText())) {
                        hasEng = true;
                        break;
                    }
                }
                if (!hasEng) return;
            }

            // Genre filter: at least one subject must match a known genre keyword
            JsonNode subjects = data.get("subjects");
            if (!matchesGenre(subjects)) return;

            // At least one author
            JsonNode authorsNode = data.get("authors");
            if (authorsNode == null || !authorsNode.isArray() || authorsNode.isEmpty()) return;

            String bookKey = parts[1]; // /works/OL123W

            // Series extraction
            String seriesName = null;
            String seriesPos  = null;
            JsonNode seriesNode = data.get("series");
            if (seriesNode != null && seriesNode.isArray() && !seriesNode.isEmpty()) {
                JsonNode first = seriesNode.get(0);
                if (first.isTextual()) {
                    String s = first.textValue().trim();
                    Matcher m = SERIES_POS_PATTERN.matcher(s);
                    if (m.find()) {
                        seriesPos  = m.group(1);
                        seriesName = s.substring(0, m.start()).trim().replaceAll("[,\\s]+$", "");
                    } else {
                        seriesName = s;
                    }
                } else if (first.isObject()) {
                    seriesName = first.path("name").asText(null);
                    seriesPos  = first.has("position") ? first.path("position").asText(null) : null;
                }
            }

            bookBatch.add(new Object[]{
                bookKey,
                title,
                seriesName,
                seriesPos,
                year > 0 ? year : null,
                modified != null ? Timestamp.from(modified) : null
            });
            counts[0]++;

            // Collect author links
            for (JsonNode authorEntry : authorsNode) {
                String authorKey = authorEntry.path("author").path("key").asText(null);
                if (authorKey != null && !authorKey.isBlank()) {
                    authorBatch.add(new Object[]{ bookKey, authorKey });
                }
            }

            if (bookBatch.size() >= BATCH_SIZE) {
                counts[1] += flushBatch(UPSERT_BOOK, bookBatch);
                flushBatch(UPSERT_BOOK_AUTHOR, authorBatch);
                authorBatch.clear();
            }
            currentLines++;
        });
        } catch (java.io.IOException e) {
            // Flush remaining batch before rethrowing
            if (!bookBatch.isEmpty()) {
                counts[1] += flushBatch(UPSERT_BOOK, bookBatch);
                flushBatch(UPSERT_BOOK_AUTHOR, authorBatch);
            }
            log.warn("Works stream truncated at line {}: {}", currentLines, e.getMessage());
            throw e;
        }

        if (!bookBatch.isEmpty()) {
            counts[1] += flushBatch(UPSERT_BOOK, bookBatch);
            flushBatch(UPSERT_BOOK_AUTHOR, authorBatch);
        }

        log.info("Works processed={} inserted={}", counts[0], counts[1]);
        return counts;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Returns true if the subjects array contains at least one genre keyword. */
    private boolean matchesGenre(JsonNode subjects) {
        if (subjects == null || !subjects.isArray() || subjects.isEmpty()) return false;
        for (JsonNode s : subjects) {
            if (!s.isTextual()) continue;
            String lower = s.textValue().toLowerCase();
            for (String kw : GENRE_KEYWORDS) {
                if (lower.contains(kw)) return true;
            }
        }
        return false;
    }

    @FunctionalInterface
    private interface LineProcessor {
        void process(String line) throws Exception;
    }

    private void processLines(String urlStr, String label, LineProcessor processor) throws Exception {
        URL url = URI.create(urlStr).toURL();
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestProperty("User-Agent", "LuxGrimoire/1.0 (admin@luxgrimoire.com)");
        conn.setReadTimeout(0);
        conn.setConnectTimeout(30_000);

        try (GZIPInputStream gzip = new GZIPInputStream(
                    new BufferedInputStream(conn.getInputStream(), 1 << 20));
             BufferedReader reader = new BufferedReader(
                    new InputStreamReader(gzip, StandardCharsets.UTF_8), 1 << 20)) {

            String line;
            long lineNum = 0;
            while ((line = reader.readLine()) != null) {
                processor.process(line);
                lineNum++;
                if (lineNum % 500_000 == 0) {
                    log.info("{}: {} lines processed", label, lineNum);
                }
            }
            log.info("{}: done, total {} lines", label, lineNum);
        }
    }

    private String[] splitLine(String line) {
        if (line.isBlank()) return null;
        String[] parts = line.split("\t", 5);
        if (parts.length < 5) return null;
        return parts;
    }

    private Instant parseTimestamp(String ts) {
        try {
            // OL format: "2023-04-15T10:30:00.000000"
            String normalized = ts.length() > 19 ? ts.substring(0, 19) : ts;
            return LocalDateTime.parse(normalized).toInstant(ZoneOffset.UTC);
        } catch (Exception e) {
            return null;
        }
    }

    private JsonNode parseJson(String json) {
        try {
            return mapper.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    private int flushBatch(String sql, List<Object[]> batch) {
        try {
            int[] result = jdbc.batchUpdate(sql, batch);
            int count = 0;
            for (int v : result) if (v > 0) count++;
            batch.clear();
            return count;
        } catch (Exception e) {
            log.warn("Batch flush error: {}", e.getMessage());
            batch.clear();
            return 0;
        }
    }

    // ── Status ────────────────────────────────────────────────────────────────

    public ImportStatus getStatus() {
        OlImportLog last = logRepo.findLatest().orElse(null);

        long totalBooks   = 0;
        long totalAuthors = 0;
        try {
            totalBooks   = jdbc.queryForObject("SELECT COUNT(*) FROM ol_book",   Long.class);
            totalAuthors = jdbc.queryForObject("SELECT COUNT(*) FROM ol_author", Long.class);
        } catch (Exception ignored) {}

        return new ImportStatus(
            running.get(),
            currentPhase,
            currentLines,
            last,
            totalBooks,
            totalAuthors
        );
    }

    public record ImportStatus(
        boolean running,
        String  phase,
        long    currentLines,
        OlImportLog lastRun,
        long    totalBooks,
        long    totalAuthors
    ) {}
}
