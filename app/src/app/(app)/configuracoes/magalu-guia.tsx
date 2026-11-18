import { Copiavel } from "@/components/copiavel";
import { MAGALU_SCOPES, MAGALU_SCOPES_ETIQUETA } from "@/lib/marketplaces/magalu";

/** Passo a passo do ID Magalu: o Client ID/Secret saem do `idm client create` (não são as chaves da Magalu Cloud). */
export function MagaluGuia({ base, clientId }: { base: string; clientId: string }) {
  const redirect = `${base}/api/marketplaces/magalu/callback`;
  const partes = [
    "client create",
    `  --name "ArVirtual"`,
    `  --description "Sistema de gestão da ArVirtual: anúncios, pedidos, entregas e notas fiscais"`,
    `  --terms-of-use "${base}/termos"`,
    `  --privacy-term "${base}/privacidade"`,
    `  --redirect-uris "${redirect}"`,
    `  --audience "https://api.magalu.com https://services.magalu.com"`,
    `  --scopes "${MAGALU_SCOPES} ${MAGALU_SCOPES_ETIQUETA}"`,
    `  --scopes-default "${MAGALU_SCOPES} ${MAGALU_SCOPES_ETIQUETA}"`,
    "  --access-token-exp 7200",
    "  --always-require-login false",
  ];
  // Windows (PowerShell): uma linha só. Linux/macOS: quebras com "\".
  const comandoWindows = `.\\idm.exe ${partes.map((p) => p.trim()).join(" ")}`;
  const comando = `./idm ${partes.join(" \\\n")}`;
  const consentimento = clientId
    ? `https://id.magalu.com/login?${new URLSearchParams({ client_id: clientId, redirect_uri: redirect, scope: MAGALU_SCOPES, response_type: "code", choose_tenants: "true" })}`
    : "";

  // App já criado: só adiciona a permissão de logística (etiquetas).
  const addScope = [
    "client add-scope",
    `  --client-uuid "${clientId || "SEU_CLIENT_ID"}"`,
    `  --scopes "${MAGALU_SCOPES_ETIQUETA}"`,
    `  --scopes-default "${MAGALU_SCOPES_ETIQUETA}"`,
    `  --reason "Gerar e imprimir as etiquetas de envio dos pedidos pelo sistema de gestão"`,
  ];
  return (
    <div className="grid gap-3">
      <p>
        <b>Atenção:</b> API Key, API Key ID e API Key Secret são da Magalu Cloud e não servem aqui. O Client ID e o Client Secret saem do{" "}
        <a className="text-gold underline" href="https://github.com/luizalabs/id-magalu-cli/releases/latest" target="_blank" rel="noreferrer">
          IDM CLI (luizalabs/id-magalu-cli)
        </a>
        :
      </p>
      <ol className="ml-4 grid list-decimal gap-1">
        <li>
          Baixe o <code>idm-windows-….exe</code> (ou a versão do seu sistema), renomeie para <code>idm.exe</code> e, no PowerShell da mesma pasta, rode{" "}
          <code>.\idm.exe login</code> (aprove “Criar client” e “Atualizar client”).
        </li>
        <li>Rode o comando abaixo e copie o Client ID e o Client Secret que ele mostrar (o secret não aparece de novo).</li>
        <li>Cole os dois aqui e salve. Depois, em Marketplaces, clique em Conectar Magalu e entre com a conta da loja (CNPJ).</li>
      </ol>
      <Copiavel rotulo="Comando (Windows PowerShell)" texto={comandoWindows} />
      <Copiavel rotulo="Comando (Linux/macOS)" texto={comando} />
      <Copiavel rotulo="URL de consentimento da ArVirtual (botão Conectar)" texto={`${base}/api/marketplaces/magalu/conectar`} />
      <Copiavel rotulo="Redirect URI" texto={redirect} />
      {consentimento ? <Copiavel rotulo="URL de consentimento do ID Magalu (para teste)" texto={consentimento} /> : null}
      <p className="mt-2">
        <b>Etiquetas pela API (app já criado):</b> rode o comando abaixo no PowerShell (mesma pasta do <code>idm.exe</code>, depois do{" "}
        <code>.\idm.exe login</code>), ligue <b>Etiquetas pela API</b> aqui em cima, salve e, em Marketplaces › Magalu, clique em <b>Conectar conta</b> de novo para
        aceitar a nova permissão.
      </p>
      <Copiavel rotulo="Adicionar permissão de etiquetas (Windows PowerShell)" texto={`.\\idm.exe ${addScope.map((p) => p.trim()).join(" ")}`} />
      <p>
        Termos: <a className="text-gold underline" href={`${base}/termos`} target="_blank" rel="noreferrer">{base}/termos</a> · Privacidade:{" "}
        <a className="text-gold underline" href={`${base}/privacidade`} target="_blank" rel="noreferrer">{base}/privacidade</a>
      </p>
    </div>
  );
}
