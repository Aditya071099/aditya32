package io.atomity.blogcms.media;

import com.fasterxml.jackson.databind.JsonNode;
import io.atomity.blogcms.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MediaApiTest extends IntegrationTest {

    private JsonNode upload(String filename, String declaredType, byte[] bytes) throws Exception {
        var file = new MockMultipartFile("file", filename, declaredType, bytes);
        return data(call(multipart("/api/v1/media").file(file)).andExpect(status().isCreated()));
    }

    @Test
    void uploadRecordsMetadataAndServesTheFilePublicly() throws Exception {
        byte[] png = TestImages.encode("png", 300, 200);
        JsonNode media = upload("../../etc/cover.png", "image/png", png);

        assertThat(media.path("originalFilename").asText()).isEqualTo("cover.png");
        assertThat(media.path("contentType").asText()).isEqualTo("image/png");
        assertThat(media.path("width").asInt()).isEqualTo(300);
        assertThat(media.path("height").asInt()).isEqualTo(200);
        assertThat(media.path("usageCount").asInt()).isZero();

        // No token: image files are public so published pages can embed them.
        mockMvc.perform(get(media.path("url").asText()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("Content-Disposition", "inline; filename=\"cover.png\""))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().bytes(png));

        call(get("/api/v1/media")).andExpect(jsonPath("$.data.length()").value(1));
    }

    @Test
    void servesInternationalizedFilenameInContentDisposition() throws Exception {
        byte[] png = TestImages.encode("png", 10, 10);
        JsonNode media = upload("café.png", "image/png", png);
        mockMvc.perform(get(media.path("url").asText()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition",
                        "inline; filename=\"cafe.png\"; filename*=UTF-8''caf%C3%A9.png"));
    }

    @Test
    void typeComesFromTheBytesNotTheClaim() throws Exception {
        // A JPEG uploaded as "photo.png" is stored and served as a JPEG.
        JsonNode media = upload("photo.png", "image/png", TestImages.encode("jpg", 64, 48));
        assertThat(media.path("contentType").asText()).isEqualTo("image/jpeg");

        var text = new MockMultipartFile("file", "evil.png", "image/png", "not an image".getBytes());
        call(multipart("/api/v1/media").file(text))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.errors[0].errorCode").value("UNSUPPORTED_TYPE"));
    }

    @Test
    void altTextCanBeEdited() throws Exception {
        String id = upload("a.gif", "image/gif", TestImages.encode("gif", 10, 10)).path("id").asText();
        call(patch("/api/v1/media/" + id), Map.of("altText", "  A tiny square  "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.altText").value("A tiny square"));
    }

    @Test
    void altTextRejectsNulCharacters() throws Exception {
        String id = upload("a.gif", "image/gif", TestImages.encode("gif", 10, 10)).path("id").asText();
        call(patch("/api/v1/media/" + id), Map.of("altText", "A tiny\u0000square"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].errorCode").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.errors[0].message").value("altText must not contain NUL characters"));
    }

    @Test
    void libraryImageWithoutMediaIdIsStillTrackedAndCannotBeDeleted() throws Exception {
        JsonNode media = upload("inline-without-id.png", "image/png", TestImages.encode("png", 20, 20));
        String id = media.path("id").asText();

        Map<String, Object> image = Map.of("type", "image",
                "attrs", Map.of("src", media.path("url").asText()));
        Map<String, Object> body = new HashMap<>();
        body.put("title", "Has an image without mediaId");
        body.put("content", Map.of("type", "doc", "content", List.of(image)));
        String postId = data(call(post("/api/v1/posts"), body).andExpect(status().isCreated())).path("id").asText();

        call(get("/api/v1/media"))
                .andExpect(jsonPath("$.data[?(@.id == '" + id + "')].usageCount")
                        .value(org.hamcrest.Matchers.contains(1)));
        call(delete("/api/v1/media/" + id))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].errorCode").value("MEDIA_IN_USE"));

        call(delete("/api/v1/posts/" + postId)).andExpect(status().isNoContent());
        call(delete("/api/v1/media/" + id)).andExpect(status().isNoContent());
    }

    @Test
    void mismatchedLibraryImageMediaIdIsRejected() throws Exception {
        JsonNode imageA = upload("image-a.png", "image/png", TestImages.encode("png", 20, 20));
        JsonNode imageB = upload("image-b.png", "image/png", TestImages.encode("png", 20, 20));

        Map<String, Object> image = Map.of("type", "image",
                "attrs", Map.of("src", imageA.path("url").asText(), "mediaId", imageB.path("id").asText()));
        Map<String, Object> body = new HashMap<>();
        body.put("title", "Has mismatched image reference");
        body.put("content", Map.of("type", "doc", "content", List.of(image)));

        call(post("/api/v1/posts"), body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].errorCode").value("INVALID_CONTENT"));

	call(delete("/api/v1/media/" + imageA.path("id").asText())).andExpect(status().isNoContent());
	call(delete("/api/v1/media/" + imageB.path("id").asText())).andExpect(status().isNoContent());
    }

    @Test
    void nonexistentLibraryImageReferenceIsRejected() throws Exception {
        String missingId = java.util.UUID.randomUUID().toString();

        Map<String, Object> image = Map.of("type", "image",
                "attrs", Map.of("src", "/api/v1/media/" + missingId + "/file"));
        Map<String, Object> body = new HashMap<>();
        body.put("title", "References nonexistent media");
        body.put("content", Map.of("type", "doc", "content", List.of(image)));

        call(post("/api/v1/posts"), body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].errorCode").value("UNKNOWN_REFERENCE"));
    }

    @Test
    void imageInUseCannotBeDeleted() throws Exception {
        JsonNode media = upload("inline.png", "image/png", TestImages.encode("png", 20, 20));
        String id = media.path("id").asText();

        Map<String, Object> image = Map.of("type", "image",
                "attrs", Map.of("src", media.path("url").asText(), "mediaId", id));
        Map<String, Object> body = new HashMap<>();
        body.put("title", "Has an image");
        body.put("content", Map.of("type", "doc", "content", List.of(image)));
        String postId = data(call(post("/api/v1/posts"), body).andExpect(status().isCreated())).path("id").asText();

        call(get("/api/v1/media")).andExpect(jsonPath("$.data[0].usageCount").value(1));
        call(delete("/api/v1/media/" + id))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errors[0].errorCode").value("MEDIA_IN_USE"));

        // An image-only post counts as having content, so it can be published.
        call(post("/api/v1/posts/" + postId + "/publish")).andExpect(status().isOk());

        call(delete("/api/v1/posts/" + postId)).andExpect(status().isNoContent());
        call(delete("/api/v1/media/" + id)).andExpect(status().isNoContent());
        mockMvc.perform(get(media.path("url").asText())).andExpect(status().isNotFound());
    }
}
