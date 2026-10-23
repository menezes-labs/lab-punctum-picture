import type { Metadata } from "next";
import "./albuns.css";
export const metadata: Metadata = {
  title: {
    default: "Seus álbuns — Punctum Picture",
    template: "%s — Punctum Picture",
  },
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default function AlbumsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="private-albums">{children}</div>;
}
