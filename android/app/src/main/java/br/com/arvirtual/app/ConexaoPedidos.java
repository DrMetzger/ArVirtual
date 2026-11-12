package br.com.arvirtual.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Fica conectado ao ERP o tempo todo (mesmo com o app fechado e a tela desligada) e mostra o aviso de pedido no mesmo
 * segundo em que ele entra no sistema. Sem Firebase: o próprio ERP responde a consulta quando chega pedido.
 * O Android exige uma notificação fixa enquanto o serviço roda ("ArVirtual conectado"), no canal silencioso.
 */
public class ConexaoPedidos extends Service {
    static final String CANAL_CONEXAO = "conexao";
    private static final int ID_FIXA = 4242;
    private volatile boolean rodando;
    private Thread laco;

    /** Liga o serviço (chamado ao abrir o app e quando o celular reinicia). */
    static void iniciar(Context ctx) {
        try {
            Intent i = new Intent(ctx, ConexaoPedidos.class);
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception ignorado) {
            // o Android não deixou agora (app em segundo plano): a verificação periódica cobre até a próxima abertura
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(CANAL_CONEXAO, "Conexão com o ERP", NotificationManager.IMPORTANCE_MIN);
            c.setDescription("Mantém o app ligado ao ERP para avisar os pedidos na hora");
            c.setShowBadge(false);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(c);
        }
        VerificarPedidos.criarCanal(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Intent abrir = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent toque = PendingIntent.getActivity(this, 0, abrir, PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder n = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CANAL_CONEXAO) : new Notification.Builder(this);
        n.setSmallIcon(R.drawable.ic_notificacao)
                .setColor(0xFFE6C158)
                .setContentTitle("ArVirtual conectado")
                .setContentText("Avisos de pedido ligados")
                .setOngoing(true)
                .setShowWhen(false)
                .setContentIntent(toque);
        if (Build.VERSION.SDK_INT < 26) n.setPriority(Notification.PRIORITY_MIN);
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID_FIXA, n.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(ID_FIXA, n.build());
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (laco == null || !laco.isAlive()) {
            rodando = true;
            laco = new Thread(this::conectado, "conexao-erp");
            laco.start();
        }
        // Se o Android matar o serviço por falta de memória, ele volta sozinho.
        return START_STICKY;
    }

    /** Laço: consulta que espera pedido no ERP; ao responder (com ou sem pedido), consulta de novo. Sem internet, tenta a cada 30 s. */
    private void conectado() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        PowerManager.WakeLock trava = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ArVirtual:conexao");
        int falhas = 0;
        while (rodando) {
            try {
                // Trava curta só durante a consulta: o celular não dorme no meio da resposta.
                trava.acquire(90_000L);
                VerificarPedidos.verificar(this, true);
                falhas = 0;
            } catch (Exception e) {
                falhas++;
            } finally {
                if (trava.isHeld()) trava.release();
            }
            if (falhas > 0) dormir(Math.min(30_000L * falhas, 5 * 60_000L));
        }
    }

    private void dormir(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignorado) {
            // serviço parando
        }
    }

    @Override
    public void onDestroy() {
        rodando = false;
        if (laco != null) laco.interrupt();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
