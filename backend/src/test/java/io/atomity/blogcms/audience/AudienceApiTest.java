package io.atomity.blogcms.audience;

import com.fasterxml.jackson.databind.JsonNode;
import io.atomity.blogcms.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AudienceApiTest extends IntegrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private String createAudience(String name) throws Exception {
        return data(call(post("/api/v1/audiences"), Map.of("name", name))
                .andExpect(status().isCreated())).path("id").asText();
    }

    private Map<String, Object> body(List<String> primary, List<String> secondary) {
        var body = new HashMap<String, Object>();
        body.put("title", "Audience targeting");
        body.put("content", Map.of("type", "doc", "content", List.of(Map.of("type", "paragraph",
                "content", List.of(Map.of("type", "text", "text", "A useful article"))))));
        body.put("primaryAudienceIds", primary);
        body.put("secondaryAudienceIds", secondary);
        return body;
    }

    @Test
    void managesReusableAudienceLabels() throws Exception {
        String audience = createAudience("  Technology leaders  ");
        createAudience("Business teams");
        call(get("/api/v1/audiences"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].name").value("Business teams"))
                .andExpect(jsonPath("$.data[1].name").value("Technology leaders"))
                .andExpect(jsonPath("$.data[1].slug").value("technology-leaders"))
                .andExpect(jsonPath("$.data[1].postCount").value(0));
        call(put("/api/v1/audiences/" + audience), Map.of("name", "Engineering teams", "slug", "engineering"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("Engineering teams"))
                .andExpect(jsonPath("$.data.slug").value("engineering"));
        call(delete("/api/v1/audiences/" + audience)).andExpect(status().isNoContent());
        call(delete("/api/v1/audiences/" + audience)).andExpect(status().isNotFound());
        call(put("/api/v1/audiences/" + audience), Map.of("name", "Missing"))
                .andExpect(status().isNotFound());
    }

    @Test
    void validatesAudienceNamesAndSlugs() throws Exception {
        for (Map<String, String> invalid : List.of(Map.of("name", " "), Map.of("name", "x".repeat(101)),
                Map.of("name", "Teams\0Name"),
                Map.of("name", "Teams", "slug", "Bad Slug"), Map.of("name", "Teams", "slug", "x".repeat(121)))) {
            call(post("/api/v1/audiences"), invalid).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors[0].errorCode").value("VALIDATION_ERROR"));
        }
        createAudience("Teams");
        call(post("/api/v1/audiences"), Map.of("name", "Other", "slug", "teams"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.errors[0].errorCode").value("SLUG_TAKEN"));
        String other = createAudience("Other");
        call(put("/api/v1/audiences/" + other), Map.of("name", "Other", "slug", "teams"))
                .andExpect(status().isConflict());
    }

    @Test
    void audienceEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/audiences")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/audiences")).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/v1/audiences/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/v1/audiences/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
    }

    @Test
    void assignmentsRoundTripThroughAdminAndPublicReadsAndDuplicate() throws Exception {
        String leaders = createAudience("Technology leaders");
        String teams = createAudience("Engineering teams");
        var request = body(List.of(leaders), List.of(teams));
        JsonNode created = data(call(post("/api/v1/posts"), request).andExpect(status().isCreated()));
        String id = created.path("id").asText();
        assertThat(created.at("/primaryAudiences/0/id").asText()).isEqualTo(leaders);
        assertThat(created.at("/secondaryAudiences/0/id").asText()).isEqualTo(teams);
        call(get("/api/v1/posts/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.primaryAudiences[0].slug").value("technology-leaders"));
        call(get("/api/v1/posts")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].secondaryAudiences[0].id").value(teams));
        // Existing visibility rules still apply to posts with audiences.
        mockMvc.perform(get("/api/v1/blogs/" + id)).andExpect(status().isNotFound());
        call(post("/api/v1/posts/" + id + "/publish")).andExpect(status().isOk());
        for (String url : List.of("/api/v1/blogs/" + id, "/api/v1/blogs/slug/audience-targeting")) {
            mockMvc.perform(get(url)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.primaryAudiences[0].id").value(leaders))
                    .andExpect(jsonPath("$.data.secondaryAudiences[0].id").value(teams));
        }
        mockMvc.perform(get("/api/v1/blogs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].primaryAudiences[0].id").value(leaders));
        JsonNode copy = data(call(post("/api/v1/posts/" + id + "/duplicate")).andExpect(status().isCreated()));
        assertThat(copy.path("primaryAudiences")).isEqualTo(created.path("primaryAudiences"));
        assertThat(copy.path("secondaryAudiences")).isEqualTo(created.path("secondaryAudiences"));
        call(get("/api/v1/posts/" + copy.path("id").asText())).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.secondaryAudiences[0].id").value(teams));
        call(get("/api/v1/audiences")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].postCount").value(2))
                .andExpect(jsonPath("$.data[1].postCount").value(2));
    }

    @Test
    void canMoveBetweenGroupsAndClearAssignmentsWithOptimisticLocking() throws Exception {
        String audience = createAudience("Teams");
        var request = body(List.of(audience), List.of());
        JsonNode created = data(call(post("/api/v1/posts"), request).andExpect(status().isCreated()));
        String url = "/api/v1/posts/" + created.path("id").asText();
        request.put("primaryAudienceIds", List.of());
        request.put("secondaryAudienceIds", List.of(audience));
        request.put("version", created.path("version").asLong());
        JsonNode moved = data(call(put(url), request).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.primaryAudiences").isEmpty())
                .andExpect(jsonPath("$.data.secondaryAudiences[0].id").value(audience)));
        call(put(url), request).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].errorCode").value("VERSION_CONFLICT"));
        request.put("version", moved.path("version").asLong());
        request.put("secondaryAudienceIds", List.of());
        call(put(url), request).andExpect(status().isOk());
        call(get(url)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.primaryAudiences").isEmpty())
                .andExpect(jsonPath("$.data.secondaryAudiences").isEmpty());
    }

    @Test
    void invalidAssignmentsAreRejectedWithoutChangingThePost() throws Exception {
        String audience = createAudience("Teams");
        for (var invalid : List.of(body(List.of(audience, audience), List.of()),
                body(List.of(), List.of(audience, audience)), body(List.of(audience), List.of(audience)))) {
            call(post("/api/v1/posts"), invalid).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors[0].errorCode").value("VALIDATION_ERROR"));
        }
        for (String field : List.of("primaryAudienceIds", "secondaryAudienceIds")) {
            var request = body(List.of(), List.of());
            request.put(field, List.of(UUID.randomUUID().toString()));
            call(post("/api/v1/posts"), request).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors[0].errorCode").value("UNKNOWN_REFERENCE"));
            request.put(field, java.util.Collections.nCopies(31, audience));
            call(post("/api/v1/posts"), request).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors[0].errorCode").value("VALIDATION_ERROR"));
            var nullIds = new ArrayList<String>();
            nullIds.add(null);
            request.put(field, nullIds);
            call(post("/api/v1/posts"), request).andExpect(status().isBadRequest());
        }
        JsonNode created = data(call(post("/api/v1/posts"), body(List.of(audience), List.of()))
                .andExpect(status().isCreated()));
        var invalidUpdate = body(List.of(audience), List.of(audience));
        invalidUpdate.put("version", created.path("version").asLong());
        String url = "/api/v1/posts/" + created.path("id").asText();
        call(put(url), invalidUpdate).andExpect(status().isBadRequest());
        call(get(url)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.primaryAudiences[0].id").value(audience))
                .andExpect(jsonPath("$.data.secondaryAudiences").isEmpty());
    }

    @Test
    void deletingAudienceRemovesAssignmentsButKeepsPostsAndOtherAudiences() throws Exception {
        String primary = createAudience("Leaders");
        String secondary = createAudience("Teams");
        JsonNode created = data(call(post("/api/v1/posts"), body(List.of(primary), List.of(secondary)))
                .andExpect(status().isCreated()));
        String url = "/api/v1/posts/" + created.path("id").asText();
        call(put("/api/v1/audiences/" + secondary), Map.of("name", "Business teams"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.postCount").value(1));
        call(get(url)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.secondaryAudiences[0].name").value("Business teams"));
        call(delete("/api/v1/audiences/" + primary)).andExpect(status().isNoContent());
        call(get(url)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.primaryAudiences").isEmpty())
                .andExpect(jsonPath("$.data.secondaryAudiences[0].id").value(secondary));
        call(delete(url)).andExpect(status().isNoContent());
        call(get("/api/v1/audiences")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].postCount").value(0));
    }

    @Test
    void postsWithoutAudienceFieldsRemainSupportedAndFlywayAppliesV3Automatically() throws Exception {
        var request = body(List.of(), List.of());
        request.remove("primaryAudienceIds");
        request.remove("secondaryAudienceIds");
        call(post("/api/v1/posts"), request).andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.primaryAudiences").isEmpty())
                .andExpect(jsonPath("$.data.secondaryAudiences").isEmpty());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '3' AND success", Integer.class)).isEqualTo(1);
    }
}
