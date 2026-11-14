package com.banco.sistema.api.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CrearCuentaRequest(
        @NotBlank @Size(max = 100) String titular,
        BigDecimal depositoInicial) {
}
