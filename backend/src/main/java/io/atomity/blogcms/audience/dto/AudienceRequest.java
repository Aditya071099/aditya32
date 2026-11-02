package io.atomity.blogcms.audience.dto;

import io.atomity.blogcms.shared.NulCharacters;
import io.atomity.blogcms.shared.Slugs;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Create/rename body. An empty slug is derived from the name. */
public record AudienceRequest(
        @NotBlank(message = "is required")
        @Size(max = 100, message = "must be at most 100 characters")
        @Pattern(regexp = NulCharacters.NONE, message = NulCharacters.MESSAGE)
        String name,

        @Size(max = 120, message = "must be at most 120 characters")
        @Pattern(regexp = "^$|" + Slugs.PATTERN, message = Slugs.MESSAGE)
        String slug) {
}
