package io.atomity.blogcms.audience.dto;

import io.atomity.blogcms.audience.entity.Audience;

import java.time.Instant;
import java.util.UUID;

public record AudienceResponse(UUID id, String name, String slug, long postCount, Instant createdAt) {

    public static AudienceResponse of(Audience audience, long postCount) {
        return new AudienceResponse(audience.getId(), audience.getName(), audience.getSlug(), postCount, audience.getCreatedAt());
    }
}
