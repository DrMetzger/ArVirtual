/** @type {import("next").NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["postgres", "nodemailer", "@brasil-fiscal/nfe", "node-forge", "js-brasil", "pdfkit"],
  experimental: {
    // Upload de imagens (até 5 MB cada) e vídeos (até 30 MB cada) de produto.
    serverActions: { bodySizeLimit: "150mb" },
  },
};

export default nextConfig;
