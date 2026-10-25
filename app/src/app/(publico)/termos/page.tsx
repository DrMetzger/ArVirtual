import type { Metadata } from "next";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermosPage() {
  return (
    <>
      <h1>Termos de uso</h1>
      <p>Atualizado em 25 de outubro de 2026.</p>

      <h2>1. O que é o sistema</h2>
      <p>
        O sistema de gestão da ArVirtual (app.arvirtual.com.br) é de uso interno da ArVirtual Pesquisa &amp; Desenvolvimento. Ele integra a loja da
        ArVirtual com marketplaces (Mercado Livre, Shopee e Magalu) para publicar anúncios, atualizar preço e estoque, importar pedidos e emitir
        notas fiscais.
      </p>

      <h2>2. Autorização de acesso aos marketplaces</h2>
      <p>
        Ao conectar uma conta de vendedor, o titular autoriza o sistema a acessar, pela API oficial do marketplace, apenas os dados e ações dos
        escopos exibidos na tela de consentimento: catálogo (produtos, preços e estoque), pedidos, entregas e notas fiscais da própria loja.
      </p>
      <ul>
        <li>O acesso pode ser revogado a qualquer momento no painel do marketplace ou pelo botão Desconectar do sistema.</li>
        <li>Os tokens de acesso são guardados criptografados e nunca são compartilhados com terceiros.</li>
        <li>O sistema não acessa dados de outros vendedores nem realiza ações fora dos escopos autorizados.</li>
      </ul>

      <h2>3. Responsabilidades</h2>
      <p>
        O usuário é responsável pelas informações cadastradas (produtos, preços, dados fiscais) e pelas ações executadas com sua conta. Anúncios e
        pedidos seguem também as regras de cada marketplace.
      </p>

      <h2>4. Disponibilidade</h2>
      <p>
        O sistema é oferecido como está. A ArVirtual faz o possível para mantê-lo disponível, mas interrupções podem ocorrer por manutenção ou por
        indisponibilidade das APIs dos marketplaces.
      </p>

      <h2>5. Contato</h2>
      <p>Dúvidas sobre estes termos: kleber@arvirtual.com.br.</p>
    </>
  );
}
