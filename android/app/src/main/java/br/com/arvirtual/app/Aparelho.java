package br.com.arvirtual.app;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.location.Location;
import android.os.BatteryManager;
import android.os.Build;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.UUID;

/** Dados do aparelho enviados ao ERP (Configurações › Aparelhos): id próprio, modelo, Android, bateria e localização. */
final class Aparelho {
    static final String PREFS = "arvirtual";

    private Aparelho() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Id gerado na primeira abertura e guardado: identifica este celular para bloquear/liberar. */
    static String id(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String id = p.getString("id", null);
        if (id == null) {
            id = UUID.randomUUID().toString();
            p.edit().putString("id", id).apply();
        }
        return id;
    }

    /** Vai no user-agent de todas as páginas: o ERP reconhece o app e o aparelho (bloqueio vale na hora). */
    static String sufixoUserAgent(Context ctx) {
        return " ArVirtualApp/" + BuildConfig.VERSION_NAME + " aparelho/" + id(ctx);
    }

    static JSONObject info(Context ctx, Location local, boolean notificacoes) {
        JSONObject j = new JSONObject();
        try {
            j.put("id", id(ctx));
            j.put("fabricante", capitalizar(Build.MANUFACTURER));
            j.put("modelo", Build.MODEL);
            j.put("android", Build.VERSION.RELEASE);
            j.put("versaoApp", BuildConfig.VERSION_NAME);
            j.put("notificacoes", notificacoes);
            Intent bateria = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (bateria != null) {
                int nivel = bateria.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int escala = bateria.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                int status = bateria.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                if (nivel >= 0 && escala > 0) j.put("bateria", Math.round(nivel * 100f / escala));
                j.put("carregando", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL);
            }
            if (local != null) {
                j.put("latitude", local.getLatitude());
                j.put("longitude", local.getLongitude());
                if (local.hasAccuracy()) j.put("precisao", local.getAccuracy());
                j.put("localizadoEm", local.getTime());
            }
        } catch (JSONException ignorado) {
            // campos simples: não acontece
        }
        return j;
    }

    private static String capitalizar(String s) {
        return s == null || s.isEmpty() ? "" : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
