import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ERP Navyx",
  description: "Gestión interna del equipo de Navyx",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: algunas extensiones del navegador (LanguageTool
          `data-lt-installed`, ColorZilla `cz-shortcut-listen`) inyectan atributos
          en <html>/<body> antes de hidratar; esto calla ese aviso benigno. */}
      <body suppressHydrationWarning className="min-h-full">
        {children}
      </body>
    </html>
  );
}
