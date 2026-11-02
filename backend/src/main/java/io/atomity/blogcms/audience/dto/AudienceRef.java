package io.atomity.blogcms.audience.dto;

import io.atomity.blogcms.audience.entity.Audience;

import java.util.UUID;

/** An audience as embedded in a post response. */
public record AudienceRef(UUID id, String name, String slug) {

    public static AudienceRef of(Audience audience) {
        return new AudienceRef(audience.getId(), audience.getName(), audience.getSlug());
    }
}
