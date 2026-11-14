package com.banco.sistema.api.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.banco.sistema.dominio.Movimiento;
import com.banco.sistema.dominio.TipoMovimiento;
import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record MovimientoResponse(Long id, TipoMovimiento tipo, BigDecimal monto, BigDecimal saldoAnterior,
                                 BigDecimal saldoNuevo, String contraparte, String descripcion,
                                 LocalDateTime fecha) {

    public static MovimientoResponse de(Movimiento m) {
        return new MovimientoResponse(m.id(), m.tipo(), Dinero.aPesos(m.montoCentavos()),
                Dinero.aPesos(m.saldoAnteriorCentavos()), Dinero.aPesos(m.saldoNuevoCentavos()),
                m.contraparte(), m.descripcion(), m.fecha());
    }
}
