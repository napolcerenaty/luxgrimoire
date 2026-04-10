package com.luxgrimoire.backend.model;

import java.util.ArrayList;
import java.util.List;

public class BookBoxCompany {
    private String id;
    private String name;
    private String logoUrl;
    private String websiteUrl;
    private String description;
    private String location;
    private String defaultCurrency;
    private List<String> subscriptions;
    private List<String> managerUsernames;

    public BookBoxCompany() {
        this.subscriptions = new ArrayList<>();
        this.managerUsernames = new ArrayList<>();
    }

    public BookBoxCompany(String id, String name, String logoUrl, String websiteUrl,
                          String description, String location, String defaultCurrency,
                          List<String> subscriptions, List<String> managerUsernames) {
        this.id = id;
        this.name = name;
        this.logoUrl = logoUrl;
        this.websiteUrl = websiteUrl;
        this.description = description;
        this.location = location;
        this.defaultCurrency = defaultCurrency;
        this.subscriptions = subscriptions != null ? subscriptions : new ArrayList<>();
        this.managerUsernames = managerUsernames != null ? managerUsernames : new ArrayList<>();
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

    public List<String> getSubscriptions() { return subscriptions; }
    public void setSubscriptions(List<String> subscriptions) { this.subscriptions = subscriptions; }

    public List<String> getManagerUsernames() { return managerUsernames; }
    public void setManagerUsernames(List<String> managerUsernames) { this.managerUsernames = managerUsernames; }
}
