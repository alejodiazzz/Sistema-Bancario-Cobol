package com.banco.sistema.api.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ComisionRequest(@NotNull BigDecimal monto, @Size(max = 100) String concepto) {
}
