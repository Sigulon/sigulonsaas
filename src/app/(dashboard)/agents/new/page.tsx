"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mic,
  MicOff,
  Sparkles,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  AlertCircle,
  FileText,
  CheckCircle2,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const TEMPLATE_CHIPS = [
  {
    name: "Real estate",
    text: "We are a real estate company in Hyderabad selling open villa plots in Shadnagar. The agent should call new enquiries within 2 minutes, check their investment budget and preferred plot size, answer questions about DTCP approvals, and book weekend site visits with free car pickup.",
  },
  {
    name: "Insurance",
    text: "We are an insurance agency in Hyderabad helping four-wheeler vehicle owners renew motor insurance. The agent should call prospective leads, ask about car model and current policy expiry, check No Claim Bonus eligibility, and send top renewal quotes directly to their WhatsApp.",
  },
  {
    name: "Education/coaching",
    text: "We are an educational coaching institute in Vijayawada offering long-term NEET and JEE coaching. The agent should call parents and students who enquired online, understand their current class and marks, and schedule a free offline counseling session.",
  },
  {
    name: "Clinic",
    text: "We are a dental care clinic in Banjara Hills, Hyderabad. The agent should call patients due for routine dental checkups, confirm any current dental issues or pain, and book a convenient 20-minute appointment slot with our specialist.",
  },
  {
    name: "Services",
    text: "We are a residential solar rooftop installation company in Telangana. The agent should call homeowners, qualify if their monthly electricity bill exceeds ₹4,000, explain government solar subsidy benefits, and book a free rooftop solar feasibility visit.",
  },
];

type ProgressStep = "understanding" | "designing" | "writing" | "validating" | "saving" | null;

export default function CreateAgentPage() {
  const router = useRouter();

  // Mode and Language settings
  const [mode, setMode] = useState<"bulk" | "instant" | "inbound">("bulk");
  const [language, setLanguage] = useState("te-IN");
  const [agentName, setAgentName] = useState("");
  const [gender, setGender] = useState<"female" | "male">("female");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Write mode state
  const [writtenDescription, setWrittenDescription] = useState("");

  // Speak mode state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [spokenTranscript, setSpokenTranscript] = useState("");
  const [speakError, setSpeakError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<ProgressStep>(null);
  const [progressMessage, setProgressMessage] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Clean up audio & timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => null);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Format recording timer seconds to MM:SS
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
  };

  // Start audio waveform meter
  const startAudioMeter = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();
    } catch {
      // Audio level meter is an enhancement; proceed if Web Audio is restricted
    }
  };

  // Stop recording handler
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  // Browser Web Speech fallback if server STT fails
  const runWebSpeechFallback = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        const SpeechRecognition =
          (window as unknown as { SpeechRecognition: any; webkitSpeechRecognition: any }).SpeechRecognition ||
          (window as unknown as { SpeechRecognition: any; webkitSpeechRecognition: any }).webkitSpeechRecognition;

        if (!SpeechRecognition) {
          reject(new Error("Browser speech recognition is not supported in this browser."));
          return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = language === "te-IN" ? "te-IN" : language === "hi-IN" ? "hi-IN" : "en-IN";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          resolve(text);
        };
        recognition.onerror = (e: any) => {
          reject(new Error(`Speech recognition error: ${e.error}`));
        };
        recognition.start();
      }),
    [language]
  );

  // Start recording
  const startRecording = async () => {
    setSpeakError(null);
    audioChunksRef.current = [];
    setRecordSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startAudioMeter(stream);

      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
          audioCtxRef.current.close().catch(() => null);
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || "audio/webm",
        });

        if (audioBlob.size < 1000) {
          setSpeakError("No clear speech detected. Please press the mic and speak clearly.");
          return;
        }

        // Send to POST /api/agents/transcribe
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("file", audioBlob, "user-audio.webm");
          formData.append("language", language);

          const res = await fetch("/api/agents/transcribe", {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            if (data.transcript && data.transcript.trim()) {
              setSpokenTranscript(data.transcript.trim());
              setSpeakError(null);
            } else {
              setSpeakError("No speech recognized in the recording. You can re-record or type your business description.");
            }
          } else {
            // Server STT failed: attempt browser Web Speech fallback
            console.warn("Server STT returned error, attempting browser fallback");
            const fallbackText = await runWebSpeechFallback().catch(() => "");
            if (fallbackText) {
              setSpokenTranscript(fallbackText);
            } else {
              setSpeakError("Speech transcription failed. Please check your microphone or type your business info below.");
            }
          }
        } catch (err) {
          console.error("Audio upload error:", err);
          setSpeakError("Could not connect to transcription service. Please check your network or type your description.");
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start(250);
      setIsRecording(true);

      // Start 3-minute countdown timer (180s)
      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev >= 179) {
            stopRecording();
            return 180;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setSpeakError("Microphone permission was denied. Please allow microphone access in your browser settings.");
      } else {
        setSpeakError("Unable to access microphone. Please check your audio devices or type your description.");
      }
    }
  };

  // Trigger agent generation with SSE progress streaming
  const handleGenerate = async (descriptionToUse: string) => {
    const desc = descriptionToUse.trim();
    if (desc.length < 20) {
      setGenerationError("Please enter at least 20 characters describing your business.");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setProgressStep("understanding");
    setProgressMessage("Understanding your business…");

    try {
      const response = await fetch("/api/agents/generate?stream=true", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          description: desc,
          mode,
          language,
          agentName: agentName.trim() || undefined,
          gender,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Generation failed (${response.status})`);
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let agentId: string | null = null;

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data:")) {
              try {
                const data = JSON.parse(trimmed.replace(/^data:\s*/, ""));
                if (data.step) {
                  setProgressStep(data.step as ProgressStep);
                }
                if (data.message) {
                  setProgressMessage(data.message);
                }
                if (data.agentId) {
                  agentId = data.agentId;
                }
                if (data.step === "error" || data.error) {
                  throw new Error(data.error || "Generation pipeline error");
                }
              } catch (e: any) {
                if (e.message && !e.message.includes("JSON")) throw e;
              }
            }
          }
        }
      }

      if (agentId) {
        router.push(`/agents/${agentId}/edit`);
      } else {
        router.push("/agents");
      }
    } catch (err: any) {
      console.error("Agent generation error:", err);
      setGenerationError(err.message || "Failed to generate agent. Please try again.");
      setIsGenerating(false);
      setProgressStep(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-4 sm:py-8 px-4 space-y-8">
      {/* Top Header */}
      <div>
        <Link
          href="/agents"
          className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1.5 mb-2 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to all agents
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <span>Create your AI agent</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Bundle v2
              </span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Speak or write in Telugu, Hindi, or English. Sigulon designs the entire call script, qualification flow, and FAQs.
            </p>
          </div>
        </div>
      </div>

      {/* Generation Error Banner */}
      {generationError && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30 p-4 text-red-700 dark:text-red-300 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <div className="text-xs sm:text-sm">
            <p className="font-semibold">Generation error</p>
            <p className="mt-0.5 text-red-600 dark:text-red-400">{generationError}</p>
          </div>
        </div>
      )}

      {/* Two Option Cards: Speak vs Write */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* OPTION 1: SPEAK */}
        <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between shadow-sm hover:border-amber-400 dark:hover:border-amber-500 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <Volume2 className="h-4 w-4" /> Option 1: Speak
              </span>
              <span className="text-[11px] font-mono text-slate-400">Cartesia STT</span>
            </div>

            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Tell us about your business
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Click the mic to speak in Telugu, Hindi, or English. Describe what product you sell, what your agent should ask, and what action to take.
            </p>

            {/* Mic Center Stage */}
            <div className="py-8 flex flex-col items-center justify-center">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing || isGenerating}
                className={`relative group flex items-center justify-center h-24 w-24 rounded-full transition-all transform active:scale-95 focus:outline-none ${
                  isRecording
                    ? "bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse ring-4 ring-red-200 dark:ring-red-950"
                    : "bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 shadow-md hover:shadow-amber-500/20 hover:scale-105"
                }`}
                title={isRecording ? "Click to stop recording" : "Click to start recording"}
              >
                {isRecording ? (
                  <MicOff className="h-10 w-10" />
                ) : (
                  <Mic className="h-10 w-10 text-slate-950" />
                )}
                {isRecording && (
                  <span
                    className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping opacity-75"
                    style={{ animationDuration: "1.5s" }}
                  />
                )}
              </button>

              {/* Status & Timer */}
              <div className="mt-4 text-center">
                {isRecording ? (
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center justify-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-600 animate-ping" />
                      Recording: {formatTime(recordSeconds)} / 03:00
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Click the red button when finished speaking.
                    </p>
                    {/* Live waveform audio meter */}
                    <div className="w-32 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto overflow-hidden mt-2">
                      <div
                        className="h-full bg-red-500 transition-all duration-75 rounded-full"
                        style={{ width: `${Math.max(5, audioLevel)}%` }}
                      />
                    </div>
                  </div>
                ) : isTranscribing ? (
                  <div className="flex items-center justify-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Transcribing with Cartesia STT…</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 font-medium">
                    Click to start recording (up to 3 min)
                  </span>
                )}
              </div>

              {/* Speak Error Banner */}
              {speakError && (
                <div className="mt-4 w-full p-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs">
                  {speakError}
                </div>
              )}
            </div>

            {/* Editable Transcript Area */}
            {spokenTranscript && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Transcribed Speech (Review &amp; Edit)
                  </label>
                  <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Transcribed
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={spokenTranscript}
                  onChange={(e) => setSpokenTranscript(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none leading-relaxed resize-none"
                  style={{ fontFamily: 'inherit, "Noto Sans Telugu", sans-serif' }}
                  placeholder="Your speech transcript will appear here..."
                />
              </div>
            )}
          </div>

          {/* Action buttons for speak option */}
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            {spokenTranscript ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startRecording}
                  disabled={isRecording || isGenerating}
                  className="text-xs flex items-center gap-1"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Re-record
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleGenerate(spokenTranscript)}
                  disabled={isGenerating || spokenTranscript.trim().length < 10}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate Agent
                </Button>
              </>
            ) : (
              <p className="text-[11px] text-slate-400 italic">
                Speak your business details above to transcribe automatically.
              </p>
            )}
          </div>
        </div>

        {/* OPTION 2: WRITE */}
        <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between shadow-sm hover:border-teal-400 dark:hover:border-teal-500 transition-all">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Option 2: Write
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {writtenDescription.length} chars (min 20)
              </span>
            </div>

            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Write what the agent should do
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Type your company background, qualification questions, and what outcome you want from every call.
            </p>

            <div className="mt-4 space-y-3">
              <textarea
                rows={6}
                value={writtenDescription}
                onChange={(e) => setWrittenDescription(e.target.value)}
                placeholder="We are a real estate company in Hyderabad selling plots in Shadnagar. The agent should call new enquiries, ask budget and location, and book site visits."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-500 focus:outline-none leading-relaxed resize-none"
                style={{ fontFamily: 'inherit, "Noto Sans Telugu", sans-serif' }}
              />

              {/* Starter Template Chips */}
              <div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1.5">
                  Or start with a template:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_CHIPS.map((chip) => (
                    <button
                      key={chip.name}
                      type="button"
                      onClick={() => setWrittenDescription(chip.text)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 hover:bg-amber-50 hover:text-amber-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors border border-transparent hover:border-amber-200"
                    >
                      {chip.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action button for write option */}
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
            <Button
              onClick={() => handleGenerate(writtenDescription)}
              disabled={isGenerating || writtenDescription.trim().length < 20}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-sm h-10 px-5"
            >
              <Sparkles className="h-4 w-4" />
              Generate agent
            </Button>
          </div>
        </div>
      </div>

      {/* Advanced Settings Collapsible */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span>Advanced Call &amp; Persona Settings</span>
            <span className="text-[10px] font-normal text-slate-400">
              (Mode: {mode}, Language: {language === "te-IN" ? "Telugu" : language === "hi-IN" ? "Hindi" : "English"})
            </span>
          </span>
          {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showAdvanced && (
          <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Mode selection */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Calling Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
              >
                <option value="bulk">Bulk calling (Outbound Lead List)</option>
                <option value="instant">Instant lead calling (Website Enquiry)</option>
                <option value="inbound">Inbound (Incoming Customer Support)</option>
              </select>
            </div>

            {/* Language selection */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Primary Spoken Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
              >
                <option value="te-IN">Telugu (తెలుగు - te-IN)</option>
                <option value="hi-IN">Hindi (हिन्दी - hi-IN)</option>
                <option value="en-IN">Indian English (en-IN)</option>
              </select>
            </div>

            {/* Agent Name & Gender */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Agent Name (Optional)
                </label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Ravi, Ramya"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Voice Gender
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Generation Progress Modal / Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl text-center space-y-6">
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-teal-500 text-white shadow-lg">
              <Sparkles className="h-10 w-10 animate-spin" style={{ animationDuration: "3s" }} />
              <div className="absolute inset-0 rounded-full border-2 border-amber-400 animate-ping opacity-30" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Generating your AI Voice Agent</h3>
              <p className="text-xs text-slate-400 mt-1">
                Creating your conversational node graph and Telugu script...
              </p>
            </div>

            {/* Stepper Progress Indicator */}
            <div className="space-y-3 text-left">
              {[
                { step: "understanding", text: "Understanding your business…" },
                { step: "designing", text: "Designing the call flow…" },
                { step: "writing", text: "Writing the script…" },
                { step: "validating", text: "Validating…" },
              ].map((item, idx) => {
                const steps: ProgressStep[] = ["understanding", "designing", "writing", "validating", "saving"];
                const currIdx = steps.indexOf(progressStep);
                const itemIdx = steps.indexOf(item.step as ProgressStep);
                const isComplete = currIdx > itemIdx;
                const isCurrent = progressStep === item.step;

                return (
                  <div key={item.step} className="flex items-center gap-3">
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                        isComplete
                          ? "bg-teal-500 text-slate-950"
                          : isCurrent
                          ? "bg-amber-500 text-slate-950 ring-4 ring-amber-500/20"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {isComplete ? "✓" : idx + 1}
                    </div>
                    <span
                      className={`text-xs ${
                        isCurrent
                          ? "font-semibold text-amber-400"
                          : isComplete
                          ? "text-slate-300"
                          : "text-slate-500"
                      }`}
                    >
                      {item.text}
                    </span>
                    {isCurrent && <Loader2 className="h-3 w-3 animate-spin text-amber-400 ml-auto" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
