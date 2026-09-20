"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return setError("This reset link is missing its token.");
    if (password !== confirmation) return setError("The passwords do not match.");
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", token, newPassword: password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to reset your password.");
      setComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset your password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <Radio className="mx-auto mb-2 h-8 w-8 text-violet-600" />
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>Your existing sessions will be signed out.</CardDescription>
      </CardHeader>
      <CardContent>
        {complete ? (
          <div className="space-y-4 text-center text-sm"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" /><p>Your password has been reset.</p><Link className="text-violet-600 hover:underline" href="/login">Sign in</Link></div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            {error && <p className="flex gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password (minimum 8 characters)" minLength={8} required />
            <Input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirm new password" minLength={8} required />
            <Button className="w-full" disabled={loading || !token} type="submit">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset password"}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return <div className="flex min-h-screen items-center justify-center bg-stone-50 p-4 dark:bg-stone-950"><Suspense fallback={<div className="text-sm text-stone-500">Loading reset link…</div>}><ResetPasswordForm /></Suspense></div>;
}
