package br.com.arvirtual.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Celular reiniciou ou o app foi atualizado: agenda de novo a consulta de pedidos (sem notificação fixa). */
public class AoLigar extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a) || "android.intent.action.QUICKBOOT_POWERON".equals(a)) {
            VerificarPedidos.agendar(ctx);
        }
    }
}
