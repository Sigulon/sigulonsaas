"use client";

import {
  BookOpen,
  Radio,
  FileCode,
  ShieldCheck,
  Zap,
  Terminal,
  ExternalLink,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DocsPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-blue-600" />
          SIGULON Documentation
        </h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">
          Technical specifications, telephony architecture, and AI agent prompt guidelines.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="p-5">
          <Radio className="w-6 h-6 text-blue-600 mb-2" />
          <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
            Voice Runtime Path
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Plivo SIP &rarr; LiveKit Cloud WebRTC &rarr; Deepgram Nova-3 &rarr; Gemini 2.5 Flash &rarr; Cartesia Sonic 3.6.
          </p>
        </Card>

        <Card className="p-5">
          <Zap className="w-6 h-6 text-blue-600 mb-2" />
          <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
            Agent Bundle Graph
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Compiled node graphs with dynamic prompt injection, objection handling, and disposition tags.
          </p>
        </Card>

        <Card className="p-5">
          <ShieldCheck className="w-6 h-6 text-emerald-600 mb-2" />
          <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
            TRAI DNC Compliance
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Automated scrub against National Do Not Call registry before dial batch dispatch.
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Quick API Reference</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="bg-gray-900 text-gray-100 p-4 rounded-xl font-mono text-xs overflow-x-auto">
            <span className="text-emerald-400"># Trigger an instant AI lead call via cURL</span>
            <br />
            curl -X POST https://api.sigulon.ai/v1/calls/instant \
            <br />
            &nbsp;&nbsp;-H &quot;Authorization: Bearer sig_live_YOUR_KEY&quot; \
            <br />
            &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \
            <br />
            &nbsp;&nbsp;-d &apos;&#123;&quot;phone&quot;: &quot;+919848022338&quot;, &quot;agent_id&quot;: &quot;agent-ravi&quot;&#125;&apos;
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
