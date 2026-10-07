import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const interSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SIGULON — AI Voice Calling Agents Platform",
  description: "Enterprise AI voice calling agents platform for SMBs. Create agents, launch instant lead calls, bulk campaigns, and manage inbound voice operations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${interSans.variable} ${jetbrainsMono.variable} ${sourceSerif.variable} h-full antialiased`}
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
                  if (node.hasAttribute('fdprocessedid')) node.removeAttribute('fdprocessedid');
                  for (var i = node.attributes.length - 1; i >= 0; i--) {
                    var name = node.attributes[i].name;
                    if (
                      name.indexOf('__processed_') === 0 ||
                      name.indexOf('data-dashlane') === 0 ||
                      name.indexOf('data-lp') === 0 ||
                      name.indexOf('data-lastpass') === 0 ||
                      name.indexOf('data-1p') === 0 ||
                      name === 'fdprocessedid'
                    ) {
                      node.removeAttribute(name);
                    }
                  }
                }
                function cleanTree(root) {
                  if (!root) return;
                  cleanNode(root);
                  var els = root.querySelectorAll ? root.querySelectorAll('[bis_skin_checked],[bis_register],[fdprocessedid],[data-lastpass-root]') : [];
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
                  attributeFilter: ['bis_skin_checked', 'bis_register', 'fdprocessedid']
                });
                window.addEventListener('DOMContentLoaded', function() {
                  cleanTree(document.documentElement);
                  setTimeout(function() { cleanTree(document.documentElement); }, 50);
                  setTimeout(function() { cleanTree(document.documentElement); }, 200);
                  setTimeout(function() { obs.disconnect(); }, 5000);
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
