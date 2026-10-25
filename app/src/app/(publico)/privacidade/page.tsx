import type { Metadata } from "next";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacidadePage() {
  return (
    <>
      <h1>Política de privacidade</h1>
      <p>Atualizado em 25 de outubro de 2026. Esta política segue a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>

      <h2>1. Dados tratados</h2>
      <ul>
        <li>Dados da loja obtidos pelas APIs dos marketplaces autorizados: anúncios, preços, estoque, pedidos e entregas.</li>
        <li>Dados de compradores contidos nos pedidos (nome, CPF/CNPJ, endereço e telefone de entrega), necessários para expedição e emissão da nota fiscal.</li>
        <li>Dados de acesso ao sistema (nome e e-mail dos usuários internos).</li>
      </ul>

      <h2>2. Finalidade</h2>
      <p>
        Os dados são usados exclusivamente para gestão da loja: publicar e atualizar anúncios, acompanhar pedidos, emitir notas fiscais e cumprir
        obrigações legais e fiscais (bases legais: execução de contrato e cumprimento de obrigação legal).
      </p>

      <h2>3. Compartilhamento</h2>
      <p>
        Os dados não são vendidos nem compartilhados, exceto com a Secretaria da Fazenda (emissão de NF-e) e com o próprio marketplace de origem,
        quando necessário para a venda.
      </p>

      <h2>4. Armazenamento e segurança</h2>
      <ul>
        <li>Servidor próprio no Brasil, com acesso restrito, conexão HTTPS e verificação em duas etapas.</li>
        <li>Tokens dos marketplaces, senhas e certificado digital são guardados criptografados.</li>
        <li>Os dados fiscais são mantidos pelo prazo exigido pela legislação (5 anos); os demais, enquanto a conta estiver conectada.</li>
      </ul>

      <h2>5. Direitos do titular</h2>
      <p>
        O titular pode pedir confirmação, acesso, correção ou exclusão dos seus dados (respeitadas as obrigações fiscais) pelo e-mail
        kleber@arvirtual.com.br. O vendedor pode revogar a qualquer momento o acesso concedido ao marketplace.
      </p>
    </>
  );
}
