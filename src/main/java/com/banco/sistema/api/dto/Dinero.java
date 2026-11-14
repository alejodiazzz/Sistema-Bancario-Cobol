package com.banco.sistema.api.dto;

import java.math.BigDecimal;

import com.banco.sistema.error.CodigoError;
import com.banco.sistema.error.NegocioException;

/** Conversión entre pesos (API, BigDecimal) y centavos (COBOL/BD, long). */
public final class Dinero {

    private Dinero() {
    }

    public static long aCentavos(BigDecimal pesos) {
        if (pesos == null) {
            return 0L;
        }
        if (pesos.stripTrailingZeros().scale() > 2) {
            throw new NegocioException(CodigoError.MONTO_INVALIDO, "El monto admite máximo 2 decimales");
        }
        try {
            return pesos.movePointRight(2).longValueExact();
        } catch (ArithmeticException e) {
            throw new NegocioException(CodigoError.MONTO_INVALIDO, "Monto fuera de rango");
        }
    }

    public static BigDecimal aPesos(long centavos) {
        return BigDecimal.valueOf(centavos, 2);
    }
}
