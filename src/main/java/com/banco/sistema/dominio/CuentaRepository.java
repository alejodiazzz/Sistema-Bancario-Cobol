package com.banco.sistema.dominio;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface CuentaRepository extends ReactiveCrudRepository<Cuenta, Long> {

    Mono<Cuenta> findByNumero(String numero);

    Flux<Cuenta> findAllByOrderByIdAsc();
}
