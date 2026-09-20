import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const interSans = Inter({
  variable: "--font-inter-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sigulon",
  description: "Sigulon AI voice-agent workspace — agents, campaigns, calls, and billing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${interSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function cleanNode(node) {
                  if (!node || node.nodeType !== 1) return;
                  if (node.hasAttribute('bis_skin_checked')) node.removeAttribute('bis_skin_checked');
                  if (node.hasAttribute('bis_register')) node.removeAttribute('bis_register');
                  for (var i = node.attributes.length - 1; i >= 0; i--) {
                    var name = node.attributes[i].name;
                    if (name.indexOf('__processed_') === 0) {
                      node.removeAttribute(name);
                    }
                  }
                }
                function cleanTree(root) {
                  if (!root) return;
                  cleanNode(root);
                  var els = root.querySelectorAll ? root.querySelectorAll('[bis_skin_checked],[bis_register]') : [];
                  for (var i = 0; i < els.length; i++) cleanNode(els[i]);
                }
                cleanTree(document.documentElement);
                var obs = new MutationObserver(function(muts) {
                  for (var i = 0; i < muts.length; i++) {
                    var m = muts[i];
                    cleanNode(m.target);
                    if (m.addedNodes) {
                      for (var j = 0; j < m.addedNodes.length; j++) {
                        cleanTree(m.addedNodes[j]);
                      }
                    }
                  }
                });
                obs.observe(document.documentElement, {
                  attributes: true,
                  childList: true,
                  subtree: true,
                  attributeFilter: ['bis_skin_checked', 'bis_register']
                });
                window.addEventListener('DOMContentLoaded', function() {
                  cleanTree(document.documentElement);
                  setTimeout(function() { cleanTree(document.documentElement); }, 100);
                  setTimeout(function() { obs.disconnect(); }, 4000);
                });
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
