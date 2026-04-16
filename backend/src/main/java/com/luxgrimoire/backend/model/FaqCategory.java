package com.luxgrimoire.backend.model;

import com.luxgrimoire.backend.util.JsonMapConverter;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "faq_category")
public class FaqCategory {

    @Id
    private String id;

    @Column(nullable = false)
    private String title;

    @Column(name = "title_i18n", columnDefinition = "TEXT")
    @Convert(converter = JsonMapConverter.class)
    private Map<String, String> titleI18n = new HashMap<>();

    @Column(nullable = false)
    private int sortOrder = 0;

    @OneToMany(mappedBy = "category", cascade = CascadeType.ALL, orphanRemoval = true,
               fetch = FetchType.EAGER)
    @OrderBy("sortOrder ASC")
    private List<FaqItem> items = new ArrayList<>();

    public FaqCategory() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId()                           { return id; }
    public String getTitle()                        { return title; }
    public void setTitle(String v)                  { this.title = v; }
    public Map<String, String> getTitleI18n()       { return titleI18n; }
    public void setTitleI18n(Map<String, String> v) { this.titleI18n = v != null ? v : new HashMap<>(); }
    public int getSortOrder()                       { return sortOrder; }
    public void setSortOrder(int v)                 { this.sortOrder = v; }
    public List<FaqItem> getItems()                 { return items; }
}
