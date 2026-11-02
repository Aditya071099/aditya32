package io.atomity.blogcms.audience.repository;

import io.atomity.blogcms.audience.entity.Audience;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface AudienceRepository extends JpaRepository<Audience, UUID> {

    List<Audience> findAllByOrderByNameAsc();

    boolean existsBySlug(String slug);

    boolean existsBySlugAndIdNot(String slug, UUID id);

    @Query(value = "SELECT audience_id AS audienceId, COUNT(*) AS postCount FROM post_audiences GROUP BY audience_id", nativeQuery = true)
    List<PostCount> countPostsPerAudience();

    @Query(value = "SELECT COUNT(*) FROM post_audiences WHERE audience_id = :id", nativeQuery = true)
    long countPosts(@Param("id") UUID id);

    interface PostCount {
        UUID getAudienceId();
        Long getPostCount();
    }
}
