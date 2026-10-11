import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Liquidation Hub", template: "%s · Liquidation Hub" },
  description:
    "Source verified overstock, open-box electronics, and wholesale liquidation lots at up to 70% off retail prices.",
  applicationName: "Liquidation Hub",
  openGraph: {
    siteName: "Liquidation Hub",
    title: "Liquidation Hub: Exclusive Deals on Overstock & Liquidation Inventory",
    description:
      "Source verified overstock, open-box electronics, and wholesale liquidation lots at up to 70% off retail prices.",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#0c0e11", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
