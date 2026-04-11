package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import org.hibernate.annotations.BatchSize;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "book_box_company", indexes = {
    @Index(name = "idx_company_name", columnList = "name")
})
public class BookBoxCompany {
    @Id
    private String id;
    private String name;
    private String logoUrl;
    private String websiteUrl;
    @Column(columnDefinition = "TEXT")
    private String description;
    private String location;
    private String defaultCurrency;

    @OneToMany(mappedBy = "company", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JsonManagedReference("company-subscriptions")
    @BatchSize(size = 30)
    private List<Subscription> subscriptions = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "book_box_company_manager", joinColumns = @JoinColumn(name = "company_id"))
    @Column(name = "username")
    private List<String> managerUsernames = new ArrayList<>();

    public BookBoxCompany() {}

    public BookBoxCompany(String id, String name, String logoUrl, String websiteUrl,
                          String description, String location, String defaultCurrency,
                          List<Subscription> subscriptions, List<String> managerUsernames) {
        this.id = id;
        this.name = name;
        this.logoUrl = logoUrl;
        this.websiteUrl = websiteUrl;
        this.description = description;
        this.location = location;
        this.defaultCurrency = defaultCurrency;
        if (subscriptions != null) this.subscriptions.addAll(subscriptions);
        if (managerUsernames != null) this.managerUsernames.addAll(managerUsernames);
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getLogoUrl() { return logoUrl; }
    public void setLogoUrl(String logoUrl) { this.logoUrl = logoUrl; }
    public String getWebsiteUrl() { return websiteUrl; }
    public void setWebsiteUrl(String websiteUrl) { this.websiteUrl = websiteUrl; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public String getDefaultCurrency() { return defaultCurrency; }
    public void setDefaultCurrency(String defaultCurrency) { this.defaultCurrency = defaultCurrency; }
    public List<Subscription> getSubscriptions() { return subscriptions; }
    public void setSubscriptions(List<Subscription> subscriptions) { this.subscriptions = subscriptions != null ? subscriptions : new ArrayList<>(); }
    public List<String> getManagerUsernames() { return managerUsernames; }
    public void setManagerUsernames(List<String> managerUsernames) { this.managerUsernames = managerUsernames != null ? managerUsernames : new ArrayList<>(); }
}
