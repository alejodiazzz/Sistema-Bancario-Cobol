package com.banco.sistema.api.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.banco.sistema.dominio.Cuenta;

public record CuentaResponse(String numero, String titular, BigDecimal saldo, LocalDateTime creadaEn) {

    public static CuentaResponse de(Cuenta c) {
        return new CuentaResponse(c.numero(), c.titular(), Dinero.aPesos(c.saldoCentavos()), c.creadaEn());
    }
}
