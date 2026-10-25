/** @type {import("next").NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Commit do deploy: se o navegador estiver com uma versão anterior, a navegação recarrega a página.
  deploymentId: process.env.DEPLOY_ID || undefined,
  serverExternalPackages: ["postgres", "nodemailer", "@brasil-fiscal/nfe", "node-forge", "js-brasil", "pdfkit"],
  experimental: {
    // Upload de imagens (até 5 MB cada) e vídeos (até 30 MB cada) de produto.
    serverActions: { bodySizeLimit: "150mb" },
  },
};

export default nextConfig;
