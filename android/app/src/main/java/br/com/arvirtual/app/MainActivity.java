package br.com.arvirtual.app;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Looper;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/**
 * App Android do ERP ArVirtual: abre o sistema (app.arvirtual.com.br) numa tela própria, com login guardado,
 * envio de fotos/arquivos, downloads e links externos (Shopee, Mercado Livre, WhatsApp) abrindo no app certo.
 */
public class MainActivity extends Activity {
    private static final String HOST = "app.arvirtual.com.br";
    private static final String INICIO = "https://" + HOST + "/";
    private static final int ESCOLHER_ARQUIVO = 1;

    private static final int PERMISSOES = 2;

    private WebView web;
    private ValueCallback<Uri[]> arquivosPendentes;
    /** Última localização conhecida (enviada ao ERP pela ponte; Configurações › Aparelhos). */
    private volatile Location local;

    /** Ponte com o site: o ERP lê os dados do aparelho (window.ArVirtualApp.info()). Só o domínio do ERP abre no app. */
    private final class Ponte {
        @JavascriptInterface
        public String info() {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            boolean notificacoes = Build.VERSION.SDK_INT < 24 || nm.areNotificationsEnabled();
            return Aparelho.info(MainActivity.this, local, notificacoes).toString();
        }
    }

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0A1A33"));
        // Moldura com o azul do ERP: o Android 15 desenha o app por baixo da barra de status (hora, bateria) e da
        // barra de navegação; o espaço delas (e o do teclado) vira margem, então nada fica cortado ou sobreposto.
        FrameLayout moldura = new FrameLayout(this);
        moldura.setBackgroundColor(Color.parseColor("#0A1A33"));
        moldura.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        moldura.setOnApplyWindowInsetsListener((v, insets) -> {
            int topo, baixo, esq, dir;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets barras = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets teclado = insets.getInsets(WindowInsets.Type.ime());
                topo = barras.top;
                esq = barras.left;
                dir = barras.right;
                baixo = Math.max(barras.bottom, teclado.bottom);
            } else {
                topo = insets.getSystemWindowInsetTop();
                esq = insets.getSystemWindowInsetLeft();
                dir = insets.getSystemWindowInsetRight();
                baixo = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(esq, topo, dir, baixo);
            return insets;
        });
        setContentView(moldura);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        // Letra fixa: com a fonte grande do Android os cartões estouram (preço saindo do card).
        s.setTextZoom(100);
        // O site reconhece o app e o aparelho (esconde o "baixar o app"; bloqueio do aparelho vale na hora).
        s.setUserAgentString(s.getUserAgentString() + Aparelho.sufixoUserAgent(this));
        web.addJavascriptInterface(new Ponte(), "ArVirtualApp");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri uri = req.getUrl();
                // O ERP abre aqui dentro; o resto (anúncio no ML/Shopee, WhatsApp, e-mail, telefone) no app de cada um.
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) return false;
                abrirFora(uri);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError erro) {
                if (req.isForMainFrame()) mostrarSemConexao(req.getUrl().toString());
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (arquivosPendentes != null) arquivosPendentes.onReceiveValue(null);
                arquivosPendentes = callback;
                Intent escolher = params.createIntent();
                escolher.addCategory(Intent.CATEGORY_OPENABLE);
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) escolher.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(escolher, "Escolher arquivo"), ESCOLHER_ARQUIVO);
                } catch (ActivityNotFoundException e) {
                    arquivosPendentes = null;
                    Toast.makeText(MainActivity.this, "Nenhum app para escolher arquivos.", Toast.LENGTH_LONG).show();
                    return false;
                }
                return true;
            }
        });

        // Downloads (ZIP de fotos, 3MF/STL, XML/PDF de notas): baixa com o login do app e avisa na barra de notificações.
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, tamanho) -> {
            if (!url.startsWith("http")) return;
            // Atualização do app: baixa e abre o instalador sozinho.
            if (Atualizador.ehApk(url, mimeType)) {
                Atualizador.baixar(this, url, userAgent);
                return;
            }
            try {
                String nome = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request pedido = new DownloadManager.Request(Uri.parse(url));
                pedido.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                pedido.addRequestHeader("User-Agent", userAgent);
                pedido.setMimeType(mimeType);
                pedido.setTitle(nome);
                pedido.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                pedido.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, nome);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(pedido);
                Toast.makeText(this, "Baixando " + nome, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                abrirFora(Uri.parse(url));
            }
        });

        if (estado != null) web.restoreState(estado);
        else web.loadUrl(destino(getIntent()));

        // Aviso de pedido novo mesmo com o app fechado (consulta a cada ~15 min).
        VerificarPedidos.criarCanal(this);
        VerificarPedidos.agendar(this);
        // Push na hora (Firebase): registra este celular no ERP.
        Push.registrar(this);
        // Conexão permanente com o ERP: aviso de pedido no instante em que entra (sem Firebase).
        ConexaoPedidos.iniciar(this);
        pedirPermissoes();
        pedirSemEconomiaDeBateria();
    }

    /**
     * Pede (uma vez) para o Android não congelar o app na economia de bateria: sem isso, com a tela desligada,
     * alguns celulares cortam a internet do app e o aviso atrasa.
     */
    private void pedirSemEconomiaDeBateria() {
        if (Build.VERSION.SDK_INT < 23) return;
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null || pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            if (Aparelho.prefs(this).getBoolean("pediuBateria", false)) return;
            Aparelho.prefs(this).edit().putBoolean("pediuBateria", true).apply();
            startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
        } catch (Exception ignorado) {
            // aparelho sem essa tela: segue com a verificação periódica
        }
    }

    /** Notificações (Android 13+) e localização (para Configurações › Aparelhos). Pergunta uma vez; dá para mudar depois no Android. */
    private void pedirPermissoes() {
        if (Build.VERSION.SDK_INT < 23) return;
        List<String> faltam = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            faltam.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            faltam.add(Manifest.permission.ACCESS_FINE_LOCATION);
            faltam.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (!faltam.isEmpty() && !Aparelho.prefs(this).getBoolean("pediuPermissoes", false)) {
            Aparelho.prefs(this).edit().putBoolean("pediuPermissoes", true).apply();
            requestPermissions(faltam.toArray(new String[0]), PERMISSOES);
        }
    }

    @Override
    public void onRequestPermissionsResult(int pedido, String[] permissoes, int[] resultados) {
        super.onRequestPermissionsResult(pedido, permissoes, resultados);
        if (pedido == PERMISSOES) atualizarLocal();
    }

    /** Pega a localização mais recente (rápida) e pede uma nova em seguida. */
    @SuppressWarnings({"MissingPermission", "deprecation"})
    private void atualizarLocal() {
        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (lm == null) return;
        try {
            for (String provedor : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(provedor);
                if (l != null && (local == null || l.getTime() > local.getTime())) local = l;
            }
            String provedor = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ? LocationManager.NETWORK_PROVIDER
                    : lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ? LocationManager.GPS_PROVIDER : null;
            if (provedor == null) return;
            if (Build.VERSION.SDK_INT >= 30) {
                lm.getCurrentLocation(provedor, null, getMainExecutor(), l -> { if (l != null) local = l; });
            } else {
                lm.requestSingleUpdate(provedor, l -> local = l, Looper.getMainLooper());
            }
        } catch (SecurityException | IllegalArgumentException ignorado) {
            // permissão retirada ou provedor indisponível
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Voltou da permissão "instalar apps desconhecidos": continua a atualização.
        Atualizador.continuarPendente(this);
        atualizarLocal();
    }

    private String destino(Intent intent) {
        Uri dados = intent != null ? intent.getData() : null;
        return dados != null && HOST.equals(dados.getHost()) ? dados.toString() : INICIO;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getData() != null) web.loadUrl(destino(intent));
    }

    private void abrirFora(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Nenhum app para abrir este link.", Toast.LENGTH_LONG).show();
        }
    }

    private void mostrarSemConexao(String url) {
        String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='margin:0;height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#0A1A33;color:#fff;font-family:sans-serif;text-align:center'><div>"
                + "<p style='font-size:20px;font-weight:bold'>Sem conexão</p>"
                + "<p style='opacity:.7'>Confira a internet e tente de novo.</p>"
                + "<a href='" + url.replace("'", "%27") + "' style='display:inline-block;margin-top:12px;padding:12px 24px;"
                + "background:#E6C158;color:#0A1A33;border-radius:12px;font-weight:bold;text-decoration:none'>Tentar de novo</a>"
                + "</div></body></html>";
        web.loadDataWithBaseURL(INICIO, html, "text/html", "UTF-8", url);
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        if (pedido == ESCOLHER_ARQUIVO && arquivosPendentes != null) {
            Uri[] varios = multiplos(resultado, dados);
            arquivosPendentes.onReceiveValue(varios != null ? varios : WebChromeClient.FileChooserParams.parseResult(resultado, dados));
            arquivosPendentes = null;
            return;
        }
        super.onActivityResult(pedido, resultado, dados);
    }

    /** Vários arquivos escolhidos de uma vez chegam no ClipData (o parseResult só lê um). */
    private Uri[] multiplos(int resultado, Intent dados) {
        if (resultado != RESULT_OK || dados == null || dados.getClipData() == null) return null;
        Uri[] lista = new Uri[dados.getClipData().getItemCount()];
        for (int i = 0; i < lista.length; i++) lista[i] = dados.getClipData().getItemAt(i).getUri();
        return lista;
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
