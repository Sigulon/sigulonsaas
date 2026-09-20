"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  PhoneCall,
  PhoneOff,
  Mic,
  Send,
  Volume2,
  Loader2,
  Bot,
  User,
  Sparkles,
  Radio,
} from "lucide-react";

interface BrowserCallPlaygroundProps {
  agentId: string;
  agentName: string;
  language: string;
  voiceName: string;
  systemPrompt?: string;
  voiceId?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  time: string;
}

const QUICK_PROMPTS: Record<string, string[]> = {
  hi: [
    "नमस्ते! आप क्या सेवाएँ प्रदान करते हैं?",
    "इसकी कीमत कितनी होगी?",
    "क्या मैं कल सुबह 11 बजे का समय बुक कर सकता हूँ?",
    "आपका कार्यालय कहाँ स्थित है?",
  ],
  te: [
    "నమస్కారం! మీ సేవలు ఏమిటి?",
    "దీని ధర ఎంత అవుతుంది?",
    "రేపు ఉదయం 11 గంటలకు అపాయింట్‌మెంట్ బుక్ చేయవచ్చా?",
  ],
  ta: [
    "வணக்கம்! உங்கள் சேவைகள் என்ன?",
    "இதன் கட்டணம் எவ்வளவு?",
    "நாளை காலை முன்பதிவு செய்ய முடியுமா?",
  ],
  en: [
    "Hello! What services do you offer?",
    "How much does this cost?",
    "Can I schedule an appointment for tomorrow at 11 AM?",
    "Where are you located?",
  ],
};

export function BrowserCallPlayground({
  agentId,
  agentName,
  language,
  voiceName,
  systemPrompt,
  voiceId,
}: BrowserCallPlaygroundProps) {
  const [isInCall, setIsInCall] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [handsFree, setHandsFree] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /** Minimal Web Speech API surface (full lib.dom types lag vendor APIs). */
  interface SpeechRecognitionResultEvent {
    results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
    error?: string;
  }
  interface SpeechRecognitionInstance {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
    onerror: ((event: SpeechRecognitionResultEvent) => void) | null;
    onend: (() => void) | null;
  }
  interface WindowWithSpeechRecognition extends Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Stable refs to eliminate stale closure problems in event callbacks
  const isInCallRef = useRef(isInCall);
  const isListeningRef = useRef(isListening);
  const handsFreeRef = useRef(handsFree);
  const isAgentSpeakingRef = useRef(isAgentSpeaking);
  const isProcessingTurnRef = useRef(isProcessingTurn);
  const messagesRef = useRef<Message[]>(messages);

  useEffect(() => {
    isInCallRef.current = isInCall;
  }, [isInCall]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    isAgentSpeakingRef.current = isAgentSpeaking;
  }, [isAgentSpeaking]);

  useEffect(() => {
    isProcessingTurnRef.current = isProcessingTurn;
  }, [isProcessingTurn]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Call duration counter
  useEffect(() => {
    if (isInCall) {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- timer reset on hangup.
      setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isInCall]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Play incoming synthesized neural voice audio
  const playAudio = useCallback((base64Data: string) => {
    if (!audioRef.current) return;
    try {
      // Temporarily stop microphone listening while the agent is speaking through speakers
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        setIsListening(false);
      }

      const audioUrl = `data:audio/mpeg;base64,${base64Data}`;
      audioRef.current.src = audioUrl;
      audioRef.current.volume = 1.0;
      setIsAgentSpeaking(true);

      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Audio playback check:", err);
          setIsAgentSpeaking(false);
        });
      }
    } catch (e) {
      console.error("Audio playback error:", e);
      setIsAgentSpeaking(false);
    }
  }, []);

  // Send turn message to agent backend
  const handleSendMessage = useCallback(
    async (textToSend: string) => {
      const trimmed = textToSend.trim();
      if (!trimmed || !isInCallRef.current) return;

      setIsProcessingTurn(true);
      setError(null);

      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const updatedHistory: Message[] = [
        ...messagesRef.current,
        { role: "user", content: trimmed, time: now },
      ];

      setMessages(updatedHistory);
      setInputText("");

      try {
        const res = await fetch(`/api/agents/${agentId}/test-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: updatedHistory.map((m) => ({ role: m.role, content: m.content })),
            action: "turn",
            voiceId,
            language,
            systemPrompt,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Agent response failed");
        }

        const data = await res.json();
        const replyTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.replyText,
            time: replyTime,
          },
        ]);

        if (data.audioBase64) {
          playAudio(data.audioBase64);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to communicate with agent");
      } finally {
        setIsProcessingTurn(false);
      }
    },
    [agentId, language, playAudio, systemPrompt, voiceId]
  );

  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // Start speech recognition listening
  const startListening = useCallback(() => {
    if (
      !recognitionRef.current ||
      !isInCallRef.current ||
      isAgentSpeakingRef.current ||
      isProcessingTurnRef.current
    ) {
      return;
    }
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      // recognition might already be active
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    }
  }, []);

  // Initialize Web Speech API with automatic hands-free listener loop
  useEffect(() => {
    const speechWindow = window as unknown as WindowWithSpeechRecognition;
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang =
        language === "hi"
          ? "hi-IN"
          : language === "te"
          ? "te-IN"
          : language === "ta"
          ? "ta-IN"
          : language === "kn"
          ? "kn-IN"
          : language === "bn"
          ? "bn-IN"
          : language === "mr"
          ? "mr-IN"
          : language === "gu"
          ? "gu-IN"
          : language === "ml"
          ? "ml-IN"
          : language === "pa"
          ? "pa-IN"
          : "en-IN";

      recognition.onresult = (event: SpeechRecognitionResultEvent) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript && transcript.trim()) {
          setInputText(transcript);
          // Directly submit speech without needing a button press!
          handleSendMessageRef.current(transcript);
        }
        setIsListening(false);
      };

      recognition.onerror = (e: SpeechRecognitionResultEvent) => {
        console.warn("Speech recognition notice:", e.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        // If in call, hands-free mode is on, and agent is not speaking, automatically keep listening for caller
        if (
          handsFreeRef.current &&
          isInCallRef.current &&
          !isAgentSpeakingRef.current &&
          !isProcessingTurnRef.current
        ) {
          setTimeout(() => {
            if (
              handsFreeRef.current &&
              isInCallRef.current &&
              !isAgentSpeakingRef.current &&
              !isProcessingTurnRef.current
            ) {
              try {
                recognition.start();
                setIsListening(true);
              } catch {}
            }
          }, 300);
        }
      };

      recognitionRef.current = recognition;
    }
  }, [language]);

  // Audio lifecycle: when agent finishes speaking, automatically resume microphone listening
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const handleEnded = () => {
      setIsAgentSpeaking(false);
      // As soon as agent finishes speaking, open the mic for the user to speak!
      if (handsFreeRef.current && isInCallRef.current) {
        setTimeout(() => {
          startListening();
        }, 350);
      }
    };

    audioElement.onended = handleEnded;
    audioElement.onerror = () => setIsAgentSpeaking(false);

    return () => {
      if (audioElement) {
        audioElement.onended = null;
        audioElement.onerror = null;
      }
    };
  }, [startListening]);

  // Toggle mic manually if needed
  const toggleMic = async () => {
    if (!recognitionRef.current) {
      setError("Speech recognition is not supported in this browser. You can use the Quick Talk buttons below.");
      return;
    }

    if (isListening) {
      stopListening();
    } else {
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
        }
        startListening();
      } catch {
        setError("Microphone access was denied. Please allow microphone access in your browser settings.");
      }
    }
  };

  // Start Call (Dialing into voice session)
  const handleStartCall = async () => {
    setConnecting(true);
    setError(null);
    setMessages([]);

    try {
      // Request mic permission on user click gesture so audio autoplay & speech work seamlessly
      if (navigator.mediaDevices?.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
      }

      const res = await fetch(`/api/agents/${agentId}/test-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init",
          voiceId,
          language,
          systemPrompt,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to connect to agent session");
      }

      const data = await res.json();
      setIsInCall(true);

      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMessages([
        {
          role: "assistant",
          content: data.replyText,
          time: now,
        },
      ]);

      if (data.audioBase64) {
        playAudio(data.audioBase64);
      } else if (handsFree) {
        startListening();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleEndCall = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    stopListening();
    setIsInCall(false);
    setIsAgentSpeaking(false);
    setIsProcessingTurn(false);
  };

  const langKey = (language || "en").toLowerCase().split("-")[0];
  const quickPromptsList = QUICK_PROMPTS[langKey] || QUICK_PROMPTS.en;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-950 space-y-6">
      {/* Hidden audio tag for live streaming playback */}
      <audio ref={audioRef} />

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100 dark:border-stone-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-stone-900 dark:text-white">
              Live Voice Call Simulator
            </h3>
            <Badge
              variant="outline"
              className="text-[11px] font-mono text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40"
            >
              Hands-Free Call Mode
            </Badge>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            Talk to <strong>{agentName}</strong> through your microphone just like dialing a real phone number.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[11px] text-stone-400 block">Voice Persona</span>
            <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1">
              <Volume2 className="h-3 w-3 text-violet-500" />
              {voiceName}
            </span>
          </div>

          {!isInCall ? (
            <Button
              onClick={handleStartCall}
              disabled={connecting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 text-xs h-9 px-4 shadow-sm"
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Connecting Call...</span>
                </>
              ) : (
                <>
                  <PhoneCall className="h-4 w-4" />
                  <span>Start Web Call</span>
                </>
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 dark:bg-emerald-950/30 dark:border-emerald-900/50 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  {formatDuration(callDuration)}
                </span>
              </div>

              <Button
                onClick={handleEndCall}
                className="bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 text-xs h-9 px-3"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                <span>Hang Up</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Simulator Visual Display */}
      <div className="relative rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 p-6 text-white overflow-hidden shadow-inner min-h-[320px] flex flex-col justify-between">
        {/* Animated Avatar / Soundwave */}
        <div className="flex items-center justify-center my-auto py-6">
          {isInCall ? (
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div
                  className={`h-24 w-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isAgentSpeaking
                      ? "bg-violet-600 shadow-[0_0_50px_rgba(99,102,241,0.7)] scale-105"
                      : isListening
                      ? "bg-emerald-600 shadow-[0_0_45px_rgba(16,185,129,0.7)] scale-105 ring-4 ring-emerald-400/40"
                      : isProcessingTurn
                      ? "bg-amber-600 animate-pulse"
                      : "bg-stone-800"
                  }`}
                >
                  <Bot className="h-10 w-10 text-white" />
                </div>

                {isAgentSpeaking && (
                  <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-violet-500 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider animate-bounce">
                    Agent Speaking
                  </span>
                )}

                {isListening && (
                  <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-emerald-500 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider animate-pulse">
                    Listening to You
                  </span>
                )}

                {isProcessingTurn && (
                  <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full tracking-wider">
                    Thinking
                  </span>
                )}
              </div>

              {isAgentSpeaking && (
                <div className="flex items-center gap-1 mt-3">
                  <span className="h-4 w-1 bg-violet-400 rounded-full animate-bounce" />
                  <span className="h-8 w-1 bg-violet-500 rounded-full animate-bounce [animation-delay:0.15s]" />
                  <span className="h-12 w-1 bg-violet-300 rounded-full animate-bounce [animation-delay:0.3s]" />
                  <span className="h-7 w-1 bg-violet-500 rounded-full animate-bounce [animation-delay:0.45s]" />
                  <span className="h-4 w-1 bg-violet-400 rounded-full animate-bounce [animation-delay:0.6s]" />
                </div>
              )}

              {isListening && (
                <div className="text-center mt-2">
                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 justify-center">
                    <Radio className="h-4 w-4 animate-pulse text-emerald-400" />
                    Microphone is Live — Speak freely, agent is listening!
                  </span>
                  <span className="text-[10px] text-stone-400 block mt-0.5">
                    No buttons needed. Just talk like on a real phone call.
                  </span>
                </div>
              )}

              {isProcessingTurn && (
                <div className="text-center mt-2">
                  <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5 justify-center">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Agent is generating response...
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center space-y-2">
              <div className="mx-auto h-16 w-16 rounded-full bg-stone-800 flex items-center justify-center text-stone-400">
                <PhoneCall className="h-7 w-7" />
              </div>
              <h4 className="font-semibold text-sm">Call Simulator Ready</h4>
              <p className="text-xs text-stone-400 max-w-sm">
                Click &quot;Start Web Call&quot; to begin a live telephone conversation with your agent directly in the browser.
              </p>
            </div>
          )}
        </div>

        {/* Live Conversation Transcript Feed */}
        {isInCall && messages.length > 0 && (
          <div className="max-h-44 overflow-y-auto space-y-2.5 p-3 rounded-xl bg-stone-800/60 border border-stone-700/50 backdrop-blur-xs">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2.5 text-xs ${
                  m.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    m.role === "user" ? "bg-emerald-600 text-white" : "bg-violet-600 text-white"
                  }`}
                >
                  {m.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                </div>
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 ${
                    m.role === "user"
                      ? "bg-emerald-600/90 text-white text-right"
                      : "bg-stone-700/90 text-stone-100"
                  }`}
                >
                  <p className="leading-relaxed text-xs">{m.content}</p>
                  <span className="text-[9px] opacity-70 block mt-0.5">{m.time}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hands-Free indicator & Quick speech chips */}
      {isInCall && (
        <div className="space-y-3">
          {/* Hands-free mode banner */}
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <strong>Hands-Free Call Loop Active:</strong> Speak anytime. When you pause, the agent responds automatically.
            </span>
            <label className="flex items-center gap-1.5 text-[11px] font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={handsFree}
                onChange={(e) => setHandsFree(e.target.checked)}
                className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Auto-Listen</span>
            </label>
          </div>

          {/* Quick Speech Chips (1-Click Spoken Questions) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-stone-400 mr-1 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-violet-500" />
              1-Click Questions:
            </span>
            {quickPromptsList.map((promptText, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSendMessage(promptText)}
                disabled={isProcessingTurn || isAgentSpeaking}
                className="text-[11px] rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-stone-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 transition-all cursor-pointer disabled:opacity-50"
              >
                {promptText}
              </button>
            ))}
          </div>

          {/* Fallback input form for noisy environments or text users */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputText.trim()) {
                handleSendMessage(inputText);
              }
            }}
            className="flex items-center gap-2"
          >
            <Button
              type="button"
              variant="outline"
              onClick={toggleMic}
              disabled={isAgentSpeaking || isProcessingTurn}
              className={`h-10 px-3.5 text-xs flex items-center gap-1.5 ${
                isListening
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400 dark:bg-emerald-950/30"
                  : "border-stone-300 hover:bg-stone-50"
              }`}
              title="Toggle microphone"
            >
              <Mic className={`h-4 w-4 ${isListening ? "text-emerald-600 animate-pulse" : "text-stone-600"}`} />
              <span className="font-semibold">{isListening ? "Mic On" : "Mic"}</span>
            </Button>

            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Or type what you want to say..."
              disabled={isProcessingTurn}
              className="text-xs h-10 flex-1"
            />

            <Button
              type="submit"
              disabled={!inputText.trim() || isProcessingTurn}
              className="h-10 px-4 bg-violet-600 hover:bg-violet-700 text-white text-xs flex items-center gap-1"
            >
              {isProcessingTurn ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>Send</span>
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
