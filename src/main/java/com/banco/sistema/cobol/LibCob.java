package com.banco.sistema.cobol;

import com.sun.jna.Library;

/** Runtime de GnuCOBOL (libcob-4.dll / libcob.so). Debe inicializarse antes de llamar a la librería COBOL. */
public interface LibCob extends Library {
    void cob_init(int argc, String[] argv);
    void cob_init_nomain(int argc, String[] argv);
}
