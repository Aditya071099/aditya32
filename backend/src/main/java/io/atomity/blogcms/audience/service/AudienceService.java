package io.atomity.blogcms.audience.service;

import io.atomity.blogcms.audience.dto.AudienceRequest;
import io.atomity.blogcms.audience.dto.AudienceResponse;
import io.atomity.blogcms.audience.entity.Audience;
import io.atomity.blogcms.audience.repository.AudienceRepository;
import io.atomity.blogcms.shared.ApiException;
import io.atomity.blogcms.shared.Slugs;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class AudienceService {
    private final AudienceRepository audienceRepository;

    public AudienceService(AudienceRepository audienceRepository) {
        this.audienceRepository = audienceRepository;
    }

    @Transactional
    public AudienceResponse create(AudienceRequest request) {
        Audience audience = audienceRepository.save(Audience.create(request.name(), resolveSlug(request, null)));
        return AudienceResponse.of(audience, 0);
    }

    @Transactional(readOnly = true)
    public List<AudienceResponse> list() {
        Map<UUID, Long> counts = audienceRepository.countPostsPerAudience().stream()
                .collect(Collectors.toMap(AudienceRepository.PostCount::getAudienceId, AudienceRepository.PostCount::getPostCount));
        return audienceRepository.findAllByOrderByNameAsc().stream()
                .map(audience -> AudienceResponse.of(audience, counts.getOrDefault(audience.getId(), 0L)))
                .toList();
    }

    @Transactional
    public AudienceResponse update(UUID id, AudienceRequest request) {
        Audience audience = audienceRepository.findById(id).orElseThrow(() -> ApiException.notFound("Audience"));
        audience.rename(request.name(), resolveSlug(request, id));
        return AudienceResponse.of(audience, audienceRepository.countPosts(id));
    }

    /** post_audiences rows go with it (ON DELETE CASCADE); the posts stay. */
    @Transactional
    public void delete(UUID id) {
        Audience audience = audienceRepository.findById(id).orElseThrow(() -> ApiException.notFound("Audience"));
        audienceRepository.delete(audience);
    }

    private String resolveSlug(AudienceRequest request, UUID selfId) {
        String slug = request.slug() == null || request.slug().isBlank() ? Slugs.slugify(request.name()) : request.slug();
        if (slug.isEmpty()) {
            throw ApiException.badRequest("VALIDATION_ERROR", "slug could not be derived from the name; enter one");
        }
        boolean taken = selfId == null ? audienceRepository.existsBySlug(slug) : audienceRepository.existsBySlugAndIdNot(slug, selfId);
        if (taken) {
            throw ApiException.conflict("SLUG_TAKEN", "An audience with the slug \"" + slug + "\" already exists");
        }
        return slug;
    }
}
