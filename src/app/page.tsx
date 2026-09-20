"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  CheckCircle2,
  Loader2,
  Mic,
  PhoneCall,
  Radio,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

const LANGUAGES = [
  "Hindi",
  "Telugu",
  "Tamil",
  "Kannada",
  "Malayalam",
  "Marathi",
  "Bengali",
  "Gujarati",
  "Punjabi",
  "Indian English",
];

const FAQS = [
  {
    question: "How does Sigulon work?",
    answer:
      "Describe your business once and Sigulon designs a voice agent for it. Attach a phone number, then let the agent answer inbound calls or dial your campaign lists automatically.",
  },
  {
    question: "What does it cost?",
    answer:
      "You pay only for talk time at ₹3.5 per minute, settled from your credit balance. Reserved estimates are held while a call is live and settled when it completes.",
  },
  {
    question: "Which languages can agents speak?",
    answer:
      "Agents speak Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia, Assamese, and Indian English.",
  },
  {
    question: "How do inbound calls reach my agent?",
    answer:
      "Register your Plivo number on the Numbers page and attach it to an agent. Inbound calls to that number are answered by the agent immediately.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data.user) {
            router.replace("/dashboard");
            return;
          }
        }
      } catch {
        // Stay on the landing page when the session check fails.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
        <Loader2 className="h-6 w-6 animate-spin text-violet-600" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#171321]">
      {/* Nav */}
      <header className="border-b border-stone-200/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-content-center rounded-xl bg-violet-600 text-white">
              <Radio className="h-5 w-5" />
            </div>
            <span className="text-base font-bold tracking-tight">Sigulon</span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section className="py-14 text-center sm:py-20">
          <p className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-700">
            <Sparkles className="h-3.5 w-3.5" />
            Your AI calling team, ready in minutes
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Every call answered,{" "}
            <span className="bg-gradient-to-r from-violet-600 to-[#C9952B] bg-clip-text text-transparent">
              every lead followed up
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-stone-600">
            Sigulon builds voice agents that speak your customers&apos; language —
            answering inbound calls and dialing your lists while you get on with
            the day.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 shadow-sm">
            <Wallet className="h-4 w-4 text-violet-600" />
            <span className="text-sm font-semibold">₹3.5/min</span>
            <span className="text-sm text-stone-500">pay only for talk time</span>
          </div>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-xl bg-[#C9952B] px-7 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#A8781F]"
            >
              Build your calling team
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-stone-200 bg-white px-7 py-3 text-sm font-semibold text-stone-800 hover:bg-stone-50"
            >
              Sign in to workspace
            </Link>
          </div>
        </section>

        {/* Team preview built from real stat shapes */}
        <section className="pb-14">
          <div className="overflow-hidden rounded-[20px] border border-stone-200/70 bg-white shadow-[0_8px_30px_rgba(30,20,60,0.08)]">
            <div className="border-b border-stone-100 px-6 py-4">
              <p className="text-sm font-semibold">Your whole team, at a glance</p>
              <p className="mt-0.5 text-xs text-stone-500">
                A preview of the workspace: greeting, live stats, agents on shift,
                and what needs your attention.
              </p>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Bot, label: "Agents working", value: "Your agents, on shift" },
                { icon: PhoneCall, label: "Conversations", value: "Every call logged" },
                { icon: Users, label: "Qualified leads", value: "Outcomes tracked" },
                { icon: Wallet, label: "Credits spent", value: "Pay per talk minute" },
              ].map((tile) => (
                <div key={tile.label} className="rounded-2xl bg-[#FAF8F5] p-4">
                  <tile.icon className="h-5 w-5 text-violet-600" />
                  <p className="mt-2 text-sm font-semibold">{tile.label}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{tile.value}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 border-t border-stone-100 px-6 py-4 sm:flex-row sm:items-center">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Live agent row with status
              </span>
              <span className="text-xs text-stone-500">
                Agents show a status pill and today&apos;s calls; the attention
                list flags callbacks and failed dials.
              </span>
            </div>
          </div>
        </section>

        {/* Language strip */}
        <section className="pb-14 text-center">
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
            <Mic className="h-4 w-4 text-violet-600" />
            Agents speak your customers&apos; language
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {LANGUAGES.map((language) => (
              <span
                key={language}
                className="rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700"
              >
                {language}
              </span>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="pb-14">
          <h2 className="text-center text-2xl font-bold tracking-tight">Simple talk-time pricing</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-stone-500">
            No seats, no setup fees. Top up credits and every answered minute
            settles from your balance.
          </p>
          <div className="mx-auto mt-6 grid max-w-3xl gap-4 sm:grid-cols-3">
            {[
              { name: "Starter", price: "₹3.5/min", detail: "Same rate, from the first call" },
              { name: "Growth", price: "₹3.5/min", detail: "Bulk campaigns with DNC filtering" },
              { name: "Scale", price: "₹3.5/min", detail: "Dedicated lines and priority queues" },
            ].map((tier) => (
              <div
                key={tier.name}
                className="rounded-[20px] border border-stone-200/70 bg-white p-5 text-center shadow-[0_8px_30px_rgba(30,20,60,0.08)]"
              >
                <p className="text-sm font-semibold">{tier.name}</p>
                <p className="mt-1 text-2xl font-bold text-violet-700">{tier.price}</p>
                <p className="mt-1 text-xs text-stone-500">{tier.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="pb-20">
          <h2 className="text-center text-2xl font-bold tracking-tight">Questions, answered</h2>
          <div className="mx-auto mt-6 max-w-2xl space-y-3">
            {FAQS.map((faq) => (
              <details
                key={faq.question}
                className="rounded-2xl border border-stone-200/70 bg-white px-5 py-4"
              >
                <summary className="cursor-pointer text-sm font-semibold">{faq.question}</summary>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200/60 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-stone-500 sm:flex-row sm:px-6">
          <span className="flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-violet-600" />
            Sigulon — your AI calling team
          </span>
          <span>Pay only for talk time · ₹3.5/min</span>
        </div>
      </footer>
    </div>
  );
}
