package io.atomity.blogcms.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.atomity.blogcms.post.service.ContentAnalyzer;
import io.atomity.blogcms.shared.ApiException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ContentAnalyzerTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private JsonNode parse(String json) throws Exception {
        return mapper.readTree(json.replace('\'', '"'));
    }

    @Test
    void separatesBlocksSoWordsDontRunTogether() throws Exception {
        var analysis = ContentAnalyzer.analyze(parse("""
                {'type':'doc','content':[
                  {'type':'heading','attrs':{'level':2},'content':[{'type':'text','text':'Title'}]},
                  {'type':'paragraph','content':[{'type':'text','text':'one '},{'type':'text','text':'two','marks':[{'type':'bold'}]},
                                                 {'type':'hardBreak'},{'type':'text','text':'three'}]},
                  {'type':'bulletList','content':[{'type':'listItem','content':[{'type':'paragraph','content':[{'type':'text','text':'four'}]}]}]}
                ]}"""));
        assertThat(analysis.text()).isEqualTo("Title one two three four");
        assertThat(analysis.wordCount()).isEqualTo(5);
        assertThat(analysis.readingTimeMinutes()).isEqualTo(1);
    }

    @Test
    void emptyDocumentHasNoWordsAndZeroReadingTime() throws Exception {
        var analysis = ContentAnalyzer.analyze(parse("{'type':'doc','content':[{'type':'paragraph'}]}"));
        assertThat(analysis.wordCount()).isZero();
        assertThat(analysis.readingTimeMinutes()).isZero();
        assertThat(analysis.isEmpty()).isTrue();
    }

    @Test
    void collectsLibraryImages() throws Exception {
        UUID id = UUID.randomUUID();
        var analysis = ContentAnalyzer.analyze(parse(
                "{'type':'doc','content':[{'type':'image','attrs':{'src':'/api/v1/media/" + id + "/file','mediaId':'" + id + "'}},"
                        + "{'type':'image','attrs':{'src':'https://example.com/a.png'}}]}"));
        assertThat(analysis.imageIds()).containsExactly(id);
        assertThat(analysis.isEmpty()).isFalse();
    }

    @Test
    void derivesLibraryImageIdWhenMediaIdIsMissing() throws Exception {
        UUID id = UUID.randomUUID();
        var analysis = ContentAnalyzer.analyze(parse(
                "{'type':'doc','content':[{'type':'image','attrs':{'src':'/api/v1/media/" + id + "/file'}}]}"));

        assertThat(analysis.imageIds()).containsExactly(id);
    }

    @Test
    void acceptsMatchingLibraryUrlAndMediaId() throws Exception {
        UUID id = UUID.randomUUID();
        var analysis = ContentAnalyzer.analyze(parse(
                "{'type':'doc','content':[{'type':'image','attrs':{'src':'/api/v1/media/" + id + "/file','mediaId':'" + id + "'}}]}"));

        assertThat(analysis.imageIds()).containsExactly(id);
    }

    @Test
    void rejectsMismatchedLibraryUrlAndMediaId() throws Exception {
        UUID urlId = UUID.randomUUID();
        UUID mediaId = UUID.randomUUID();

        assertThatThrownBy(() -> ContentAnalyzer.analyze(parse(
                "{'type':'doc','content':[{'type':'image','attrs':{'src':'/api/v1/media/" + urlId + "/file','mediaId':'" + mediaId + "'}}]}")))
                .isInstanceOf(ApiException.class)
                .extracting("errorCode").isEqualTo("INVALID_CONTENT");
    }

    @Test
    void tracksExplicitMediaIdForExternalImageUrl() throws Exception {
        UUID id = UUID.randomUUID();
        var analysis = ContentAnalyzer.analyze(parse(
                "{'type':'doc','content':[{'type':'image','attrs':{'src':'https://example.com/a.png','mediaId':'" + id + "'}}]}"));

        assertThat(analysis.imageIds()).containsExactly(id);
    }

    @Test
    void doesNotTrackExternalImageWithoutMediaId() throws Exception {
        var analysis = ContentAnalyzer.analyze(parse(
                "{'type':'doc','content':[{'type':'image','attrs':{'src':'https://example.com/a.png'}}]}"));

        assertThat(analysis.imageIds()).isEmpty();
    }

    @Test
    void rejectsInvalidExplicitMediaId() {
        assertThatThrownBy(() -> ContentAnalyzer.analyze(parse(
                "{'type':'doc','content':[{'type':'image','attrs':{'src':'https://example.com/a.png','mediaId':'not-a-uuid'}}]}")))
                .isInstanceOf(ApiException.class)
                .extracting("errorCode").isEqualTo("INVALID_CONTENT");
    }

    @Test
    void rejectsUnsafeUrls() {
        assertThatThrownBy(() -> ContentAnalyzer.analyze(parse(
                "{'type':'doc','content':[{'type':'image','attrs':{'src':'data:image/svg+xml;base64,AAAA'}}]}")))
                .isInstanceOf(ApiException.class).extracting("errorCode").isEqualTo("UNSAFE_IMAGE");
        assertThatThrownBy(() -> ContentAnalyzer.analyze(parse(
                "{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'x',"
                        + "'marks':[{'type':'link','attrs':{'href':' JavaScript:alert(1)'}}]}]}]}")))
                .isInstanceOf(ApiException.class).extracting("errorCode").isEqualTo("UNSAFE_LINK");
    }

    @Test
    void rejectsNonDocuments() {
        assertThatThrownBy(() -> ContentAnalyzer.analyze(parse("{'type':'paragraph'}")))
                .isInstanceOf(ApiException.class).extracting("errorCode").isEqualTo("INVALID_CONTENT");
        assertThatThrownBy(() -> ContentAnalyzer.analyze(parse("[1,2]"))).isInstanceOf(ApiException.class);
    }

    @Test
    void rejectsNulCharactersAnywhereInTheDocument() {
        // In body text, in an attribute the text walk never reads, and in a field name:
        // jsonb can't store a NUL in any of them.
        for (String json : List.of(
                "{'type':'doc','content':[{'type':'paragraph','content':[{'type':'text','text':'one\\u0000two'}]}]}",
                "{'type':'doc','content':[{'type':'image','attrs':{'src':'https://example.com/a.png','alt':'\\u0000'}}]}",
                "{'type':'doc','content':[{'type':'paragraph','attrs':{'\\u0000':'x'}}]}")) {
            assertThatThrownBy(() -> ContentAnalyzer.analyze(parse(json)))
                    .isInstanceOf(ApiException.class)
                    .hasMessage("The post body must not contain NUL characters")
                    .extracting("errorCode").isEqualTo("INVALID_CONTENT");
        }
    }

    @Test
    void acceptsTheTextOfAnEscapedNul() throws Exception {
        // A writer explaining escapes types a backslash and "u0000": six ordinary characters.
        var analysis = ContentAnalyzer.analyze(parse(
                "{'type':'doc','content':[{'type':'codeBlock','content':[{'type':'text','text':'char c = \\\\u0000;'}]}]}"));
        assertThat(analysis.text()).isEqualTo("char c = \\u0000;");
        assertThat(analysis.wordCount()).isEqualTo(4);
    }
}
