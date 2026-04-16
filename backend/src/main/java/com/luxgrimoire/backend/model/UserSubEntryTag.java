package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.util.UUID;

/**
 * A user-defined tag attached to a specific subscription entry.
 * Tags are personal — they belong to the user, not the subscription itself.
 */
@Entity
@Table(name = "user_sub_entry_tag", indexes = {
    @Index(name = "idx_uset_username",          columnList = "username"),
    @Index(name = "idx_uset_username_entry_id", columnList = "username, entry_id"),
})
public class UserSubEntryTag {

    @Id
    private String id;

    @Column(nullable = false)
    private String username;

    @Column(name = "entry_id", nullable = false)
    private String entryId;

    @Column(nullable = false, length = 100)
    private String tag;

    public UserSubEntryTag() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId()        { return id; }
    public void setId(String id) { this.id = id; }

    public String getUsername()              { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getEntryId()               { return entryId; }
    public void setEntryId(String entryId)   { this.entryId = entryId; }

    public String getTag()         { return tag; }
    public void setTag(String tag) { this.tag = tag; }
}
