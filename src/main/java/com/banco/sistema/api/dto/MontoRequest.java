package com.banco.sistema.api.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.NotNull;

/** Cuerpo de depósitos y retiros. Las reglas de negocio (monto > 0, fondos) las valida COBOL. */
public record MontoRequest(@NotNull BigDecimal monto) {
}
