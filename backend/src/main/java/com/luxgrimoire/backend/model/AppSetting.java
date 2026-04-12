package com.luxgrimoire.backend.model;

import jakarta.persistence.*;

@Entity
@Table(name = "app_setting")
public class AppSetting {

    @Id
    private String key;

    @Column(columnDefinition = "TEXT")
    private String value;

    public AppSetting() {}

    public AppSetting(String key, String value) {
        this.key = key;
        this.value = value;
    }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
}
