package com.banco.sistema.api.dto;

import java.math.BigDecimal;

public record CreditoResponse(BigDecimal monto, double tasaMensual, int plazoMeses,
                              BigDecimal cuotaMensual, BigDecimal totalPagar, BigDecimal totalIntereses) {
}
