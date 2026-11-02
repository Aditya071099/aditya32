package io.atomity.blogcms.audience.entity;

import io.atomity.blogcms.shared.Timestamps;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "audiences")
public class Audience {

    @Id
    private UUID id;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "slug", nullable = false, unique = true)
    private String slug;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Audience() {
    }

    public static Audience create(String name, String slug) {
        var audience = new Audience();
        audience.id = UUID.randomUUID();
        audience.createdAt = Timestamps.now();
        audience.rename(name, slug);
        return audience;
    }

    public void rename(String name, String slug) {
        this.name = name.strip();
        this.slug = slug;
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public String getSlug() { return slug; }
    public Instant getCreatedAt() { return createdAt; }
}
