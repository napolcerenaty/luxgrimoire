package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;

@Entity
@Table(name = "book_box_collection", indexes = {
    @Index(name = "idx_collection_company_id", columnList = "company_id")
})
public class BookBoxCollection {

    @Id
    private String id;

    @Column(name = "company_id", nullable = false)
    private String companyId;

    @Column(nullable = false)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", insertable = false, updatable = false)
    @JsonBackReference("company-collections")
    private BookBoxCompany company;

    public BookBoxCollection() {}

    public BookBoxCollection(String id, String companyId, String name) {
        this.id        = id;
        this.companyId = companyId;
        this.name      = name;
    }

    public String getId()        { return id; }
    public void   setId(String id) { this.id = id; }

    public String getCompanyId()              { return companyId; }
    public void   setCompanyId(String companyId) { this.companyId = companyId; }

    public String getName()           { return name; }
    public void   setName(String name) { this.name = name; }
}
