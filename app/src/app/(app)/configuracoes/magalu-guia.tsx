import { Copiavel } from "@/components/copiavel";
import { MAGALU_SCOPES } from "@/lib/marketplaces/magalu";

/** Passo a passo do ID Magalu: o Client ID/Secret saem do `idm client create` (não são as chaves da Magalu Cloud). */
export function MagaluGuia({ base, clientId }: { base: string; clientId: string }) {
  const redirect = `${base}/api/marketplaces/magalu/callback`;
  const comando = [
    "./idm client create",
    `  --name "ArVirtual"`,
    `  --description "Sistema de gestão da ArVirtual: anúncios, pedidos, entregas e notas fiscais"`,
    `  --terms-of-use "${base}/termos"`,
    `  --privacy-term "${base}/privacidade"`,
    `  --redirect-uris "${redirect}"`,
    `  --audience "https://api.magalu.com https://services.magalu.com"`,
    `  --scopes "${MAGALU_SCOPES}"`,
    `  --scopes-default "${MAGALU_SCOPES}"`,
    "  --access-token-exp 7200",
    "  --always-require-login false",
  ].join(" \\\n");
  const consentimento = clientId
    ? `https://id.magalu.com/login?${new URLSearchParams({ client_id: clientId, redirect_uri: redirect, scope: MAGALU_SCOPES, response_type: "code", choose_tenants: "true" })}`
    : "";

  return (
    <div className="grid gap-3">
      <p>
        <b>Atenção:</b> API Key, API Key ID e API Key Secret são da Magalu Cloud e não servem aqui. O Client ID e o Client Secret saem do{" "}
        <a className="text-gold underline" href="https://developers.magalu.com/docs/first-steps/create-an-application/create-application" target="_blank" rel="noreferrer">
          IDM CLI
        </a>
        :
      </p>
      <ol className="ml-4 grid list-decimal gap-1">
        <li>Baixe o <code>idm</code> e rode <code>./idm login</code> (aprove “Criar client” e “Atualizar client”).</li>
        <li>Rode o comando abaixo e copie o Client ID e o Client Secret que ele mostrar (o secret não aparece de novo).</li>
        <li>Cole os dois aqui e salve. Depois, em Marketplaces, clique em Conectar Magalu e entre com a conta da loja (CNPJ).</li>
      </ol>
      <Copiavel rotulo="Comando" texto={comando} />
      <Copiavel rotulo="URL de consentimento da ArVirtual (botão Conectar)" texto={`${base}/api/marketplaces/magalu/conectar`} />
      <Copiavel rotulo="Redirect URI" texto={redirect} />
      {consentimento ? <Copiavel rotulo="URL de consentimento do ID Magalu (para teste)" texto={consentimento} /> : null}
      <p>
        Termos: <a className="text-gold underline" href={`${base}/termos`} target="_blank" rel="noreferrer">{base}/termos</a> · Privacidade:{" "}
        <a className="text-gold underline" href={`${base}/privacidade`} target="_blank" rel="noreferrer">{base}/privacidade</a>
      </p>
    </div>
  );
}
