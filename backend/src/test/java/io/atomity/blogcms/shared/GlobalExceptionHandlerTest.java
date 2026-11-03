package io.atomity.blogcms.shared;

import org.hibernate.exception.ConstraintViolationException;
import org.hibernate.exception.DataException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import java.util.List;

import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;

/** Database errors as Spring hands them to the handler: a DataIntegrityViolationException around Hibernate's. */
class GlobalExceptionHandlerTest {
    private static final String CORRELATION_ID = "test-correlation-id";

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @BeforeEach
    void setCorrelationId() {
        MDC.put(CorrelationFilter.MDC_CORRELATION_KEY, CORRELATION_ID);
    }

    @AfterEach
    void clearCorrelationId() {
        MDC.remove(CorrelationFilter.MDC_CORRELATION_KEY);
    }

    @Test
    void valueTooLongIsAValidationError() {
        var cause = new DataException("could not execute statement", new SQLException("value too long", "22001"));

        assertResponse(handler.handleDataIntegrity(wrap(cause)), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }

    @Test
    void foreignKeyViolationIsAConflict() {
        var cause = new ConstraintViolationException("could not execute statement",
                new SQLException("violates foreign key constraint", "23503"), "posts_cover_image_id_fkey");

        assertResponse(handler.handleDataIntegrity(wrap(cause)), HttpStatus.CONFLICT, "CONFLICT");
    }

    @Test
    void uniqueViolationOutsideTheSlugConstraintsIsAConflict() {
        var cause = new ConstraintViolationException("could not execute statement",
                new SQLException("duplicate key value", "23505"), "uq_media_storage_key");

        assertResponse(handler.handleDataIntegrity(wrap(cause)), HttpStatus.CONFLICT, "CONFLICT");
    }

    @Test
    void unmappedSqlStateStaysAnInternalError() {
        var cause = new ConstraintViolationException("could not execute statement",
                new SQLException("violates check constraint", "23514"), "ck_posts_status");

        assertResponse(handler.handleDataIntegrity(wrap(cause)), HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR");
    }

    @Test
    void unsupportedContentTypeReturns415() {

        var exception = new HttpMediaTypeNotSupportedException(MediaType.TEXT_PLAIN_VALUE);

        var response = handler.handleMediaTypeNotSupported(exception);

        assertResponse(response, HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_TYPE");
    }

    @Test
    void unacceptableResponseTypeReturns406() {
        var exception = new HttpMediaTypeNotAcceptableException(
                List.of(MediaType.APPLICATION_XML));

        var response = handler.handleMediaTypeNotAcceptable(exception);

        assertResponse(response, HttpStatus.NOT_ACCEPTABLE, "NOT_ACCEPTABLE");
    }

    private static DataIntegrityViolationException wrap(Exception cause) {
        return new DataIntegrityViolationException("could not execute statement", cause);
    }

    private static void assertResponse(ResponseEntity<ApiResponse<Object>> response, HttpStatus status, String errorCode) {
        assertThat(response.getStatusCode()).isEqualTo(status);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().errors()).singleElement().satisfies(error -> {
            assertThat(error.errorCode()).isEqualTo(errorCode);
            assertThat(error.correlationId()).isEqualTo(CORRELATION_ID);
        });
    }
}
