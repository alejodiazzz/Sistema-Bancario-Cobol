package com.banco.sistema.api.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.banco.sistema.dominio.Cuenta;
import com.banco.sistema.dominio.Movimiento;
import com.banco.sistema.dominio.TipoMovimiento;
import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Resultado de una operación que modifica saldo.
 * {@code repetida=true} indica que se devolvió el resultado de una petición anterior
 * con la misma clave de idempotencia (reintento tras un timeout del cliente).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record OperacionResponse(
        Long movimientoId,
        TipoMovimiento tipo,
        String cuenta,
        BigDecimal monto,
        BigDecimal saldoAnterior,
        BigDecimal saldoNuevo,
        String cuentaDestino,
        BigDecimal saldoDestino,
        String mensaje,
        LocalDateTime fecha,
        boolean repetida) {

    public static OperacionResponse de(Cuenta cuenta, Movimiento m, String mensaje) {
        return new OperacionResponse(m.id(), m.tipo(), cuenta.numero(), Dinero.aPesos(m.montoCentavos()),
                Dinero.aPesos(m.saldoAnteriorCentavos()), Dinero.aPesos(m.saldoNuevoCentavos()),
                m.contraparte(), null, mensaje, m.fecha(), false);
    }

    public OperacionResponse conDestino(BigDecimal saldoDestino) {
        return new OperacionResponse(movimientoId, tipo, cuenta, monto, saldoAnterior, saldoNuevo,
                cuentaDestino, saldoDestino, mensaje, fecha, repetida);
    }

    public OperacionResponse comoRepetida() {
        return new OperacionResponse(movimientoId, tipo, cuenta, monto, saldoAnterior, saldoNuevo,
                cuentaDestino, saldoDestino, "Operación ya procesada anteriormente (idempotencia)", fecha, true);
    }
}
