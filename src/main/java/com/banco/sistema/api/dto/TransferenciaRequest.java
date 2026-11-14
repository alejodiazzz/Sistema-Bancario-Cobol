package com.banco.sistema.api.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record TransferenciaRequest(
        @NotBlank String cuentaOrigen,
        @NotBlank String cuentaDestino,
        @NotNull BigDecimal monto) {
}
