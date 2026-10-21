import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { BRAND } from "@/lib/brand";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Inter carries the UI text; the brand wordmark is an image (public/logo-wordmark.png)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"], // latin-ext covers Turkish characters (ı, ş, ğ)
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} – ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    "Threads, LinkedIn ve X hesaplarını bağla; tek yerden gönderi oluştur, planla ve otomatik yayınla.",
};

export const viewport: Viewport = {
  themeColor: "#0e1b2b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The app is dark-only, so the `dark` class is always present
    <html
      lang="tr"
      className={`${inter.variable} ${geistMono.variable} dark h-full`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <TooltipProvider>{children}</TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
