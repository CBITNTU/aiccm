import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getPublicProfile } from "@/lib/deployment";
import { DeploymentProvider } from "@/lib/deployment/client";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  const { brand } = getPublicProfile();
  return {
    title: t("title", { brand: brand.name }),
    description: t("description", { brand: brand.name }),
    icons: { icon: brand.faviconPath },
  };
}

/**
 * Build a CSS override block from the active deployment's theme tokens. Empty
 * objects (e.g. the UK profile) produce no output, so globals.css defaults apply.
 */
function buildThemeStyle(theme: {
  light: Record<string, string>;
  dark: Record<string, string>;
}): string {
  const block = (selector: string, tokens: Record<string, string>) => {
    const entries = Object.entries(tokens);
    if (entries.length === 0) return "";
    const decls = entries.map(([k, v]) => `--${k}: ${v};`).join(" ");
    return `${selector}{${decls}}`;
  };
  return [block(":root", theme.light), block(".dark", theme.dark)]
    .filter(Boolean)
    .join("");
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const deployment = getPublicProfile();
  const themeStyle = buildThemeStyle(deployment.theme);

  return (
    <html lang={locale} suppressHydrationWarning>
      {themeStyle && (
        <head>
          <style
            id="deployment-theme"
            dangerouslySetInnerHTML={{ __html: themeStyle }}
          />
        </head>
      )}
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <DeploymentProvider profile={deployment}>
            <Providers>{children}</Providers>
          </DeploymentProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
