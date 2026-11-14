package com.banco.sistema.error;

import java.time.Instant;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.support.WebExchangeBindException;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.ServerWebInputException;

@RestControllerAdvice
public class GlobalErrorHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalErrorHandler.class);

    @ExceptionHandler(NegocioException.class)
    public ResponseEntity<ErrorResponse> negocio(NegocioException e, ServerWebExchange ex) {
        return respuesta(e.codigo(), e.getMessage(), e.estadoCobol(), ex);
    }

    @ExceptionHandler(WebExchangeBindException.class)
    public ResponseEntity<ErrorResponse> validacion(WebExchangeBindException e, ServerWebExchange ex) {
        String detalle = e.getFieldErrors().stream()
                .map(f -> f.getField() + ": " + f.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return respuesta(CodigoError.VALIDACION, detalle, null, ex);
    }

    @ExceptionHandler(ServerWebInputException.class)
    public ResponseEntity<ErrorResponse> entrada(ServerWebInputException e, ServerWebExchange ex) {
        return respuesta(CodigoError.VALIDACION, "Cuerpo de la petición inválido o mal formado", null, ex);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> integridad(DataIntegrityViolationException e, ServerWebExchange ex) {
        log.warn("Violación de integridad: {}", e.getMessage());
        return respuesta(CodigoError.CLAVE_IDEMPOTENCIA_REUTILIZADA,
                "La operación ya fue registrada (clave de idempotencia duplicada)", null, ex);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> generico(Exception e, ServerWebExchange ex) {
        log.error("Error no controlado", e);
        return respuesta(CodigoError.ERROR_INTERNO, "Error interno del servidor", null, ex);
    }

    private static ResponseEntity<ErrorResponse> respuesta(CodigoError codigo, String mensaje,
                                                           Integer estadoCobol, ServerWebExchange ex) {
        ErrorResponse body = new ErrorResponse(codigo.name(), mensaje, estadoCobol,
                ex.getRequest().getPath().value(), Instant.now());
        return ResponseEntity.status(codigo.status()).body(body);
    }
}
