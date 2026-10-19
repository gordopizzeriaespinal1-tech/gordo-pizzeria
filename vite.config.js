import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Gordo Pizzería",
        short_name: "Gordo",
        description: "Punto de venta de Gordo Pizzería",
        lang: "es",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#F4E1C8",
        theme_color: "#822D1B",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // La app es de un solo archivo: se guarda completa para abrir sin internet.
        globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
      },
    }),
  ],
});
