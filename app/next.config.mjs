/** @type {import("next").NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["postgres", "nodemailer", "@brasil-fiscal/nfe", "node-forge", "js-brasil", "pdfkit"],
  experimental: {
    // Upload de imagens de produto (até 5 MB cada).
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
