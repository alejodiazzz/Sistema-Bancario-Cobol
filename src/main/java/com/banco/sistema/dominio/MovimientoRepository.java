package com.banco.sistema.dominio;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface MovimientoRepository extends ReactiveCrudRepository<Movimiento, Long> {

    Flux<Movimiento> findByCuentaIdOrderByIdDesc(Long cuentaId);

    Mono<Movimiento> findByClaveIdempotencia(String claveIdempotencia);
}
