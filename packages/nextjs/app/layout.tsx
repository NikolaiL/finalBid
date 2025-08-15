import { Rubik } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import RefSessionHandler from "~~/components/RefSessionHandler";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: process.env.NEXT_PUBLIC_APP_NAME || "FireBid",
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || "Outburn Outlast Outbid",
});

const rubik = Rubik({
  subsets: ["latin"],
  weight: ["300", "400", "700", "800"],
  display: "swap",
  variable: "--font-rubik",
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning className={`${rubik.variable}`}>
      <body>
        <ThemeProvider enableSystem>
          <ScaffoldEthAppWithProviders>
            <RefSessionHandler />
            {children}
          </ScaffoldEthAppWithProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
