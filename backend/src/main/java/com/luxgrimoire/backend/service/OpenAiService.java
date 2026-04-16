package com.luxgrimoire.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.luxgrimoire.backend.service.PageScraperService.ScrapedMonthData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class OpenAiService {

    private static final Logger log = LoggerFactory.getLogger(OpenAiService.class);
    private static final String OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

    @Value("${openai.api-key:}")
    private String apiKey;

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public OpenAiService(RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
        this.restClient   = restClientBuilder.build();
        this.objectMapper = objectMapper;
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /** Holds parsed edition description result. */
    public static class EditionParseResult {
        public List<ArtistHint> artists = new ArrayList<>();
        public List<String> features = new ArrayList<>();

        public static class ArtistHint {
            public String instagramHandle;
            public String contribution;
        }
    }

    /** Extract artists and special features from a book edition description text. */
    public EditionParseResult parseEditionDescription(String text) {
        if (!isConfigured()) return new EditionParseResult();
        try {
            String truncated = text != null && text.length() > 4000 ? text.substring(0, 4000) : text;
            String systemPrompt = "You are a data extractor for a book collector app. "
                    + "Extract structured data from exclusive book edition descriptions. "
                    + "Always respond with valid JSON only.";
            String userPrompt = "Extract from this book edition description:\n"
                    + "1. artists: for each @instagram handle mentioned, extract {\"instagramHandle\": \"@handle\", \"contribution\": \"what they did\"}. "
                    + "If the same handle appears with MULTIPLE different roles, emit a SEPARATE entry for each role.\n"
                    + "2. features: list of special edition features NOT involving a specific artist (e.g. 'Signed by author', 'Head and tail bands', 'Reversible dust jacket', 'Author letter', 'Sprayed edges' only if no artist named)\n"
                    + "Text:\n" + truncated + "\n"
                    + "Respond ONLY with JSON: {\"artists\": [{\"instagramHandle\": \"@handle\", \"contribution\": \"role\"}], \"features\": [\"feature\"]}";

            String content = callOpenAi("gpt-4o-mini", systemPrompt, userPrompt, 800);
            return parseEditionResult(content);
        } catch (Exception e) {
            log.warn("OpenAI edition description parse failed: {}", e.getMessage());
            return new EditionParseResult();
        }
    }

    /** Extract artists and special features from a screenshot image of an edition description. */
    public EditionParseResult parseEditionDescriptionFromImage(String base64Image, String mimeType) {
        if (!isConfigured()) return new EditionParseResult();
        try {
            String systemPrompt = "You are a data extractor for a book collector app. "
                    + "Extract structured data from screenshots of exclusive book edition descriptions. "
                    + "Always respond with valid JSON only.";
            String userPrompt = "Extract from this screenshot of a book edition description:\n"
                    + "1. artists: for each @instagram handle mentioned, extract {\"instagramHandle\": \"@handle\", \"contribution\": \"what they did\"}. "
                    + "If the same handle appears with MULTIPLE different roles, emit a SEPARATE entry for each role.\n"
                    + "2. features: list of special edition features NOT involving a specific artist (e.g. 'Signed by author', 'Head and tail bands', 'Reversible dust jacket', 'Author letter')\n"
                    + "Respond ONLY with JSON: {\"artists\": [{\"instagramHandle\": \"@handle\", \"contribution\": \"role\"}], \"features\": [\"feature\"]}";

            String content = callOpenAiWithImage("gpt-4o-mini", systemPrompt, base64Image, mimeType, userPrompt, 800);
            return parseEditionResult(content);
        } catch (Exception e) {
            log.warn("OpenAI edition screenshot parse failed: {}", e.getMessage());
            return new EditionParseResult();
        }
    }

    private EditionParseResult parseEditionResult(String content) throws Exception {
        EditionParseResult result = new EditionParseResult();
        if (content == null) return result;
        String json = content.trim();
        if (json.startsWith("```")) {
            json = json.replaceAll("(?s)```(?:json)?\\s*", "").replaceAll("```\\s*$", "").trim();
        }
        JsonNode node = objectMapper.readTree(json);
        JsonNode artistsNode = node.path("artists");
        if (artistsNode.isArray()) {
            for (JsonNode a : artistsNode) {
                String handle = a.path("instagramHandle").asText(null);
                String contribution = a.path("contribution").asText(null);
                if (handle != null && !handle.isBlank()) {
                    EditionParseResult.ArtistHint hint = new EditionParseResult.ArtistHint();
                    hint.instagramHandle = handle.startsWith("@") ? handle : "@" + handle;
                    hint.contribution = contribution;
                    result.artists.add(hint);
                }
            }
        }
        JsonNode featuresNode = node.path("features");
        if (featuresNode.isArray()) {
            for (JsonNode f : featuresNode) {
                String feature = f.asText(null);
                if (feature != null && !feature.isBlank()) result.features.add(feature);
            }
        }
        return result;
    }

    /** Extract structured subscription month data from raw scraped text. Returns null on failure. */
    public ScrapedMonthData extractFromText(String rawText, String sourceUrl) {
        if (!isConfigured()) return null;
        try {
            String text = rawText != null && rawText.length() > 3000 ? rawText.substring(0, 3000) : rawText;
            String systemPrompt = "You are a data extractor for a book subscription box tracking app. "
                    + "Extract structured data from Polish/English blog posts about monthly book subscription boxes. "
                    + "Always respond with valid JSON only.";
            String userPrompt = "Extract from this text: month number (1-12), year (4-digit), theme name, "
                    + "book title (if mentioned), book author (if mentioned). Text: " + text
                    + "\nRespond ONLY with JSON: {\"month\": null, \"year\": null, \"theme\": null, \"bookTitle\": null, \"bookAuthor\": null}";

            String content = callOpenAi("gpt-4o-mini", systemPrompt, userPrompt, 200);
            if (content == null) return null;

            return parseExtractedJson(content, sourceUrl);
        } catch (Exception e) {
            log.warn("OpenAI text extraction failed: {}", e.getMessage());
            return null;
        }
    }

    /** Extract structured subscription month data from a base64-encoded image. Returns null on failure. */
    public ScrapedMonthData extractFromImage(String base64Image, String mimeType) {
        if (!isConfigured()) return null;
        try {
            String systemPrompt = "You are a data extractor for a book subscription box tracking app. "
                    + "Extract structured data from screenshots about monthly book subscription boxes. "
                    + "Always respond with valid JSON only.";
            String userPrompt = "This is a screenshot from social media (Instagram/Facebook) about a monthly book subscription box. "
                    + "Extract: month number (1-12), year (4-digit), theme name, book title (if mentioned), book author (if mentioned). "
                    + "Respond ONLY with JSON: {\"month\": null, \"year\": null, \"theme\": null, \"bookTitle\": null, \"bookAuthor\": null}";

            String content = callOpenAiWithImage("gpt-4o-mini", systemPrompt, base64Image, mimeType, userPrompt, 200);
            if (content == null) return null;

            return parseExtractedJson(content, null);
        } catch (Exception e) {
            log.warn("OpenAI image extraction failed: {}", e.getMessage());
            return null;
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────────

    private String callOpenAi(String model, String systemPrompt, String userPrompt, int maxTokens) {
        Map<String, Object> body = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user",   "content", userPrompt)
                ),
                "max_tokens", maxTokens,
                "temperature", 0.0
        );
        return doPost(body);
    }

    private String callOpenAiWithImage(String model, String systemPrompt,
                                        String base64Image, String mimeType,
                                        String userPrompt, int maxTokens) {
        Map<String, Object> body = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", List.of(
                                Map.of("type", "image_url",
                                        "image_url", Map.of("url", "data:" + mimeType + ";base64," + base64Image)),
                                Map.of("type", "text", "text", userPrompt)
                        ))
                ),
                "max_tokens", maxTokens,
                "temperature", 0.0
        );
        return doPost(body);
    }

    private String doPost(Map<String, Object> body) {
        try {
            String responseBody = restClient.post()
                    .uri(OPENAI_API_URL)
                    .header("Authorization", "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);

            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode choices = root.path("choices");
            if (!choices.isArray() || choices.isEmpty()) return null;
            return choices.get(0).path("message").path("content").asText(null);
        } catch (Exception e) {
            log.warn("OpenAI API call failed: {}", e.getMessage());
            return null;
        }
    }

    private ScrapedMonthData parseExtractedJson(String content, String sourceUrl) throws Exception {
        // Strip markdown code fences if present
        String json = content.trim();
        if (json.startsWith("```")) {
            json = json.replaceAll("(?s)```(?:json)?\\s*", "").replaceAll("```\\s*$", "").trim();
        }

        JsonNode node = objectMapper.readTree(json);
        ScrapedMonthData data = new ScrapedMonthData();
        data.sourceUrl = sourceUrl;

        JsonNode monthNode = node.path("month");
        if (monthNode.isNumber()) data.month = monthNode.asInt();

        JsonNode yearNode = node.path("year");
        if (yearNode.isNumber()) data.year = yearNode.asInt();

        JsonNode themeNode = node.path("theme");
        if (themeNode.isTextual() && !themeNode.asText().isBlank()) data.theme = themeNode.asText();

        JsonNode titleNode = node.path("bookTitle");
        if (titleNode.isTextual() && !titleNode.asText().isBlank()) data.bookTitle = titleNode.asText();

        JsonNode authorNode = node.path("bookAuthor");
        if (authorNode.isTextual() && !authorNode.asText().isBlank()) data.bookAuthor = authorNode.asText();

        return data;
    }
}
