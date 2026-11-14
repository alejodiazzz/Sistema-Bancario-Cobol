package com.banco.sistema.cobol;

import com.sun.jna.Library;

/** Runtime de GnuCOBOL (libcob-4.dll). Debe inicializarse antes de llamar a banco.dll. */
public interface LibCob extends Library {
    void cob_init(int argc, String[] argv);
}
