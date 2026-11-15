import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

export const metadata: Metadata = {
  title: "JAGA — Your chaotic friend",
  description: "A sarcastic AI friend. No login, no fuss. Just JAGA.",
  applicationName: "JAGA",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "JAGA",
    statusBarStyle: "black",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090909",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
