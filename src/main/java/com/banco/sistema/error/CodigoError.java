package com.banco.sistema.error;

import org.springframework.http.HttpStatus;

/** Catálogo de errores del API (campo "codigo" de ErrorResponse). */
public enum CodigoError {
    VALIDACION(HttpStatus.BAD_REQUEST),
    MISMA_CUENTA(HttpStatus.BAD_REQUEST),
    CUENTA_NO_ENCONTRADA(HttpStatus.NOT_FOUND),
    CONFLICTO_CONCURRENCIA(HttpStatus.CONFLICT),
    CLAVE_IDEMPOTENCIA_REUTILIZADA(HttpStatus.CONFLICT),
    MONTO_INVALIDO(HttpStatus.UNPROCESSABLE_ENTITY),
    FONDOS_INSUFICIENTES(HttpStatus.UNPROCESSABLE_ENTITY),
    PARAMETRO_INVALIDO(HttpStatus.UNPROCESSABLE_ENTITY),
    TIMEOUT_COBOL(HttpStatus.GATEWAY_TIMEOUT),
    TIMEOUT_OPERACION(HttpStatus.GATEWAY_TIMEOUT),
    ERROR_INTERNO(HttpStatus.INTERNAL_SERVER_ERROR);

    private final HttpStatus status;

    CodigoError(HttpStatus status) {
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
