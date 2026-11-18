package com.banco.sistema.cobol;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.banco.sistema.config.BancoProperties;
import com.sun.jna.Library;
import com.sun.jna.Memory;
import com.sun.jna.Native;
import com.sun.jna.NativeLibrary;
import com.sun.jna.Platform;
import com.sun.jna.Pointer;

import reactor.core.scheduler.Scheduler;
import reactor.core.scheduler.Schedulers;

@Configuration
public class CobolConfig {

    private static final Logger log = LoggerFactory.getLogger(CobolConfig.class);

    /** Interfaz POSIX mínima para preservar los signal handlers de la JVM en Linux/macOS. */
    public interface PosixLibC extends Library {
        int sigaction(int signum, Pointer act, Pointer oldact);
    }

    private static final int[] SENALES_JVM = { 1, 2, 3, 4, 6, 7, 8, 11, 13, 14, 15, 17, 19, 29 };
    private static final int TAMANO_SIGACTION = 256;

    /** Inicializa libcob y carga la librería nativa COBOL (DLL / SO / DYLIB) una sola vez para toda la aplicación. */
    @Bean
    public BancoCobolLib bancoCobolLib(BancoProperties props) {
        BancoProperties.Cobol cfg = props.cobol();
        Path dirModulo = Path.of(cfg.directorio()).toAbsolutePath();

        String nombreLibCob = resolverNombreLibCob();
        agregarRutaSiExiste(nombreLibCob, cfg.gnucobolBin());
        LibCob libCob = Native.load(nombreLibCob, LibCob.class);
        if (Platform.isWindows()) {
            libCob.cob_init(0, null);
        } else {
            inicializarCobolPreservandoSenalesJvm(libCob);
        }
        log.info("[COBOL] Runtime GnuCOBOL inicializado ({})", nombreLibCob);

        String referenciaModulo = resolverModuloBanco(cfg.nombreLibreria(), dirModulo);
        BancoCobolLib lib = Native.load(referenciaModulo, BancoCobolLib.class);
        log.info("[COBOL] Librería '{}' cargada desde {}", referenciaModulo, dirModulo);
        return lib;
    }

    /**
     * En Linux/macOS, cob_init() registra sus propios handlers con sigaction()
     * para SIGSEGV, SIGBUS, SIGFPE, SIGPIPE, SIGQUIT, etc., sobreescribiendo los
     * de HotSpot (que usa SIGSEGV para safepoints y null-checks implícitos del JIT).
     * Guardamos y restauramos los handlers de la JVM alrededor de cob_init_nomain().
     */
    private static void inicializarCobolPreservandoSenalesJvm(LibCob libCob) {
        PosixLibC libc = Native.load("c", PosixLibC.class);
        Memory[] guardados = new Memory[SENALES_JVM.length];
        for (int i = 0; i < SENALES_JVM.length; i++) {
            Memory mem = new Memory(TAMANO_SIGACTION);
            mem.clear();
            if (libc.sigaction(SENALES_JVM[i], Pointer.NULL, mem) == 0) {
                guardados[i] = mem;
            }
        }
        try {
            libCob.cob_init_nomain(0, null);
        } finally {
            for (int i = 0; i < SENALES_JVM.length; i++) {
                if (guardados[i] != null) {
                    libc.sigaction(SENALES_JVM[i], guardados[i], Pointer.NULL);
                }
            }
        }
    }

    private static String resolverNombreLibCob() {
        return Platform.isWindows() ? "libcob-4" : "cob";
    }

    private static void agregarRutaSiExiste(String libreria, String ruta) {
        if (ruta == null || ruta.isBlank()) {
            return;
        }
        if (Platform.isWindows()) {
            NativeLibrary.addSearchPath(libreria, ruta);
            return;
        }
        try {
            Path dir = Path.of(ruta);
            if (Files.isDirectory(dir)) {
                NativeLibrary.addSearchPath(libreria, dir.toAbsolutePath().toString());
            }
        } catch (Exception ignored) {
            // Ignora rutas de Windows (p. ej. C:/...) cuando se ejecuta en Linux/macOS
        }
    }

    private static String resolverModuloBanco(String nombre, Path dirModulo) {
        String dirStr = dirModulo.toString();
        if (Platform.isWindows()) {
            NativeLibrary.addSearchPath(nombre, dirStr);
            return nombre;
        }
        String ext = Platform.isMac() ? ".dylib" : ".so";
        List<Path> candidatos = List.of(
                dirModulo.resolve(System.mapLibraryName(nombre)),
                dirModulo.resolve(nombre + ext));
        for (Path candidato : candidatos) {
            if (Files.isRegularFile(candidato)) {
                return candidato.toAbsolutePath().toString();
            }
        }
        NativeLibrary.addSearchPath(nombre, dirStr);
        return nombre;
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
