package com.banco.sistema.dominio;

import java.time.LocalDateTime;

import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.Version;
import org.springframework.data.relational.core.mapping.Table;

/** Cuenta bancaria. {@code version} habilita bloqueo optimista entre peticiones concurrentes. */
@Table("cuenta")
public record Cuenta(
        @Id Long id,
        String numero,
        String titular,
        long saldoCentavos,
        @Version Long version,
        LocalDateTime creadaEn) {

    public static Cuenta nueva(String numero, String titular, long saldoCentavos) {
        return new Cuenta(null, numero, titular, saldoCentavos, null, LocalDateTime.now());
    }

    public Cuenta conSaldo(long nuevoSaldo) {
        return new Cuenta(id, numero, titular, nuevoSaldo, version, creadaEn);
    }
}
