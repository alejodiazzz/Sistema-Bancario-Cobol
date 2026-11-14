package com.banco.sistema.api.dto;

import jakarta.validation.constraints.NotNull;

/** tasaAnual en porcentaje (ej. 12.5 = 12,5 % E.A. simple), dias de causación. */
public record InteresRequest(@NotNull Double tasaAnual, @NotNull Integer dias) {
}
