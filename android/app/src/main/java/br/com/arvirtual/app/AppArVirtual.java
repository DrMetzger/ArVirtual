package br.com.arvirtual.app;

import android.app.Application;

/** Processo do app: inicia o Firebase logo ao abrir, para o push chegar mesmo com o app fechado. */
public class AppArVirtual extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        Push.iniciar(this);
    }
}
