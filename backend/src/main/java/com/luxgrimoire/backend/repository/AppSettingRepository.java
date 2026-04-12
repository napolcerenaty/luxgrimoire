package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.AppSetting;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppSettingRepository extends JpaRepository<AppSetting, String> {}
