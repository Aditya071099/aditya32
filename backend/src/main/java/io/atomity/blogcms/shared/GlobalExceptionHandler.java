package io.atomity.blogcms.shared;

import org.hibernate.JDBCException;
import org.hibernate.exception.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static final String UNIQUE_VIOLATION = "23505";
    private static final String FOREIGN_KEY_VIOLATION = "23503";
    private static final String STRING_TOO_LONG = "22001";

    /** Unique slug constraints and the resource each one belongs to. */
    private static final Map<String, String> SLUG_CONSTRAINTS = Map.of(
            "uq_posts_slug", "post",
            "uq_tags_slug", "tag",
            "uq_authors_slug", "author");

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiResponse<Object>> handleApi(ApiException ex) {
        return ResponseEntity.status(ex.getStatus())
                .body(ApiResponse.error(apiError(ex.getErrorCode(), ex.getMessage())));
    }

    /** Two saves raced past the version check; the loser gets the same answer as a stale save. */
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ApiResponse<Object>> handleOptimisticLock(ObjectOptimisticLockingFailureException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.error(apiError("VERSION_CONFLICT",
                        "This item was changed somewhere else. Reload to get the latest version.")));
    }

    /**
     * The database rejected a write, usually because a concurrent request got past a
     * service's pre-check (e.g. existsBySlug) first. Known cases get the answer the
     * pre-check would have given; anything else stays a 500 so it keeps surfacing as a bug.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Object>> handleDataIntegrity(DataIntegrityViolationException ex) {
        String sqlState = sqlState(ex);
        String constraint = constraintName(ex);
        if (sqlState == null) {
            return handleUnexpected(ex);
        }
        return switch (sqlState) {
            case UNIQUE_VIOLATION -> {
                String resource = constraint == null ? null : SLUG_CONSTRAINTS.get(constraint);
                yield resource != null
                        ? mappedDataError(HttpStatus.CONFLICT, "SLUG_TAKEN",
                                "Another " + resource + " already uses this slug", sqlState, constraint)
                        : conflictingWrite(sqlState, constraint);
            }
            case FOREIGN_KEY_VIOLATION -> conflictingWrite(sqlState, constraint);
            case STRING_TOO_LONG -> mappedDataError(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "A value is longer than allowed", sqlState, constraint);
            default -> handleUnexpected(ex);
        };
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(apiError("BAD_REQUEST", "Invalid value for '" + ex.getName() + "'")));
    }

    @ExceptionHandler({MissingServletRequestParameterException.class, MissingServletRequestPartException.class})
    public ResponseEntity<ApiResponse<Object>> handleMissingParameter(Exception ex) {
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(apiError("BAD_REQUEST", ex.getMessage())));
    }

    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ApiResponse<Object>> handleBadMultipart(MultipartException ex) {
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(apiError("MALFORMED_REQUEST", "The upload could not be read")));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Object>> handleUploadTooLarge(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(ApiResponse.error(apiError("FILE_TOO_LARGE", "The file is larger than the upload limit")));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Object>> handleValidation(MethodArgumentNotValidException ex) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + " " + error.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(apiError("VALIDATION_ERROR", detail)));
    }

    /** Query parameters bound to an object (e.g. ?status=BOGUS on the posts list). */
    @ExceptionHandler(BindException.class)
    public ResponseEntity<ApiResponse<Object>> handleBind(BindException ex) {
        String detail = ex.getFieldErrors().stream()
                .map(error -> "Invalid value for '" + error.getField() + "'")
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(apiError("BAD_REQUEST", detail)));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Object>> handleUnreadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(apiError("MALFORMED_REQUEST", "Request body is missing or not valid JSON")));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Object>> handleIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(apiError("BAD_REQUEST", ex.getMessage())));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiResponse<Object>> handleIllegalState(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.error(apiError("CONFLICT", ex.getMessage())));
    }

    /**
     * Without this, an unknown path falls through to the catch-all below and
     * is reported (and logged) as a 500.
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Object>> handleNotFound(NoResourceFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error(apiError("NOT_FOUND", "No endpoint at /" + ex.getResourcePath())));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Object>> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(ApiResponse.error(apiError("METHOD_NOT_ALLOWED", ex.getMessage())));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
public ResponseEntity<ApiResponse<Object>> handleMediaTypeNotSupported(
        HttpMediaTypeNotSupportedException ex) {
    return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
            .body(ApiResponse.error(apiError(
                    "UNSUPPORTED_TYPE", "The request Content-Type is not supported")));
}

@ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
public ResponseEntity<ApiResponse<Object>> handleMediaTypeNotAcceptable(
        HttpMediaTypeNotAcceptableException ex) {
    return ResponseEntity.status(HttpStatus.NOT_ACCEPTABLE)
            .body(ApiResponse.error(apiError(
                    "NOT_ACCEPTABLE", "The requested response format is not supported")));
}

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Object>> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(apiError("INTERNAL_ERROR", "An unexpected error occurred")));
    }

    private static ResponseEntity<ApiResponse<Object>> conflictingWrite(String sqlState, String constraint) {
        return mappedDataError(HttpStatus.CONFLICT, "CONFLICT",
                "This change conflicts with one that was just saved. Reload and try again.", sqlState, constraint);
    }

    /** Logs only the SQLState and constraint name: the driver's message can contain the rejected values. */
    private static ResponseEntity<ApiResponse<Object>> mappedDataError(HttpStatus status, String code, String message,
                                                                       String sqlState, String constraint) {
        log.warn("Database rejected the write (SQLState {}, constraint {}); answered {} {}",
                sqlState, constraint, status.value(), code);
        return ResponseEntity.status(status).body(ApiResponse.error(apiError(code, message)));
    }

    /**
     * Hibernate wraps the driver error in a JDBCException: ConstraintViolationException for
     * 23xxx, DataException for 22001. Fall back to a bare SQLException in the chain.
     */
    private static String sqlState(Throwable ex) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof JDBCException jdbc && jdbc.getSQLState() != null) {
                return jdbc.getSQLState();
            }
            if (cause instanceof SQLException sql && sql.getSQLState() != null) {
                return sql.getSQLState();
            }
        }
        return null;
    }

    private static String constraintName(Throwable ex) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation) {
                return violation.getConstraintName();
            }
        }
        return null;
    }

    private static ApiError apiError(String code, String message) {
        return new ApiError(code, message, MDC.get(CorrelationFilter.MDC_CORRELATION_KEY));
    }
}
