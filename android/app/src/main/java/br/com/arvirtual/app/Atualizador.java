package br.com.arvirtual.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;

import java.io.File;

/**
 * Atualização do app por dentro: baixa o APK novo e, quando termina, abre o instalador do Android na hora
 * (antes o download ia para a pasta Downloads e a pessoa tinha que achar o arquivo).
 */
final class Atualizador {
    static final String MIME_APK = "application/vnd.android.package-archive";
    private static final String PENDENTE = "atualizacao_pendente";

    private Atualizador() {}

    /** O link é o APK do ERP (botão "Baixar versão" ou download do app). */
    static boolean ehApk(String url, String mimeType) {
        return MIME_APK.equals(mimeType) || (url != null && url.contains("/baixar/android"));
    }

    static void baixar(Activity a, String url, String userAgent) {
        DownloadManager dm = (DownloadManager) a.getSystemService(Context.DOWNLOAD_SERVICE);
        File destino = new File(a.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "arvirtual-atualizacao.apk");
        if (destino.exists()) destino.delete();
        DownloadManager.Request pedido = new DownloadManager.Request(Uri.parse(url));
        pedido.addRequestHeader("User-Agent", userAgent);
        pedido.setMimeType(MIME_APK);
        pedido.setTitle("Atualização do ArVirtual");
        pedido.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
        pedido.setDestinationInExternalFilesDir(a, Environment.DIRECTORY_DOWNLOADS, "arvirtual-atualizacao.apk");
        final long id = dm.enqueue(pedido);
        Toast.makeText(a, "Baixando a atualização... o instalador abre sozinho ao terminar.", Toast.LENGTH_LONG).show();

        BroadcastReceiver fim = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
                try {
                    a.unregisterReceiver(this);
                } catch (Exception ignorado) {
                    // já removido
                }
                instalar(a, id);
            }
        };
        IntentFilter filtro = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        // O aviso de download concluído vem do sistema (outro processo): no Android 13+ o receiver precisa ser exportado.
        if (Build.VERSION.SDK_INT >= 33) a.registerReceiver(fim, filtro, Context.RECEIVER_EXPORTED);
        else a.registerReceiver(fim, filtro);
    }

    /** Abre o instalador; se o Android ainda não deixa este app instalar atualizações, leva à permissão e instala ao voltar. */
    static void instalar(Activity a, long id) {
        DownloadManager dm = (DownloadManager) a.getSystemService(Context.DOWNLOAD_SERVICE);
        if (!baixouCerto(dm, id)) {
            Toast.makeText(a, "O download da atualização falhou. Tente de novo.", Toast.LENGTH_LONG).show();
            return;
        }
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
            Aparelho.prefs(a).edit().putLong(PENDENTE, id).apply();
            Toast.makeText(a, "Permita \"instalar apps desconhecidos\" para o ArVirtual e volte: a instalação continua sozinha.", Toast.LENGTH_LONG).show();
            a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName())));
            return;
        }
        Aparelho.prefs(a).edit().remove(PENDENTE).apply();
        Uri arquivo = dm.getUriForDownloadedFile(id);
        Intent abrir = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(arquivo, MIME_APK)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        a.startActivity(abrir);
    }

    /** Ao voltar da tela de permissão: se ficou uma instalação esperando e agora pode, instala. */
    static void continuarPendente(Activity a) {
        long id = Aparelho.prefs(a).getLong(PENDENTE, -1);
        if (id < 0) return;
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) return;
        instalar(a, id);
    }

    private static boolean baixouCerto(DownloadManager dm, long id) {
        try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
            return c != null && c.moveToFirst() && c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL;
        }
    }
}
