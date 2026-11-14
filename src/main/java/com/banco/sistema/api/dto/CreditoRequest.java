package com.banco.sistema.api.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.NotNull;

/** tasaMensual en porcentaje (ej. 1.5 = 1,5 % mensual). */
public record CreditoRequest(@NotNull BigDecimal monto, @NotNull Double tasaMensual, @NotNull Integer plazoMeses) {
}
