package io.atomity.blogcms.audience.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

import java.util.Objects;

/** A reusable audience's group on one post; owned and persisted by that post. */
@Embeddable
public class AudienceAssignment {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "audience_id", nullable = false)
    private Audience audience;

    @Enumerated(EnumType.STRING)
    @Column(name = "audience_type", nullable = false, length = 20)
    private AudienceType type;

    protected AudienceAssignment() {
    }

    public AudienceAssignment(Audience audience, AudienceType type) {
        this.audience = audience;
        this.type = type;
    }

    public Audience getAudience() { return audience; }
    public AudienceType getType() { return type; }

    @Override
    public boolean equals(Object other) {
        return this == other || other instanceof AudienceAssignment assignment
                && audience.getId().equals(assignment.audience.getId()) && type == assignment.type;
    }

    @Override
    public int hashCode() {
        return Objects.hash(audience.getId(), type);
    }
}
