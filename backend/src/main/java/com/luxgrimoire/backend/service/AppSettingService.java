package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.AppSetting;
import com.luxgrimoire.backend.repository.AppSettingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AppSettingService {

    private final AppSettingRepository repo;

    public AppSettingService(AppSettingRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public String get(String key, String defaultValue) {
        return repo.findById(key).map(AppSetting::getValue).orElse(defaultValue);
    }

    @Transactional(readOnly = true)
    public int getInt(String key, int defaultValue) {
        return repo.findById(key).map(s -> {
            try { return Integer.parseInt(s.getValue()); }
            catch (NumberFormatException e) { return defaultValue; }
        }).orElse(defaultValue);
    }

    @Transactional
    public void set(String key, String value) {
        AppSetting s = repo.findById(key).orElse(new AppSetting(key, value));
        s.setValue(value);
        repo.save(s);
    }
}
