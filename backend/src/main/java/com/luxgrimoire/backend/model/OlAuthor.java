package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "ol_author")
public class OlAuthor {

    @Id
    @Column(name = "ol_key", nullable = false)
    private String olKey;

    @Column(name = "name")
    private String name;

    @Column(name = "ol_modified")
    private Instant olModified;

    /** Nullable FK linking to our Author entity once matched */
    @Column(name = "author_id")
    private String authorId;

    public OlAuthor() {}

    public String getOlKey()         { return olKey; }
    public void setOlKey(String v)   { this.olKey = v; }
    public String getName()          { return name; }
    public void setName(String v)    { this.name = v; }
    public Instant getOlModified()   { return olModified; }
    public void setOlModified(Instant v) { this.olModified = v; }
    public String getAuthorId()      { return authorId; }
    public void setAuthorId(String v){ this.authorId = v; }
}
