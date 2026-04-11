package com.luxgrimoire.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

@Service
public class FileStorageService {

    private final String uploadDir;

    public FileStorageService(@Value("${app.upload.dir:uploads}") String uploadDir) {
        this.uploadDir = uploadDir;
    }

    public String storeBookImage(MultipartFile file) throws IOException {
        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "image";
        String ext = originalName.contains(".") ? originalName.substring(originalName.lastIndexOf('.')) : ".jpg";
        String filename = UUID.randomUUID() + ext;

        Path dir = Paths.get(uploadDir, "books");
        Files.createDirectories(dir);
        Path dest = dir.resolve(filename);
        Files.copy(file.getInputStream(), dest, StandardCopyOption.REPLACE_EXISTING);

        return "/uploads/books/" + filename;
    }

    public String storeAvatar(String username, MultipartFile file) throws IOException {
        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "avatar";
        String ext = originalName.contains(".") ? originalName.substring(originalName.lastIndexOf('.')) : ".jpg";
        String filename = username + "_" + UUID.randomUUID().toString().substring(0, 8) + ext;

        Path dir = Paths.get(uploadDir, "avatars");
        Files.createDirectories(dir);
        Path dest = dir.resolve(filename);
        Files.copy(file.getInputStream(), dest, StandardCopyOption.REPLACE_EXISTING);

        return "/uploads/avatars/" + filename;
    }

    public void deleteIfExists(String avatarUrl) {
        if (avatarUrl == null || avatarUrl.isBlank()) return;
        try {
            Path oldFile = Paths.get(uploadDir + avatarUrl.replace("/uploads", ""));
            Files.deleteIfExists(oldFile);
        } catch (Exception ignored) {}
    }
}
