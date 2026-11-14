package com.banco.sistema.cobol;

import java.time.Duration;

import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;

import com.banco.sistema.config.BancoProperties;

import reactor.core.publisher.Mono;

/**
 * Herramienta de pruebas de timeouts: con banco.simulacion.habilitada=true,
 * el header {@code X-Demora-Ms: 4000} retrasa la llamada COBOL esa cantidad
 * de milisegundos (máximo banco.simulacion.demora-maxima).
 */
@Component
public class DemoraSimuladaFilter implements WebFilter {

    public static final String HEADER = "X-Demora-Ms";

    private final BancoProperties.Simulacion cfg;

    public DemoraSimuladaFilter(BancoProperties props) {
        this.cfg = props.simulacion();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String valor = exchange.getRequest().getHeaders().getFirst(HEADER);
        if (!cfg.habilitada() || valor == null) {
            return chain.filter(exchange);
        }
        long ms;
        try {
            ms = Long.parseLong(valor.trim());
        } catch (NumberFormatException e) {
            return chain.filter(exchange);
        }
        long maximo = cfg.demoraMaxima().toMillis();
        Duration demora = Duration.ofMillis(Math.max(0, Math.min(ms, maximo)));
        return chain.filter(exchange).contextWrite(ctx -> ctx.put(CobolGateway.CTX_DEMORA, demora));
    }
}
