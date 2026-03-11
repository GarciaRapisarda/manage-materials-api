import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admin Materiales",
  description: "Herramienta local para administrar materiales de construcción",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
