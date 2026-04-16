package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.util.UUID;

/**
 * A user-defined tag attached to a specific book edition.
 * Tags are personal — they belong to the user, not the edition itself.
 */
@Entity
@Table(name = "user_edition_tag", indexes = {
    @Index(name = "idx_uet_username",           columnList = "username"),
    @Index(name = "idx_uet_username_edition_id", columnList = "username, edition_id"),
})
public class UserEditionTag {

    @Id
    private String id;

    @Column(nullable = false)
    private String username;

    @Column(name = "edition_id", nullable = false)
    private String editionId;

    @Column(nullable = false, length = 100)
    private String tag;

    public UserEditionTag() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId()        { return id; }
    public void setId(String id) { this.id = id; }

    public String getUsername()             { return username; }
    public void setUsername(String username){ this.username = username; }

    public String getEditionId()              { return editionId; }
    public void setEditionId(String editionId){ this.editionId = editionId; }

    public String getTag()         { return tag; }
    public void setTag(String tag) { this.tag = tag; }
}
