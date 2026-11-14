package com.banco.sistema;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import com.banco.sistema.api.dto.CuentaResponse;
import com.banco.sistema.servicio.GeneradorNumeroCuenta;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

/**
 * Políticas transversales: concurrencia, timeout de operación completa y
 * colisión de números de cuenta. Timeout de operación (1 s) menor que el de
 * COBOL (3 s) para que sea la operación completa la que expire.
 */
@SpringBootTest
@AutoConfigureWebTestClient
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "spring.r2dbc.url=r2dbc:h2:mem:///bancopoliticas;DB_CLOSE_DELAY=-1",
        "banco.timeout.cobol=3s",
        "banco.timeout.operacion=1s"})
class BancoPoliticasTest {

    @Autowired
    WebTestClient web;

    @MockBean
    GeneradorNumeroCuenta generador;

    private CuentaResponse abrir(String numero, String deposito) {
        when(generador.siguiente()).thenReturn(numero);
        return web.post().uri("/api/cuentas")
                .bodyValue(Map.of("titular", "Prueba", "depositoInicial", new BigDecimal(deposito)))
                .exchange().expectStatus().isCreated()
                .expectBody(CuentaResponse.class).returnResult().getResponseBody();
    }

    private BigDecimal saldo(String numero) {
        return web.get().uri("/api/cuentas/{n}", numero).exchange()
                .expectBody(CuentaResponse.class).returnResult().getResponseBody().saldo();
    }

    @Test
    void depositosConcurrentesNoPierdenActualizaciones() {
        String n = abrir("2000000001", "0").numero();
        int peticiones = 20;

        List<Integer> estados = Flux.range(0, peticiones)
                .flatMap(i -> Mono.fromCallable(() -> web.post().uri("/api/cuentas/" + n + "/depositos")
                                .bodyValue(Map.of("monto", "10")).exchange()
                                .returnResult(String.class).getStatus().value())
                        .subscribeOn(Schedulers.boundedElastic()), peticiones)
                .collectList().block();

        // Cada petición termina en éxito o en conflicto explícito (409), nunca en otro error.
        assertThat(estados).allMatch(s -> s == 200 || s == 409);
        long exitosas = estados.stream().filter(s -> s == 200).count();
        assertThat(exitosas).isPositive();
        // Ningún depósito exitoso se pierde: saldo = 10 x exitosas.
        assertThat(saldo(n)).isEqualByComparingTo(BigDecimal.valueOf(10 * exitosas));
    }

    @Test
    void timeoutDeOperacionHaceRollback() {
        String n = abrir("2000000002", "500").numero();
        web.post().uri("/api/cuentas/" + n + "/retiros").header("X-Demora-Ms", "1500")
                .bodyValue(Map.of("monto", "100")).exchange()
                .expectStatus().isEqualTo(504)
                .expectBody().jsonPath("$.codigo").isEqualTo("TIMEOUT_OPERACION");
        assertThat(saldo(n)).isEqualByComparingTo("500.00");
    }

    @Test
    void numeroDeCuentaRepetidoSeReintentaConOtro() {
        abrir("2000000003", "1");
        when(generador.siguiente()).thenReturn("2000000003", "2000000004");
        CuentaResponse nueva = web.post().uri("/api/cuentas")
                .bodyValue(Map.of("titular", "Otra", "depositoInicial", 1))
                .exchange().expectStatus().isCreated()
                .expectBody(CuentaResponse.class).returnResult().getResponseBody();
        assertThat(nueva.numero()).isEqualTo("2000000004");
    }
}
