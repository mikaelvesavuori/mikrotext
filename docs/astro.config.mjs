// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://mikrosuite.com",
  base: "/text/docs",
  integrations: [
    starlight({
      title: "MikroText Docs",
      description:
        "Documentation for MikroText, short-lived encrypted text rooms with no accounts and no server-readable messages.",
      favicon: "/favicon.svg",
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/mikaelvesavuori/mikrotext",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "What is MikroText?", slug: "getting-started/intro" },
            { label: "Installation", slug: "getting-started/installation" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Configuration", slug: "guides/configuration" },
            { label: "Deployment", slug: "guides/deployment" },
            { label: "Security Model", slug: "guides/security-model" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Architecture", slug: "reference/architecture" },
            { label: "API Reference", slug: "reference/api" },
            { label: "Comparison", slug: "reference/comparison" },
          ],
        },
      ],
    }),
  ],
});
