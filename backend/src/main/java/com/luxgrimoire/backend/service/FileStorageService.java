package com.luxgrimoire.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.UUID;

@Service
public class FileStorageService {

    private static final Logger log = LoggerFactory.getLogger(FileStorageService.class);

    private final String uploadDir;
    private final HttpClient httpClient;

    public FileStorageService(@Value("${app.upload.dir:uploads}") String uploadDir) {
        this.uploadDir  = uploadDir;
        this.httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    // ── Upload from MultipartFile ──────────────────────────────────────────────

    public String storeBookImage(MultipartFile file) throws IOException {
        String ext = extensionFromFilename(file.getOriginalFilename(), ".jpg");
        String filename = UUID.randomUUID() + ext;
        Path dir = Paths.get(uploadDir, "book-covers");
        Files.createDirectories(dir);
        Files.copy(file.getInputStream(), dir.resolve(filename), StandardCopyOption.REPLACE_EXISTING);
        return "/uploads/book-covers/" + filename;
    }

    public String storeAvatar(String username, MultipartFile file) throws IOException {
        String ext = extensionFromFilename(file.getOriginalFilename(), ".jpg");
        String filename = username + "_" + UUID.randomUUID().toString().substring(0, 8) + ext;
        Path dir = Paths.get(uploadDir, "avatars");
        Files.createDirectories(dir);
        Files.copy(file.getInputStream(), dir.resolve(filename), StandardCopyOption.REPLACE_EXISTING);
        return "/uploads/avatars/" + filename;
    }

    public String storeLogo(String folder, String entityId, MultipartFile file) throws IOException {
        String ext = extensionFromFilename(file.getOriginalFilename(), ".jpg");
        String filename = entityId + ext;
        Path dir = Paths.get(uploadDir, "logos", folder);
        Files.createDirectories(dir);
        Files.copy(file.getInputStream(), dir.resolve(filename), StandardCopyOption.REPLACE_EXISTING);
        return "/uploads/logos/" + folder + "/" + filename;
    }

    // ── Download from remote URL ───────────────────────────────────────────────

    /**
     * Downloads an image from a remote URL and stores it under:
     *   uploads/{category}/{companyId}/{uuid}.{ext}
     *
     * category examples: "monthly-themes", "sale-announcements"
     * companyId may be null — falls back to "misc"
     *
     * @return local URL path like /uploads/monthly-themes/owlcrate/abc123.jpg,
     *         or null if download fails (caller should keep original URL as fallback)
     */
    public String storeRemoteImage(String imageUrl, String category, String companyId) {
        if (imageUrl == null || imageUrl.isBlank()) return null;
        if (!imageUrl.startsWith("http"))           return null; // already local

        String folder = (companyId != null && !companyId.isBlank()) ? companyId : "misc";
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(imageUrl))
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build();

            HttpResponse<InputStream> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofInputStream());
            if (resp.statusCode() < 200 || resp.statusCode() >= 300) {
                log.warn("Remote image download got HTTP {} for {}", resp.statusCode(), imageUrl);
                return null;
            }

            String ext = extensionFromContentType(
                    resp.headers().firstValue("content-type").orElse(""),
                    imageUrl);

            String filename = UUID.randomUUID() + ext;
            Path dir  = Paths.get(uploadDir, category, folder);
            Files.createDirectories(dir);
            Path dest = dir.resolve(filename);
            try (InputStream body = resp.body()) {
                Files.copy(body, dest, StandardCopyOption.REPLACE_EXISTING);
            }

            String localPath = "/uploads/" + category + "/" + folder + "/" + filename;
            log.info("Stored remote image {} → {}", imageUrl, localPath);
            return localPath;

        } catch (Exception e) {
            log.warn("Failed to download remote image {}: {}", imageUrl, e.getMessage());
            return null;
        }
    }

    // ── Delete ─────────────────────────────────────────────────────────────────

    public void deleteIfExists(String url) {
        if (url == null || url.isBlank() || !url.startsWith("/uploads")) return;
        try {
            Path file = Paths.get(uploadDir + url.replace("/uploads", ""));
            Files.deleteIfExists(file);
        } catch (Exception ignored) {}
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private String extensionFromFilename(String name, String fallback) {
        if (name != null && name.contains(".")) return name.substring(name.lastIndexOf('.'));
        return fallback;
    }

    private String extensionFromContentType(String contentType, String fallbackUrl) {
        if (contentType.contains("png"))  return ".png";
        if (contentType.contains("gif"))  return ".gif";
        if (contentType.contains("webp")) return ".webp";
        if (contentType.contains("jpeg") || contentType.contains("jpg")) return ".jpg";
        // Try to infer from URL
        String lower = fallbackUrl.toLowerCase();
        if (lower.contains(".png"))  return ".png";
        if (lower.contains(".gif"))  return ".gif";
        if (lower.contains(".webp")) return ".webp";
        return ".jpg";
    }
}
