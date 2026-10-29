package br.com.arvirtual.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * App Android do ERP ArVirtual: abre o sistema (app.arvirtual.com.br) numa tela própria, com login guardado,
 * envio de fotos/arquivos, downloads e links externos (Shopee, Mercado Livre, WhatsApp) abrindo no app certo.
 */
public class MainActivity extends Activity {
    private static final String HOST = "app.arvirtual.com.br";
    private static final String INICIO = "https://" + HOST + "/";
    private static final int ESCOLHER_ARQUIVO = 1;

    private WebView web;
    private ValueCallback<Uri[]> arquivosPendentes;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0A1A33"));
        web.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        // O site reconhece o app (esconde o botão "baixar o app" e ajusta o que precisar).
        s.setUserAgentString(s.getUserAgentString() + " ArVirtualApp/" + BuildConfig.VERSION_NAME);

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
