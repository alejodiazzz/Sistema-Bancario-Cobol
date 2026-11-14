package com.banco.sistema.cobol;

import java.time.Duration;
import java.util.concurrent.Callable;
import java.util.concurrent.TimeoutException;

import org.springframework.stereotype.Component;

import com.banco.sistema.config.BancoProperties;
import com.banco.sistema.error.CodigoError;
import com.banco.sistema.error.NegocioException;
import com.sun.jna.ptr.DoubleByReference;
import com.sun.jna.ptr.IntByReference;
import com.sun.jna.ptr.LongByReference;

import reactor.core.publisher.Mono;
import reactor.core.scheduler.Scheduler;

/**
 * Puente reactivo hacia banco.dll. Cada operación:
 * 1. se ejecuta en el hilo dedicado "cobol" (la llamada JNA es bloqueante),
 * 2. tiene un timeout propio (banco.timeout.cobol),
 * 3. traduce LK-ESTADO != 0 a una {@link NegocioException}.
 */
@Component
public class CobolGateway {

    /** Clave del contexto Reactor con la demora simulada (ver DemoraSimuladaFilter). */
    public static final String CTX_DEMORA = "banco.demora";

    public record Saldo(long nuevoSaldo) { }
    public record Transferencia(long nuevoOrigen, long nuevoDestino) { }
    public record Interes(long interes, long nuevoSaldo) { }
    public record Credito(long cuota, long total) { }

    private final BancoCobolLib lib;
    private final Scheduler scheduler;
    private final Duration timeout;

    public CobolGateway(BancoCobolLib lib, Scheduler cobolScheduler, BancoProperties props) {
        this.lib = lib;
        this.scheduler = cobolScheduler;
        this.timeout = props.timeout().cobol();
    }

    public Mono<Saldo> depositar(long saldo, long monto) {
        return ejecutar("depositar", () -> {
            LongByReference nuevo = new LongByReference();
            IntByReference estado = new IntByReference();
            lib.depositar(new LongByReference(saldo), new LongByReference(monto), nuevo, estado);
            exigirExito(estado);
            return new Saldo(nuevo.getValue());
        });
    }

    public Mono<Saldo> retirar(long saldo, long monto) {
        return ejecutar("retirar", () -> {
            LongByReference nuevo = new LongByReference();
            IntByReference estado = new IntByReference();
            lib.retirar(new LongByReference(saldo), new LongByReference(monto), nuevo, estado);
            exigirExito(estado);
            return new Saldo(nuevo.getValue());
        });
    }

    public Mono<Transferencia> transferir(long saldoOrigen, long saldoDestino, long monto) {
        return ejecutar("transferir", () -> {
            LongByReference nuevoOrigen = new LongByReference();
            LongByReference nuevoDestino = new LongByReference();
            IntByReference estado = new IntByReference();
            lib.transferir(new LongByReference(saldoOrigen), new LongByReference(saldoDestino),
                    new LongByReference(monto), nuevoOrigen, nuevoDestino, estado);
            exigirExito(estado);
            return new Transferencia(nuevoOrigen.getValue(), nuevoDestino.getValue());
        });
    }

    public Mono<Interes> abonarInteres(long saldo, double tasaAnual, int dias) {
        return ejecutar("abonar_interes", () -> {
            LongByReference interes = new LongByReference();
            LongByReference nuevo = new LongByReference();
            IntByReference estado = new IntByReference();
            lib.abonar_interes(new LongByReference(saldo), new DoubleByReference(tasaAnual),
                    new IntByReference(dias), interes, nuevo, estado);
            exigirExito(estado);
            return new Interes(interes.getValue(), nuevo.getValue());
        });
    }

    public Mono<Credito> simularCredito(long monto, double tasaMensual, int plazo) {
        return ejecutar("simular_credito", () -> {
            LongByReference cuota = new LongByReference();
            LongByReference total = new LongByReference();
            IntByReference estado = new IntByReference();
            lib.simular_credito(new LongByReference(monto), new DoubleByReference(tasaMensual),
                    new IntByReference(plazo), cuota, total, estado);
            exigirExito(estado);
            return new Credito(cuota.getValue(), total.getValue());
        });
    }

    public Mono<Saldo> cobrarComision(long saldo, long comision) {
        return ejecutar("cobrar_comision", () -> {
            LongByReference nuevo = new LongByReference();
            IntByReference estado = new IntByReference();
            lib.cobrar_comision(new LongByReference(saldo), new LongByReference(comision), nuevo, estado);
            exigirExito(estado);
            return new Saldo(nuevo.getValue());
        });
    }

    private <T> Mono<T> ejecutar(String operacion, Callable<T> llamadaNativa) {
        return Mono.deferContextual(ctx -> {
            Duration demora = ctx.getOrDefault(CTX_DEMORA, Duration.ZERO);
            Mono<T> llamada = Mono.fromCallable(llamadaNativa).subscribeOn(scheduler);
            // La demora simulada es no bloqueante: no ocupa el hilo "cobol".
            Mono<T> conDemora = demora.isZero() ? llamada : Mono.delay(demora).then(llamada);
            return conDemora.timeout(timeout);
        }).onErrorMap(TimeoutException.class, e -> new NegocioException(CodigoError.TIMEOUT_COBOL,
                "El módulo COBOL '%s' no respondió en %d ms".formatted(operacion, timeout.toMillis())));
    }

    private static void exigirExito(IntByReference estadoRef) {
        EstadoCobol estado = EstadoCobol.desde(estadoRef.getValue());
        if (estado != EstadoCobol.EXITO) {
            throw new NegocioException(estado.error(), "COBOL rechazó la operación: " + estado.mensaje(),
                    estado.codigo());
        }
    }
}
