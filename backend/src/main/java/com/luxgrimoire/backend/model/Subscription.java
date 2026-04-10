package com.luxgrimoire.backend.model;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class Subscription {
    private String id;
    private String name;
    private String logoUrl;
    private BigDecimal basePrice;
    private boolean shipsInternationally;
    private List<String> shippingCountries;
    private String type;
    private List<String> genres;
    private boolean bookishMerch;

    public Subscription() {
        this.id = UUID.randomUUID().toString();
        this.shippingCountries = new ArrayList<>();
        this.genres = new ArrayList<>();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getLogoUrl() { return logoUrl; }
    public void setLogoUrl(String logoUrl) { this.logoUrl = logoUrl; }

    public BigDecimal getBasePrice() { return basePrice; }
    public void setBasePrice(BigDecimal basePrice) { this.basePrice = basePrice; }

    public boolean isShipsInternationally() { return shipsInternationally; }
    public void setShipsInternationally(boolean shipsInternationally) { this.shipsInternationally = shipsInternationally; }

    public List<String> getShippingCountries() { return shippingCountries; }
    public void setShippingCountries(List<String> shippingCountries) {
        this.shippingCountries = shippingCountries != null ? shippingCountries : new ArrayList<>();
    }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public List<String> getGenres() { return genres; }
    public void setGenres(List<String> genres) {
        this.genres = genres != null ? genres : new ArrayList<>();
    }

    public boolean isBookishMerch() { return bookishMerch; }
    public void setBookishMerch(boolean bookishMerch) { this.bookishMerch = bookishMerch; }
}
