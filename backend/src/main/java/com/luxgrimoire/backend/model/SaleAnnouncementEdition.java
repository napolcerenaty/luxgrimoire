package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "sale_announcement_edition", indexes = {
    @Index(name = "idx_sae_sale_id", columnList = "saleId")
})
public class SaleAnnouncementEdition {

    @Id
    private String id;

    @Column(nullable = false)
    private String saleId;

    @Column(nullable = false)
    private String editionId;

    private int sortOrder = 0;

    public SaleAnnouncementEdition() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId()                      { return id; }
    public void setId(String id)               { this.id = id; }
    public String getSaleId()                  { return saleId; }
    public void setSaleId(String saleId)       { this.saleId = saleId; }
    public String getEditionId()               { return editionId; }
    public void setEditionId(String editionId) { this.editionId = editionId; }
    public int getSortOrder()                  { return sortOrder; }
    public void setSortOrder(int sortOrder)    { this.sortOrder = sortOrder; }
}
