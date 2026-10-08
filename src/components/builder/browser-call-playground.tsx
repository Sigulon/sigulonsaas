"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Send,
  Volume2,
  Loader2,
  Bot,
  User,
  Sparkles,
  Radio,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  Globe,
} from "lucide-react";

export const SUPPORTED_STT_LANGUAGES = [
  { code: "te-IN", label: "Telugu (తెలుగు)" },
  { code: "hi-IN", label: "Hindi (हिन्दी)" },
  { code: "en-IN", label: "English (India)" },
  { code: "ta-IN", label: "Tamil (தமிழ்)" },
  { code: "kn-IN", label: "Kannada (ಕನ್ನಡ)" },
  { code: "mr-IN", label: "Marathi (मराठी)" },
  { code: "bn-IN", label: "Bengali (বাংলা)" },
  { code: "gu-IN", label: "Gujarati (ગુજરાતી)" },
  { code: "ml-IN", label: "Malayalam (മലയാളം)" },
  { code: "pa-IN", label: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "en-US", label: "English (US)" },
] as const;

export function resolveSpeechLanguageCode(lang?: string): string {
  const clean = (lang || "").toLowerCase().trim();
  if (clean.startsWith("te") || clean.includes("telugu")) return "te-IN";
  if (clean.startsWith("hi") || clean.includes("hindi") || clean.startsWith("hing")) return "hi-IN";
  if (clean.startsWith("ta") || clean.includes("tamil")) return "ta-IN";
  if (clean.startsWith("kn") || clean.includes("kannada")) return "kn-IN";
  if (clean.startsWith("mr") || clean.includes("marathi")) return "mr-IN";
  if (clean.startsWith("bn") || clean.includes("bengali")) return "bn-IN";
  if (clean.startsWith("gu") || clean.includes("gujarati")) return "gu-IN";
  if (clean.startsWith("ml") || clean.includes("malayalam")) return "ml-IN";
  if (clean.startsWith("pa") || clean.includes("punjabi")) return "pa-IN";
  if (clean.startsWith("en-us") || clean === "us") return "en-US";
  return "en-IN";
}

export interface BrowserCallPlaygroundProps {
  agentId: string;
  agentName: string;
  language: string;
  voiceName: string;
  systemPrompt?: string;
  voiceId?: string;
  embedded?: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  time: string;
}

export function BrowserCallPlayground({
  agentId,
  agentName,
  language,
  voiceName,
  systemPrompt,
  voiceId,
  embedded = false,
}: BrowserCallPlaygroundProps) {
  const [selectedLanguage, setSelectedLanguage] = useState(() =>
    resolveSpeechLanguageCode(language)
  );
  const [interimTranscript, setInterimTranscript] = useState("");
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
  const [isSavingCall, setIsSavingCall] = useState(false);
  const [savedCallResult, setSavedCallResult] = useState<{
    callId: string;
    recordingUrl?: string;
    turnsCount?: number;
  } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callIdRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  /** Minimal Web Speech API surface */
  interface SpeechRecognitionAlternative {
    transcript?: string;
    confidence?: number;
  }
  interface SpeechRecognitionResultItem {
    isFinal?: boolean;
    length: number;
    [index: number]: SpeechRecognitionAlternative;
  }
  interface SpeechRecognitionResultEvent {
    results?: ArrayLike<SpeechRecognitionResultItem>;
    resultIndex?: number;
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

  useEffect(() => {
    setSelectedLanguage(resolveSpeechLanguageCode(language));
  }, [language]);

  // Scroll transcript to bottom smoothly when messages update
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, interimTranscript]);

  const sampleQuestions = useMemo(() => {
    if (selectedLanguage.startsWith("te")) {
      return [
        "నమస్తే అండి, మీ సర్వీస్ వివరాలు ఏమిటి?",
        "బ్యాంక్ లోన్ సదుపాయం ఉందా?",
        "ఆఫీస్ ఎక్కడ ఉంది?",
        "ఈ వీకెండ్ మాట్లాడవచ్చా?",
      ];
    }
    if (selectedLanguage.startsWith("hi")) {
      return [
        "नमस्ते, आपकी सेवाएं क्या हैं?",
        "क्या बैंक लोन सुविधा उपलब्ध है?",
        "आपका ऑफिस कहाँ स्थित है?",
        "क्या हम इस वीकेंड बात कर सकते हैं?",
      ];
    }
    if (selectedLanguage.startsWith("ta")) {
      return [
        "வணக்கம், உங்கள் சேவை விவரங்கள் என்ன?",
        "வங்கி கடன் வசதி உள்ளதா?",
        "உங்கள் அலுவலகம் எங்கே உள்ளது?",
      ];
    }
    if (selectedLanguage.startsWith("kn")) {
      return [
        "ನಮಸ್ಕಾರ, ನಿಮ್ಮ ಸೇವೆಗಳ ವಿವರವೇನು?",
        "ಬ್ಯಾಂಕ್ ಲೋನ್ ಸೌಲಭ್ಯವಿದೆಯೇ?",
        "ನಿಮ್ಮ ಕಚೇರಿ ಎಲ್ಲಿದೆ?",
      ];
    }
    return [
      "Hello, could you explain your services?",
      "What are the pricing options?",
      "Where is your office located?",
      "Can we schedule a call for this weekend?",
    ];
  }, [selectedLanguage]);

  // Stable refs for callbacks
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

  // Call duration timer
  useEffect(() => {
    if (isInCall) {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
          console.warn("Audio playback notice:", err);
          setIsAgentSpeaking(false);
        });
      }
    } catch (e) {
      console.error("Audio playback error:", e);
      setIsAgentSpeaking(false);
    }
  }, []);

  const speakAudio = useCallback(
    (base64Data?: string | null, text?: string) => {
      if (base64Data) {
        playAudio(base64Data);
        return;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window && text) {
        try {
          window.speechSynthesis.cancel();
          if (recognitionRef.current) {
            try {
              recognitionRef.current.stop();
            } catch {}
            setIsListening(false);
          }
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = selectedLanguage;
          setIsAgentSpeaking(true);
          utterance.onend = () => {
            setIsAgentSpeaking(false);
            if (handsFreeRef.current && isInCallRef.current) {
              setTimeout(() => {
                if (
                  handsFreeRef.current &&
                  isInCallRef.current &&
                  !isAgentSpeakingRef.current &&
                  !isProcessingTurnRef.current
                ) {
                  try {
                    recognitionRef.current?.start();
                    setIsListening(true);
                  } catch {}
                }
              }, 350);
            }
          };
          utterance.onerror = () => setIsAgentSpeaking(false);
          window.speechSynthesis.speak(utterance);
        } catch {
          setIsAgentSpeaking(false);
        }
      }
    },
    [playAudio, selectedLanguage]
  );

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
            language: selectedLanguage,
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

        if (data.audioBase64 || data.replyText) {
          speakAudio(data.audioBase64, data.replyText);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to communicate with agent");
      } finally {
        setIsProcessingTurn(false);
      }
    },
    [agentId, selectedLanguage, speakAudio, systemPrompt, voiceId]
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
      // recognition might already be running
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
      setInterimTranscript("");
    }
  }, []);

  // Web Speech API with hands-free loop
  useEffect(() => {
    const speechWindow = window as unknown as WindowWithSpeechRecognition;
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = selectedLanguage;

      recognition.onresult = (event: SpeechRecognitionResultEvent) => {
        let finalTranscript = "";
        let currentInterim = "";

        const results = event.results;
        if (results) {
          for (let i = 0; i < (results.length || 0); i++) {
            const item = results[i];
            const transcript = item?.[0]?.transcript || "";
            if (item?.isFinal) {
              finalTranscript += transcript;
            } else {
              currentInterim += transcript;
            }
          }
        }

        if (currentInterim) {
          setInterimTranscript(currentInterim);
        }

        if (finalTranscript && finalTranscript.trim()) {
          setInterimTranscript("");
          setInputText(finalTranscript.trim());
          handleSendMessageRef.current(finalTranscript.trim());
        }
      };

      recognition.onerror = (e: SpeechRecognitionResultEvent) => {
        if (e.error !== "no-speech") {
          console.warn("Speech recognition notice:", e.error);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
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
  }, [selectedLanguage]);

  // Audio lifecycle: when agent finishes speaking, automatically resume microphone
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const handleEnded = () => {
      setIsAgentSpeaking(false);
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

  // Toggle mic manually
  const toggleMic = async () => {
    if (!recognitionRef.current) {
      setError("Speech recognition is not supported in this browser. You can type using the text box below.");
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
        setError("Microphone access was denied. Please allow microphone access in your browser.");
      }
    }
  };

  // Start Call
  const handleStartCall = async () => {
    setConnecting(true);
    setError(null);
    setMessages([]);
    setSavedCallResult(null);

    try {
      // 1. Microphone & MediaRecorder setup
      let micStream: MediaStream | null = null;
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = micStream;
        } catch (e) {
          console.warn("Microphone access check:", e);
        }
      }

      if (micStream && typeof MediaRecorder !== "undefined") {
        audioChunksRef.current = [];
        try {
          const recorder = new MediaRecorder(micStream);
          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };
          recorder.start(1000);
          mediaRecorderRef.current = recorder;
        } catch (e) {
          console.warn("MediaRecorder start check:", e);
        }
      }

      // 2. Initialize call session in backend
      const res = await fetch(`/api/agents/${agentId}/test-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init",
          voiceId,
          language: selectedLanguage,
          systemPrompt,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to connect to agent session");
      }

      const data = await res.json();
      if (data.callId) {
        callIdRef.current = data.callId;
      }
      setIsInCall(true);

      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMessages([
        {
          role: "assistant",
          content: data.replyText,
          time: now,
        },
      ]);

      if (data.audioBase64 || data.replyText) {
        speakAudio(data.audioBase64, data.replyText);
      } else if (handsFree) {
        startListening();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleEndCall = async () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    stopListening();
    setIsInCall(false);
    setIsAgentSpeaking(false);
    setIsProcessingTurn(false);

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    const currentCallId = callIdRef.current;
    if (!currentCallId) return;

    setIsSavingCall(true);

    try {
      let audioBase64: string | undefined;
      if (audioChunksRef.current.length > 0) {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        audioBase64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result || "");
          };
          reader.readAsDataURL(audioBlob);
        });
      }

      const res = await fetch(`/api/agents/${agentId}/test-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end_call",
          callId: currentCallId,
          durationSeconds: callDuration,
          transcript: messagesRef.current,
          audioBase64,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSavedCallResult({
          callId: currentCallId,
          recordingUrl: data.recordingUrl,
          turnsCount: data.turnsCount || messagesRef.current.length,
        });
      }
    } catch (e) {
      console.warn("End call persistence notice:", e);
    } finally {
      setIsSavingCall(false);
    }
  };

  const containerClasses = embedded
    ? "space-y-5"
    : "bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs space-y-5";

  return (
    <div className={containerClasses}>
      {/* Hidden audio tag for streaming neural audio */}
      <audio ref={audioRef} />

      {/* Top Header & Session Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400 font-bold text-base flex items-center justify-center shrink-0">
            {agentName.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base text-gray-900 dark:text-white">
                {agentName}
              </h3>
              <Badge variant="blue" className="text-[10px]">
                Web Voice Call
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-neutral-400">
              <span className="flex items-center gap-1">
                <Volume2 className="w-3 h-3 text-blue-500" />
                <span>{voiceName}</span>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Globe className="w-3 h-3 text-gray-400" />
                <span>{SUPPORTED_STT_LANGUAGES.find((l) => l.code === selectedLanguage)?.label?.split(" ")[0] || "Telugu"}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Speech-to-Text Language Selection */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-800 text-xs">
            <span className="text-[10px] font-bold text-gray-400 dark:text-neutral-500 uppercase tracking-wide">
              STT:
            </span>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              disabled={isInCall && isListening}
              suppressHydrationWarning
              className="bg-transparent text-xs font-semibold text-blue-600 dark:text-blue-400 outline-none cursor-pointer"
              title="Speech Recognition Language"
            >
              {SUPPORTED_STT_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="text-gray-900 bg-white dark:bg-neutral-900 dark:text-white">
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {!isInCall ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartCall}
              disabled={connecting}
              className="gap-2 shadow-xs"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <PhoneCall className="w-4 h-4" />
                  <span>Start Web Call</span>
                </>
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-mono text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{formatDuration(callDuration)}</span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleEndCall}
                className="gap-1.5 h-8 text-xs"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>End Call</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Errors & Alerts */}
      {error && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isSavingCall && (
        <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span>Saving call recording to Cloudflare R2 and persisting transcription log...</span>
        </div>
      )}

      {savedCallResult && (
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Voice recording saved to <strong>Cloudflare R2</strong> and conversation logged to <strong>Call Logs</strong>.
            </span>
          </div>
          <Link
            href="/calls"
            className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 underline dark:text-emerald-400 shrink-0"
          >
            <span>View in Call Logs</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Modern Calling Monitor & Waveform Visualizer */}
      <div className="bg-gray-50/80 dark:bg-neutral-800/40 rounded-xl border border-gray-200/80 dark:border-neutral-800 p-6 flex flex-col items-center justify-center text-center relative overflow-hidden transition-all duration-300 min-h-[200px]">
        {/* Animated Avatar / Call State */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                isAgentSpeaking
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25 ring-4 ring-blue-500/20 scale-105"
                  : isListening
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/25 ring-4 ring-emerald-500/20 scale-105"
                  : isProcessingTurn
                  ? "bg-amber-500 text-white shadow-lg shadow-amber-500/25 ring-4 ring-amber-500/20 animate-pulse"
                  : isInCall
                  ? "bg-gray-800 text-white"
                  : "bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 text-gray-400 dark:text-neutral-500 shadow-2xs"
              }`}
            >
              {isInCall ? (
                <Bot className="w-8 h-8" />
              ) : (
                <PhoneCall className="w-7 h-7 text-blue-600 dark:text-blue-400" />
              )}
            </div>
          </div>

          {/* Call Status Badge */}
          <div>
            {!isInCall && (
              <Badge variant="secondary" className="text-xs">
                Ready to Connect
              </Badge>
            )}
            {isInCall && isAgentSpeaking && (
              <Badge variant="blue" className="text-xs gap-1.5">
                <Volume2 className="w-3 h-3 animate-pulse" />
                <span>Agent Speaking</span>
              </Badge>
            )}
            {isInCall && isListening && !isAgentSpeaking && (
              <Badge variant="success" className="text-xs gap-1.5">
                <Mic className="w-3 h-3 animate-pulse" />
                <span>Listening to Your Voice</span>
              </Badge>
            )}
            {isInCall && isProcessingTurn && (
              <Badge variant="warning" className="text-xs gap-1.5">
                <Sparkles className="w-3 h-3 animate-spin" />
                <span>Thinking...</span>
              </Badge>
            )}
          </div>

          {/* Sleek Dynamic Waveform Bars */}
          {isInCall ? (
            <div className="flex items-center justify-center gap-1 mt-2 h-7">
              {[12, 22, 16, 28, 24, 18, 30, 22, 15, 26, 18, 28, 16, 24, 14, 20].map((h, i) => {
                const currentHeight = isAgentSpeaking
                  ? h
                  : isListening
                  ? Math.max(6, Math.floor(h * 0.65))
                  : 4;
                return (
                  <span
                    key={i}
                    className={`w-1 rounded-full transition-all duration-150 ${
                      isAgentSpeaking
                        ? "bg-blue-600 dark:bg-blue-400"
                        : isListening
                        ? "bg-emerald-600 dark:bg-emerald-400"
                        : "bg-gray-300 dark:bg-neutral-700"
                    }`}
                    style={{ height: `${currentHeight}px` }}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-neutral-400 mt-1 max-w-sm">
              Click &quot;Start Web Call&quot; to test natural conversations in your browser with microphone input and neural voice playback.
            </p>
          )}

          {/* Real-time speech recognition preview */}
          {isListening && interimTranscript && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-medium shadow-xs max-w-md mx-auto truncate mt-1">
              <Radio className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>&ldquo;{interimTranscript}&rdquo;</span>
            </div>
          )}
        </div>
      </div>

      {/* Live Transcript Stream */}
      {isInCall && messages.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-3 max-h-60 overflow-y-auto">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2.5 text-xs ${
                m.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                  m.role === "user"
                    ? "bg-gray-100 dark:bg-neutral-800 text-gray-600 border border-gray-200 dark:border-neutral-700"
                    : "bg-blue-50 dark:bg-blue-950/70 text-blue-600 border border-blue-100 dark:border-blue-900"
                }`}
              >
                {m.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>
              <div
                className={`max-w-[82%] rounded-xl px-3.5 py-2 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-tr-xs"
                    : "bg-gray-50 dark:bg-neutral-800/80 border border-gray-100 dark:border-neutral-750 text-gray-900 dark:text-neutral-100 rounded-tl-xs shadow-2xs"
                }`}
              >
                <p>{m.content}</p>
                <span
                  className={`text-[9px] mt-1 block ${
                    m.role === "user" ? "text-blue-100 text-right" : "text-gray-400 dark:text-neutral-500"
                  }`}
                >
                  {m.time}
                </span>
              </div>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      )}

      {/* In-Call Controls & Prompts */}
      {isInCall && (
        <div className="space-y-3 pt-1">
          {/* Hands-free mode banner */}
          <div className="flex items-center justify-between rounded-lg bg-emerald-50/70 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/60 px-3 py-1.5 text-xs text-emerald-800 dark:text-emerald-300">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                <strong>Hands-free mode active:</strong> Speak naturally. Agent automatically detects pauses.
              </span>
            </span>
            <label className="flex items-center gap-1.5 text-[11px] font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={handsFree}
                onChange={(e) => setHandsFree(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Auto-Listen</span>
            </label>
          </div>

          {/* Quick Questions / Topics */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-gray-500 dark:text-neutral-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-blue-600" />
              Suggested:
            </span>
            {sampleQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(q)}
                disabled={isProcessingTurn || isAgentSpeaking}
                suppressHydrationWarning
                className="rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-gray-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300 text-gray-700 px-2.5 py-1 text-xs transition-colors disabled:opacity-40 cursor-pointer"
              >
                &ldquo;{q}&rdquo;
              </button>
            ))}
          </div>

          {/* Mic Button & Typed Input Form */}
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
              size="sm"
              onClick={toggleMic}
              disabled={isAgentSpeaking || isProcessingTurn}
              className={`h-9 px-3 text-xs gap-1.5 ${
                isListening
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-400/40 dark:bg-emerald-950/40"
                  : "text-gray-700 dark:text-neutral-300"
              }`}
              title="Toggle microphone"
            >
              {isListening ? (
                <>
                  <Mic className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                  <span className="font-semibold">Mic Live</span>
                </>
              ) : (
                <>
                  <MicOff className="w-3.5 h-3.5 text-gray-500" />
                  <span>Mic Muted</span>
                </>
              )}
            </Button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Or type a question for the agent..."
              disabled={isProcessingTurn}
              className="flex-1 h-9 px-3 text-xs rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!inputText.trim() || isProcessingTurn}
              className="h-9 px-3.5 text-xs gap-1"
            >
              {isProcessingTurn ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Send</span>
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
