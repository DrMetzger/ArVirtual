package br.com.arvirtual.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.CookieManager;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Push do Firebase: o servidor manda o aviso de pedido novo na hora (sem depender da consulta de 15 min, que o
 * Android congela). Os dados do projeto Firebase vêm do ERP (Configurações), então o APK não carrega arquivo nenhum.
 */
final class Push {
    private static final String BASE = "https://app.arvirtual.com.br/api/aparelhos/push";

    private Push() {}

    /** Inicia o Firebase com a configuração guardada (chamado ao abrir o processo, até pelo push com o app fechado). */
    static boolean iniciar(Context ctx) {
        if (!FirebaseApp.getApps(ctx).isEmpty()) return true;
        SharedPreferences p = Aparelho.prefs(ctx);
        String appId = p.getString("fcm_app", "");
        if (appId.isEmpty()) return false;
        try {
            FirebaseApp.initializeApp(ctx, new FirebaseOptions.Builder()
                    .setApplicationId(appId)
                    .setApiKey(p.getString("fcm_key", ""))
                    .setProjectId(p.getString("fcm_projeto", ""))
                    .setGcmSenderId(p.getString("fcm_sender", ""))
                    .build());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Com o app aberto (e logado): baixa a configuração do ERP, inicia o Firebase e registra o token deste celular. */
    static void registrar(Context ctx) {
        new Thread(() -> {
            try {
                HttpURLConnection con = abrir("GET");
                if (con.getResponseCode() != 200) return; // sem login ou push não configurado no ERP
                JSONObject c = new JSONObject(ler(con.getInputStream()));
                SharedPreferences.Editor e = Aparelho.prefs(ctx).edit()
                        .putString("fcm_app", c.optString("appId"))
                        .putString("fcm_key", c.optString("apiKey"))
                        .putString("fcm_projeto", c.optString("projectId"))
                        .putString("fcm_sender", c.optString("senderId"));
                e.apply();
                if (!iniciar(ctx)) return;
                FirebaseMessaging.getInstance().getToken().addOnSuccessListener(t -> enviarToken(ctx, t));
            } catch (Exception ignorado) {
                // sem internet: tenta na próxima vez que abrir
            }
        }).start();
    }

    /** Manda o token ao ERP (também quando o Firebase troca o token). */
    static void enviarToken(Context ctx, String token) {
        new Thread(() -> {
            try {
                JSONObject corpo = new JSONObject().put("id", Aparelho.id(ctx)).put("token", token);
                HttpURLConnection con = abrir("POST");
                con.setDoOutput(true);
                con.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = con.getOutputStream()) {
                    out.write(corpo.toString().getBytes(StandardCharsets.UTF_8));
                }
                con.getResponseCode();
            } catch (Exception ignorado) {
                // tenta de novo na próxima abertura
            }
        }).start();
    }

    private static HttpURLConnection abrir(String metodo) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(BASE).openConnection();
        con.setRequestMethod(metodo);
        con.setConnectTimeout(20000);
        con.setReadTimeout(30000);
        con.setRequestProperty("User-Agent", "ArVirtualApp/" + BuildConfig.VERSION_NAME);
        String cookie = CookieManager.getInstance().getCookie("https://app.arvirtual.com.br");
        if (cookie != null) con.setRequestProperty("Cookie", cookie);
        return con;
    }

    private static String ler(InputStream in) throws Exception {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] b = new byte[8192];
        for (int n; (n = in.read(b)) > 0; ) buf.write(b, 0, n);
        return buf.toString("UTF-8");
    }
}
