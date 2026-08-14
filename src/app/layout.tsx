import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Manrope, JetBrains_Mono } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import "katex/dist/katex.min.css";
import "./globals.css";

// Триада вместо одного Inter: засечный дисплей для заголовков даёт
// академический характер, гротеск ведёт интерфейс, моноширинный держит
// числа и коды схемы оценивания.
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display",
});

const sans = Manrope({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-sans",
});

const mono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Further Mathematics — задачи, разборы, домашка",
    template: "%s · Further Mathematics",
  },
  description:
    "Некоммерческая платформа подготовки к A-Level Further Mathematics. Задачи в формате экзаменационного билета, схема оценивания по баллам, пошаговые разборы на русском. Edexcel и Cambridge раздельно.",
  openGraph: {
    title: "Further Mathematics",
    description:
      "Задачи в формате экзаменационного билета, схема оценивания по баллам и разборы на русском.",
    type: "website",
    locale: "ru_RU",
  },
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#141620"/><text x="16" y="22" font-family="Georgia,serif" font-size="17" fill="#F5C86B" text-anchor="middle">ƒ</text></svg>`,
          ),
        type: "image/svg+xml",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF9F5" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1118" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Перейти к содержимому
        </a>
        {/* Зерно поверх всего: убирает цифровую стерильность плоских заливок.
            pointer-events отключены, кликам не мешает. */}
        <div className="grain" aria-hidden />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
