"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function AcceptInviteForm() {
  const token = useSearchParams().get("token") || "";
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to accept invitation.");
      setComplete(true);
      setTimeout(() => router.push("/dashboard"), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to accept invitation.");
    } finally {
      setLoading(false);
    }
  };

  return <Card className="w-full max-w-md shadow-xl"><CardHeader className="text-center"><Radio className="mx-auto mb-2 h-8 w-8 text-indigo-600" /><CardTitle>Join your workspace</CardTitle><CardDescription>Set a password to activate your invited account.</CardDescription></CardHeader><CardContent>{complete ? <div className="text-center text-sm"><CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-emerald-600" />Invitation accepted. Opening your workspace…</div> : <form className="space-y-4" onSubmit={submit}>{error && <p className="flex gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Choose a password (minimum 8 characters)" minLength={8} required /><Button className="w-full" disabled={loading || !token} type="submit">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept invitation"}</Button><p className="text-center text-xs text-slate-500">Already have this account? <Link className="text-indigo-600 hover:underline" href="/login">Sign in first</Link>, then open the invite link again.</p></form>}</CardContent></Card>;
}

export default function AcceptInvitePage() {
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950"><Suspense fallback={<div className="text-sm text-slate-500">Loading invitation…</div>}><AcceptInviteForm /></Suspense></div>;
}
