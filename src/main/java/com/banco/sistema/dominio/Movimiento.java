package com.banco.sistema.dominio;

import java.time.LocalDateTime;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

/** Registro histórico (inmutable) de cada operación aplicada a una cuenta. */
@Table("movimiento")
public record Movimiento(
        @Id Long id,
        Long cuentaId,
        TipoMovimiento tipo,
        long montoCentavos,
        long saldoAnteriorCentavos,
        long saldoNuevoCentavos,
        String contraparte,
        String descripcion,
        String claveIdempotencia,
        LocalDateTime fecha) {

    public static Movimiento de(Long cuentaId, TipoMovimiento tipo, long saldoAnterior, long saldoNuevo,
                                String contraparte, String descripcion, String clave) {
        return new Movimiento(null, cuentaId, tipo, Math.abs(saldoNuevo - saldoAnterior), saldoAnterior,
                saldoNuevo, contraparte, descripcion, clave, LocalDateTime.now());
    }
}
