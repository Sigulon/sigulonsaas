"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to request a password reset.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request a password reset.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 p-4 dark:bg-stone-950">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <Radio className="mx-auto mb-2 h-8 w-8 text-violet-600" />
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>Enter your account email and we&apos;ll send a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center text-sm">
              <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
              <p>If an account exists for that email, a reset link has been sent.</p>
              <Link className="text-violet-600 hover:underline" href="/login">Back to sign in</Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              {error && <p className="flex gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required />
              <Button className="w-full" disabled={loading} type="submit">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
              </Button>
              <p className="text-center text-xs text-stone-500"><Link className="text-violet-600 hover:underline" href="/login">Back to sign in</Link></p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
