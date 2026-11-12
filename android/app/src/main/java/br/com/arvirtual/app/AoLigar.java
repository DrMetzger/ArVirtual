package br.com.arvirtual.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Celular reiniciou ou o app foi atualizado: liga de novo a conexão com o ERP (avisos de pedido). */
public class AoLigar extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a) || "android.intent.action.QUICKBOOT_POWERON".equals(a)) {
            VerificarPedidos.agendar(ctx);
            ConexaoPedidos.iniciar(ctx);
        }
    }
}
