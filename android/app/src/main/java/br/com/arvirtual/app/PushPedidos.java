package br.com.arvirtual.app;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Recebe o push do ERP (mesmo com o app fechado) e mostra a notificação do pedido. */
public class PushPedidos extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        if (d.isEmpty()) return;
        VerificarPedidos.mostrar(this, d.getOrDefault("id", ""), d.getOrDefault("titulo", "Novo pedido"), d.getOrDefault("texto", ""), d.getOrDefault("link", "/pedidos"));
    }

    @Override
    public void onNewToken(String token) {
        Push.enviarToken(this, token);
    }
}
