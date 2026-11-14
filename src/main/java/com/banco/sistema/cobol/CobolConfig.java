package com.banco.sistema.cobol;

import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.banco.sistema.config.BancoProperties;
import com.sun.jna.Native;
import com.sun.jna.NativeLibrary;

import reactor.core.scheduler.Scheduler;
import reactor.core.scheduler.Schedulers;

@Configuration
public class CobolConfig {

    private static final Logger log = LoggerFactory.getLogger(CobolConfig.class);

    /** Inicializa libcob y carga banco.dll una sola vez para toda la aplicación. */
    @Bean
    public BancoCobolLib bancoCobolLib(BancoProperties props) {
        BancoProperties.Cobol cfg = props.cobol();
        String dirDll = Path.of(cfg.directorio()).toAbsolutePath().toString();

        NativeLibrary.addSearchPath("libcob-4", cfg.gnucobolBin());
        LibCob libCob = Native.load("libcob-4", LibCob.class);
        libCob.cob_init(0, null);
        log.info("[COBOL] Runtime GnuCOBOL inicializado");

        NativeLibrary.addSearchPath(cfg.nombreLibreria(), dirDll);
        BancoCobolLib lib = Native.load(cfg.nombreLibreria(), BancoCobolLib.class);
        log.info("[COBOL] {}.dll cargada desde {}", cfg.nombreLibreria(), dirDll);
        return lib;
    }

    /**
     * El runtime de GnuCOBOL no es thread-safe: todas las llamadas nativas se
     * serializan en un único hilo dedicado, fuera del event-loop de Netty.
     */
    @Bean(destroyMethod = "dispose")
    public Scheduler cobolScheduler() {
        return Schedulers.newSingle("cobol");
    }
}
