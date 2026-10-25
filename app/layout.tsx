import type { Metadata, Viewport } from "next";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/sometype-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Worklog",
  description: "A private work-session timer and ledger.",
  applicationName: "Worklog",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Worklog",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#e6eae2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
