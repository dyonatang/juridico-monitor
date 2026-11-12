import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jurídico Monitor",
  description: "Monitoramento de processos judiciais do grupo",
  applicationName: "Jurídico Monitor",
  // ?v=2: ícones do visual 2.0 (12/11/2026) — muda o endereço para o navegador não usar o antigo guardado.
  manifest: "/manifest.webmanifest?v=2",
  icons: {
    icon: [
      { url: "/icon.svg?v=2", type: "image/svg+xml" },
      { url: "/favicon.png?v=2", type: "image/png", sizes: "64x64" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Jurídico",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#050b18",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const SCRIPT_TEMA = "try{var m=document.cookie.match(/(?:^|; )tema=(light|dark)/);if(m)document.documentElement.dataset.theme=m[1]}catch(e){}";

/** Tema: escuro por padrão (visual 2.0); "claro" quando a pessoa escolhe no menu (cookie `tema`). */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tema = (await cookies()).get("tema")?.value === "light" ? "light" : "dark";
  return (
    <html lang="pt-BR" data-theme={tema} suppressHydrationWarning>
      <head>
        {/* Pelo endereço dfv-juridico.web.app o cookie `tema` não chega ao servidor (o Hosting só
            repassa `__session`): aplica a escolha no navegador antes de desenhar a tela. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <div className="fundo" aria-hidden="true"><i /><i /><i /></div>
        {children}
      </body>
    </html>
  );
}
