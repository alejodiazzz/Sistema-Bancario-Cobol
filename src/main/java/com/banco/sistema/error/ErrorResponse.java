package com.banco.sistema.error;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(String codigo, String mensaje, Integer estadoCobol, String ruta, Instant timestamp) {
}
