package com.banco.sistema;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.reactive.server.WebTestClient;

import com.banco.sistema.api.dto.CreditoResponse;
import com.banco.sistema.api.dto.CuentaResponse;
import com.banco.sistema.api.dto.MovimientoResponse;
import com.banco.sistema.api.dto.OperacionResponse;

/** Pruebas de extremo a extremo: HTTP -> WebFlux -> JNA -> banco.dll -> H2. */
@SpringBootTest
@AutoConfigureWebTestClient
@ActiveProfiles("test")
class BancoApiTest {

    @Autowired
    WebTestClient web;

    private String abrir(String deposito) {
        CuentaResponse c = web.post().uri("/api/cuentas")
                .bodyValue(Map.of("titular", "Ana Prueba", "depositoInicial", new BigDecimal(deposito)))
                .exchange().expectStatus().isCreated()
                .expectBody(CuentaResponse.class).returnResult().getResponseBody();
        assertThat(c.saldo()).isEqualByComparingTo(deposito);
        return c.numero();
    }

    private WebTestClient.ResponseSpec post(String uri, Object body) {
        return web.post().uri(uri).bodyValue(body).exchange();
    }

    private BigDecimal saldo(String numero) {
        return web.get().uri("/api/cuentas/{n}", numero).exchange().expectStatus().isOk()
                .expectBody(CuentaResponse.class).returnResult().getResponseBody().saldo();
    }

    @Test
    void depositoYRetiro() {
        String n = abrir("1000.00");
        post("/api/cuentas/" + n + "/depositos", Map.of("monto", "250.50")).expectStatus().isOk()
                .expectBody().jsonPath("$.saldoNuevo").isEqualTo(1250.50);
        post("/api/cuentas/" + n + "/retiros", Map.of("monto", "50.25")).expectStatus().isOk()
                .expectBody().jsonPath("$.saldoNuevo").isEqualTo(1200.25);
        assertThat(saldo(n)).isEqualByComparingTo("1200.25");
    }

    @Test
    void retiroSinFondosLoRechazaCobol() {
        String n = abrir("100.00");
        post("/api/cuentas/" + n + "/retiros", Map.of("monto", "100.01")).expectStatus().isEqualTo(422)
                .expectBody().jsonPath("$.codigo").isEqualTo("FONDOS_INSUFICIENTES")
                .jsonPath("$.estadoCobol").isEqualTo(2);
        assertThat(saldo(n)).isEqualByComparingTo("100.00");
    }

    @Test
    void montoNegativoLoRechazaCobol() {
        String n = abrir("10.00");
        post("/api/cuentas/" + n + "/depositos", Map.of("monto", "-5")).expectStatus().isEqualTo(422)
                .expectBody().jsonPath("$.codigo").isEqualTo("MONTO_INVALIDO");
    }

    @Test
    void transferencia() {
        String a = abrir("500.00");
        String b = abrir("20.00");
        post("/api/transferencias", Map.of("cuentaOrigen", a, "cuentaDestino", b, "monto", "120"))
                .expectStatus().isOk()
                .expectBody().jsonPath("$.saldoNuevo").isEqualTo(380.00)
                .jsonPath("$.saldoDestino").isEqualTo(140.00);
        assertThat(saldo(a)).isEqualByComparingTo("380.00");
        assertThat(saldo(b)).isEqualByComparingTo("140.00");
        post("/api/transferencias", Map.of("cuentaOrigen", a, "cuentaDestino", a, "monto", "1"))
                .expectStatus().isBadRequest().expectBody().jsonPath("$.codigo").isEqualTo("MISMA_CUENTA");
    }

    @Test
    void interesYComision() {
        String n = abrir("100000.00");
        post("/api/cuentas/" + n + "/intereses", Map.of("tasaAnual", 10, "dias", 365)).expectStatus().isOk()
                .expectBody().jsonPath("$.monto").isEqualTo(10000.00);
        post("/api/cuentas/" + n + "/comisiones", Map.of("monto", "15000", "concepto", "Cuota de manejo"))
                .expectStatus().isOk().expectBody().jsonPath("$.saldoNuevo").isEqualTo(95000.00);
        post("/api/cuentas/" + n + "/intereses", Map.of("tasaAnual", 0, "dias", 30)).expectStatus().isEqualTo(422)
                .expectBody().jsonPath("$.codigo").isEqualTo("PARAMETRO_INVALIDO");
    }

    @Test
    void simulacionCredito() {
        CreditoResponse r = post("/api/creditos/simulacion",
                Map.of("monto", "1000000", "tasaMensual", 1, "plazoMeses", 12))
                .expectStatus().isOk().expectBody(CreditoResponse.class).returnResult().getResponseBody();
        assertThat(r.cuotaMensual()).isEqualByComparingTo("88848.79");
        assertThat(r.totalPagar()).isEqualByComparingTo("1066185.48");
    }

    @Test
    void timeoutCobolNoModificaSaldo() {
        String n = abrir("300.00");
        web.post().uri("/api/cuentas/" + n + "/retiros").header("X-Demora-Ms", "1500")
                .bodyValue(Map.of("monto", "100")).exchange()
                .expectStatus().isEqualTo(504)
                .expectBody().jsonPath("$.codigo").isEqualTo("TIMEOUT_COBOL");
        assertThat(saldo(n)).isEqualByComparingTo("300.00");
    }

    @Test
    void reintentoConClaveIdempotenteNoDuplica() {
        String n = abrir("0");
        for (int i = 0; i < 2; i++) {
            OperacionResponse r = web.post().uri("/api/cuentas/" + n + "/depositos")
                    .header("X-Idempotency-Key", "dep-" + n).bodyValue(Map.of("monto", "40")).exchange()
                    .expectStatus().isOk().expectBody(OperacionResponse.class).returnResult().getResponseBody();
            assertThat(r.repetida()).isEqualTo(i == 1);
        }
        assertThat(saldo(n)).isEqualByComparingTo("40.00");
        assertThat(web.get().uri("/api/cuentas/{n}/movimientos", n).exchange()
                .expectBodyList(MovimientoResponse.class).returnResult().getResponseBody()).hasSize(2);
    }

    @Test
    void cuentaInexistente() {
        web.get().uri("/api/cuentas/999").exchange().expectStatus().isNotFound()
                .expectBody().jsonPath("$.codigo").isEqualTo("CUENTA_NO_ENCONTRADA");
    }
}
