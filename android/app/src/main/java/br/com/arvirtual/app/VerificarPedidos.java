package br.com.arvirtual.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Roda a cada ~15 minutos, com o app aberto ou fechado: pergunta ao ERP se entraram pedidos novos e mostra uma
 * notificação para cada um (tocar abre o pedido no app). Também atualiza a bateria do aparelho no ERP.
 */
public class VerificarPedidos extends JobService {
    static final String CANAL = "pedidos";
    private static final int JOB = 1;
    private static final String URL_NOVIDADES = "https://app.arvirtual.com.br/api/aparelhos/novidades";

    /** Agenda a verificação periódica (mantida depois de reiniciar o celular). */
    static void agendar(Context ctx) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null || js.getPendingJob(JOB) != null) return;
        js.schedule(new JobInfo.Builder(JOB, new ComponentName(ctx, VerificarPedidos.class))
                .setPeriodic(15 * 60 * 1000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build());
    }

    static void criarCanal(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel c = new NotificationChannel(CANAL, "Pedidos novos", NotificationManager.IMPORTANCE_HIGH);
        c.setDescription("Aviso quando entra um pedido no Mercado Livre, Shopee, Magalu ou na loja");
        ((NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(c);
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try {
                verificar(this);
            } catch (Exception ignorado) {
                // sem internet ou servidor fora: tenta na próxima rodada
            }
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    static void verificar(Context ctx) throws Exception {
        long desde = Aparelho.prefs(ctx).getLong("desde", 0);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        boolean podeNotificar = Build.VERSION.SDK_INT < 24 || nm.areNotificationsEnabled();
        JSONObject corpo = Aparelho.info(ctx, null, podeNotificar);
        corpo.put("desde", desde);

        HttpURLConnection con = (HttpURLConnection) new URL(URL_NOVIDADES).openConnection();
        con.setRequestMethod("POST");
        con.setConnectTimeout(20000);
        con.setReadTimeout(30000);
        con.setDoOutput(true);
        con.setRequestProperty("Content-Type", "application/json");
        con.setRequestProperty("User-Agent", "ArVirtualApp/" + BuildConfig.VERSION_NAME + " aparelho/" + Aparelho.id(ctx));
        String cookie = CookieManager.getInstance().getCookie("https://app.arvirtual.com.br");
        if (cookie != null) con.setRequestProperty("Cookie", cookie);
        try (OutputStream out = con.getOutputStream()) {
            out.write(corpo.toString().getBytes(StandardCharsets.UTF_8));
        }
        if (con.getResponseCode() != 200) return; // sem login (401) ou aparelho bloqueado (403)
        JSONObject r = new JSONObject(ler(con.getInputStream()));
        Aparelho.prefs(ctx).edit().putLong("desde", r.optLong("agora", System.currentTimeMillis())).apply();
        if (desde == 0 || !podeNotificar) return; // primeira rodada só marca a hora (não avisa pedido antigo)

        JSONArray pedidos = r.optJSONArray("pedidos");
        for (int i = 0; pedidos != null && i < pedidos.length(); i++) {
            JSONObject p = pedidos.getJSONObject(i);
            mostrar(ctx, p.optString("id"), p.optString("titulo", "Novo pedido"), p.optString("texto"), p.optString("link", "/pedidos"));
        }
    }

    /**
     * Notificação de pedido (a do push e a da consulta usam esta). O mesmo pedido tem o mesmo id: se chegar pelos dois
     * caminhos, aparece uma vez só. Tocar abre o pedido no app.
     */
    static void mostrar(Context ctx, String pedidoId, String titulo, String texto, String link) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 24 && !nm.areNotificationsEnabled()) return;
        criarCanal(ctx);
        Intent abrir = new Intent(ctx, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("https://app.arvirtual.com.br" + (link.isEmpty() ? "/pedidos" : link)))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int id = ("pedido-" + pedidoId).hashCode();
        PendingIntent toque = PendingIntent.getActivity(ctx, id, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder n = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CANAL) : new Notification.Builder(ctx);
        n.setSmallIcon(R.drawable.ic_notificacao)
                .setColor(0xFFE6C158)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setStyle(new Notification.BigTextStyle().bigText(texto))
                .setAutoCancel(true)
                .setContentIntent(toque)
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true);
        if (Build.VERSION.SDK_INT < 26) n.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        nm.notify(id, n.build());
    }

    private static String ler(InputStream in) throws Exception {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] b = new byte[8192];
        for (int n; (n = in.read(b)) > 0; ) buf.write(b, 0, n);
        return buf.toString("UTF-8");
    }
}
