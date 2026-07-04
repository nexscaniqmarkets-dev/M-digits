import React, { useState } from "react";
import { 
  TrendingUp, 
  Sparkles, 
  HelpCircle, 
  CheckCircle, 
  Cpu, 
  Clock, 
  AlertTriangle,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Shield,
  Gauge,
  Zap,
  ArrowUpRight,
  TrendingDown,
  Activity,
  Award,
  Layers,
  Flame,
  Percent,
  Target,
  Bot,
  Play,
  Pause
} from "lucide-react";
import { Tick, FrequencyInfo, SystemStatus, LogEntry, StrategyConfig, SmartAnalysisResult } from "../types";
import { authHeaders } from "../lib/telegram";
import { motion, AnimatePresence } from "motion/react";

interface DashboardViewProps {
  userId: string;
  ticks: Tick[];
  frequencies: FrequencyInfo[];
  predictionDigit: number | null;
  triggerDigit: number | null;
  status: SystemStatus;
  logs: LogEntry[];
  config: StrategyConfig;
  smartAnalysis: SmartAnalysisResult | null;
  analysis15?: {
    window: number;
    digits: number[];
    frequencies: Record<number, number>;
    dominant_digit: number;
    trigger_digit: number;
    confidence: number;
  };
  signal15?: {
    signal: boolean;
    contract_type: "DIGITMATCH";
    target_digit: number;
    trigger_digit: number;
    confidence: number;
    reason: string;
  };
  onUpdateConfig: (newConfig: Partial<StrategyConfig>) => Promise<void>;
  onEmergencyStop: () => void;
  onToggleAutoTrade?: () => void;
}

// Simple and robust Markdown-to-HTML parser for AI Report to prevent dependency errors
function renderSimpleMarkdown(markdown: string) {
  if (!markdown) return null;
  
  const lines = markdown.split("\n");
  return lines.map((line, idx) => {
    let trimmed = line.trim();
    
    // Header 3
    if (trimmed.startsWith("###")) {
      return (
        <h4 key={idx} className="font-display font-black text-slate-800 text-xs mt-4 mb-2 uppercase tracking-widest">
          {trimmed.replace("###", "").trim()}
        </h4>
      );
    }
    // Header 2
    if (trimmed.startsWith("##")) {
      return (
        <h3 key={idx} className="font-display font-black text-slate-800 text-sm mt-5 mb-2.5 border-b border-slate-200 pb-1.5 uppercase tracking-wider">
          {trimmed.replace("##", "").trim()}
        </h3>
      );
    }
    // Header 1
    if (trimmed.startsWith("#")) {
      return (
        <h2 key={idx} className="font-display font-black text-slate-800 text-base mt-6 mb-3 uppercase tracking-widest">
          {trimmed.replace("#", "").trim()}
        </h2>
      );
    }
    // Bullet point
    if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
      const content = trimmed.substring(1).trim();
      return (
        <li key={idx} className="text-slate-600 text-xs ml-4 list-disc py-0.5 leading-relaxed">
          {parseBoldText(content)}
        </li>
      );
    }
    // Numbered list
    if (/^\d+\./.test(trimmed)) {
      const content = trimmed.replace(/^\d+\./, "").trim();
      return (
        <li key={idx} className="text-slate-600 text-xs ml-4 list-decimal py-0.5 leading-relaxed">
          {parseBoldText(content)}
        </li>
      );
    }
    // Empty line
    if (trimmed === "") {
      return <div key={idx} className="h-2" />;
    }
    
    // Regular paragraph
    return (
      <p key={idx} className="text-slate-600 text-xs leading-relaxed py-0.5">
        {parseBoldText(trimmed)}
      </p>
    );
  });
}

// Helper to parse **bold** text
function parseBoldText(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} className="font-bold text-slate-900">{part}</strong>;
    }
    return part;
  });
}

export default function DashboardView({
  userId,
  ticks,
  frequencies,
  predictionDigit,
  triggerDigit,
  status,
  logs,
  config,
  smartAnalysis,
  analysis15,
  signal15,
  onUpdateConfig,
  onEmergencyStop,
  onToggleAutoTrade
}: DashboardViewProps) {
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAiReport, setShowAiReport] = useState(false);

  // Take the last 15 ticks for the visual digit tape
  const latestTicks = [...ticks].slice(-16);
  const currentTick = ticks[ticks.length - 1];

  const activeMode = config.analysisMode || "CLASSIC";

  const requestAiReport = async () => {
    setAiLoading(true);
    setAiError(null);
    setShowAiReport(true);
    try {
      const response = await fetch(`/api/ai-analysis?userId=${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" })
      });
      const data = await response.json();
      if (data.success) {
        setAiReport(data.report);
      } else {
        setAiError(data.error || "Failed to generate quant report.");
      }
    } catch (err: any) {
      setAiError(err.message || "Unable to contact Gemini AI services.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleModeChange = async (mode: "CLASSIC" | "SMART" | "HFT_15") => {
    await onUpdateConfig({ analysisMode: mode });
  };

  // Determine which predictions to display for active metrics
  const displayPrediction = activeMode === "HFT_15" && analysis15
    ? analysis15.dominant_digit
    : activeMode === "SMART" && smartAnalysis 
      ? smartAnalysis.predictionDigit 
      : predictionDigit;

  const displayTrigger = activeMode === "HFT_15" && analysis15
    ? analysis15.trigger_digit
    : activeMode === "SMART" && smartAnalysis 
      ? smartAnalysis.triggerDigit 
      : triggerDigit;

  return (
    <div id="dashboard-view-container" className="space-y-6 pb-12 w-full max-w-full overflow-hidden">
      {/* Strategic Dashboard Execution Bar */}
      {onToggleAutoTrade && (
        <section className={`border rounded-xl p-4 sm:p-5 shadow-md flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 transition-all duration-300 ${
          status.autoTrading
            ? "bg-gradient-to-r from-slate-900 via-slate-900 to-rose-950/70 border-rose-500/40 text-white"
            : "bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/70 border-slate-800 text-white"
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              status.autoTrading ? "bg-rose-500/20 border-rose-500/40 text-rose-400" : "bg-indigo-500/20 border-indigo-500/40 text-indigo-400"
            }`}>
              <Bot className={`w-5 h-5 ${status.autoTrading ? "animate-pulse" : ""}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-display font-black text-xs sm:text-sm uppercase tracking-wider text-white truncate">
                  Dashboard Live Execution Controller
                </h3>
                {status.autoTrading ? (
                  <span className="bg-rose-500 text-white text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-widest animate-pulse shrink-0">
                    BOT ACTIVE
                  </span>
                ) : (
                  <span className="bg-slate-800 text-slate-300 border border-slate-700 text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-widest shrink-0">
                    STANDBY
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 font-mono mt-0.5 truncate">
                {status.autoTrading
                  ? `Active Mode: ${activeMode} | Stake: $${config.stake?.toFixed(2)} USD | Stream Live`
                  : `Select strategy mode below and deploy bot directly from live analytics.`}
              </p>
            </div>
          </div>

          <button
            onClick={onToggleAutoTrade}
            className={`w-full sm:w-auto px-6 py-3 rounded-xl font-display font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-97 cursor-pointer shadow-lg shrink-0 ${
              status.autoTrading
                ? "bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 ring-2 ring-rose-500/30 animate-pulse"
                : "bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white border border-cyan-400/30 shadow-indigo-500/20"
            }`}
          >
            {status.autoTrading ? (
              <>
                <Pause className="w-4 h-4 shrink-0 animate-spin" />
                <span>PAUSE TRADING BOT</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 shrink-0 fill-current" />
                <span>LAUNCH TRADING BOT</span>
              </>
            )}
          </button>
        </section>
      )}

      {/* 1. Triple Strategy Selector */}
      <section className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
          <button
            onClick={() => handleModeChange("CLASSIC")}
            className={`flex items-start gap-3.5 p-4 rounded-lg cursor-pointer transition-all text-left relative overflow-hidden ${
              activeMode === "CLASSIC"
                ? "bg-indigo-50/50 border border-indigo-200/80 text-slate-850 shadow-sm"
                : "border border-transparent hover:bg-slate-50 text-slate-500"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
              activeMode === "CLASSIC"
                ? "bg-indigo-100/80 border-indigo-200 text-indigo-700"
                : "bg-slate-50 border-slate-200 text-slate-400"
            }`}>
              <Layers className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-display font-black text-xs uppercase tracking-wider text-slate-800">
                  Classic Mode
                </span>
                {activeMode === "CLASSIC" && (
                  <span className="text-[8px] font-mono bg-indigo-600 text-white font-bold px-1.5 py-0.2 rounded uppercase">
                    ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-normal max-w-sm">
                Direct rolling 120-tick digit counts. Selects the #1 and #2 frequency digits as core values.
              </p>
            </div>
          </button>

          <button
            onClick={() => handleModeChange("SMART")}
            className={`flex items-start gap-3.5 p-4 rounded-lg cursor-pointer transition-all text-left relative overflow-hidden ${
              activeMode === "SMART"
                ? "bg-indigo-50/50 border border-indigo-200/80 text-slate-850 shadow-sm"
                : "border border-transparent hover:bg-slate-50 text-slate-500"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border relative ${
              activeMode === "SMART"
                ? "bg-indigo-100/80 border-indigo-200 text-indigo-700"
                : "bg-slate-50 border-slate-200 text-slate-400"
            }`}>
              <Sparkles className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span>
              </span>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-display font-black text-xs uppercase tracking-wider text-slate-800">
                  Smart Mode
                </span>
                {activeMode === "SMART" && (
                  <span className="text-[8px] font-mono bg-indigo-600 text-white font-bold px-1.5 py-0.2 rounded uppercase">
                    ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-normal max-w-sm">
                Statistical consistency analysis. Dynamically scores transition probabilities and window volatility momentum.
              </p>
            </div>
          </button>

          <button
            onClick={() => handleModeChange("HFT_15")}
            className={`flex items-start gap-3.5 p-4 rounded-lg cursor-pointer transition-all text-left relative overflow-hidden ${
              activeMode === "HFT_15"
                ? "bg-indigo-50/50 border border-indigo-200/80 text-slate-850 shadow-sm"
                : "border border-transparent hover:bg-slate-50 text-slate-500"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border relative ${
              activeMode === "HFT_15"
                ? "bg-indigo-100/80 border-indigo-200 text-indigo-700"
                : "bg-slate-50 border-slate-200 text-slate-400"
            }`}>
              <Zap className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-display font-black text-xs uppercase tracking-wider text-slate-800">
                  15-Tick HFT Mode
                </span>
                {activeMode === "HFT_15" && (
                  <span className="text-[8px] font-mono bg-indigo-600 text-white font-bold px-1.5 py-0.2 rounded uppercase">
                    ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-normal max-w-sm">
                Ultra-rapid 15-tick sliding window. Employs stringent multi-factor stability tests with high-payout micro-entries.
              </p>
            </div>
          </button>
        </div>
      </section>

      {/* 2. Live Digit Tape & Stream State */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shadow-sm shadow-indigo-500/20 animate-pulse"></span>
            <h3 className="font-display font-black text-slate-800 text-xs uppercase tracking-widest">
              Real-Time Digit Stream
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">
            Sliding Window: last {ticks.length} / 120 ticks
          </span>
        </div>

        {/* Tape feed */}
        <div className="flex items-center gap-2 overflow-x-hidden py-2 bg-slate-50 border border-slate-200 rounded-lg px-3 min-h-[58px]">
          <div className="text-slate-400 text-[10px] font-mono font-bold mr-2 uppercase tracking-widest select-none shrink-0 border-r border-slate-200 pr-3">
            Digits:
          </div>
          
          <div className="flex items-center gap-1.5 flex-1 justify-end overflow-hidden">
            <AnimatePresence initial={false}>
              {latestTicks.map((tick, index) => {
                const isLatest = index === latestTicks.length - 1;
                const isTrigger = tick.digit === displayTrigger;
                const isPrediction = tick.digit === displayPrediction;

                let digitBg = "bg-white border-slate-200 text-slate-600 shadow-xs";
                if (isLatest) {
                  digitBg = "bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/20 ring-2 ring-indigo-500/20 font-black";
                } else if (isTrigger) {
                  digitBg = "bg-amber-50 text-amber-700 border-amber-200/60 font-bold";
                } else if (isPrediction) {
                  digitBg = "bg-indigo-50 text-indigo-600 border-indigo-200/60 font-semibold";
                }

                return (
                  <motion.div
                    key={tick.id}
                    layoutId={tick.id}
                    initial={{ opacity: 0, x: 20, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    className={`w-9 h-9 rounded-lg border flex items-center justify-center font-mono text-xs font-bold shrink-0 ${digitBg}`}
                  >
                    {tick.digit}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Interactive micro info */}
        <div className="flex items-center justify-between mt-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
            <span>Prediction Digit ({displayPrediction ?? "—"})</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 ml-3"></span>
            <span>Trigger Digit ({displayTrigger ?? "—"})</span>
          </div>
          {currentTick && (
            <div className="font-mono text-slate-500">
              Last Spot: <span className="text-slate-800 font-bold">{currentTick.price.toFixed(2)}</span>
            </div>
          )}
        </div>
      </section>

      {/* 2b. 15-Tick High-Frequency Statistical Engine (Digit Matches Strategy) */}
      <section id="hft-engine-stats-panel" className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm animate-pulse"></span>
            <h3 className="font-display font-black text-slate-800 text-xs uppercase tracking-widest flex items-center gap-2">
              15-Tick Matches Trading Engine
              <span className="text-[9px] bg-emerald-50 text-emerald-600 font-mono px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">
                Active
              </span>
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">
            Real-time HFT Analysis
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Dominant Digit Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between">
            <span className="text-[9px] text-slate-450 font-bold uppercase tracking-widest block mb-1">Dominant Digit</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-mono font-black text-slate-800 text-3xl leading-none">
                {analysis15 ? analysis15.dominant_digit : "—"}
              </span>
              <span className="text-[10px] text-slate-400 uppercase font-mono font-semibold">
                (target)
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-2 font-medium">
              Most frequent last digit in rolling 15-tick window.
            </div>
          </div>

          {/* Confidence Score & Meter */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-slate-450 font-bold uppercase tracking-widest block">Confidence Level</span>
              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                analysis15 && analysis15.confidence >= 22.0
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-amber-50 text-amber-600"
              }`}>
                {analysis15 && analysis15.confidence >= 22.0 ? "MET (>=22%)" : "LOW (<22%)"}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-mono font-black text-slate-800 text-3xl leading-none">
                {analysis15 ? `${analysis15.confidence}%` : "—"}
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full mt-2.5 overflow-hidden border border-slate-300/30 relative">
              <div 
                className="absolute top-0 bottom-0 left-[22%] w-0.5 bg-rose-500 z-10" 
                title="Strategy Threshold 22%" 
              />
              <div 
                className={`h-full rounded-full transition-all duration-300 ${
                  analysis15 && analysis15.confidence >= 22.0 ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${analysis15 ? Math.min(100, (analysis15.confidence / 40) * 100) : 0}%` }}
              />
            </div>
          </div>

          {/* Real-time Profit / Loss Updates */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between">
            <span className="text-[9px] text-slate-450 font-bold uppercase tracking-widest block mb-1">Session Profit / Loss</span>
            {(() => {
              const sessionPL = status.balance - (status.sessionStartBalance || status.balance);
              const isProfit = sessionPL > 0;
              const isLoss = sessionPL < 0;
              return (
                <div className="mt-1">
                  <span className={`font-mono font-black text-2xl leading-none ${
                    isProfit ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-slate-800"
                  }`}>
                    {isProfit ? "+" : ""}${sessionPL.toFixed(2)}
                  </span>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    <span>Balance: ${status.balance.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Signal Indicator & Status */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between">
            <span className="text-[9px] text-slate-450 font-bold uppercase tracking-widest block mb-1">Active Signal</span>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${
                signal15 && signal15.signal ? "bg-emerald-500 animate-ping" : "bg-slate-400"
              }`} />
              <span className={`font-mono font-black text-sm uppercase ${
                signal15 && signal15.signal ? "text-emerald-600" : "text-slate-500"
              }`}>
                {signal15 && signal15.signal ? "SIGNAL ACTIVE" : "SCANNING FEED"}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed mt-2" title={signal15?.reason || "Awaiting spot data stream..."}>
              {signal15 ? signal15.reason : "Awaiting spot data stream..."}
            </div>
          </div>
        </div>

        {/* 15-tick visual sliding tape specifically for the 15-tick analysis window */}
        <div className="p-3 bg-slate-50/50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] text-slate-450 font-bold uppercase tracking-wider shrink-0 select-none">
            <span>Window (15 Ticks):</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto justify-end flex-1 py-0.5">
            {analysis15 && analysis15.digits && analysis15.digits.length > 0 ? (
              analysis15.digits.map((d: number, index: number) => {
                const isDominant = d === analysis15.dominant_digit;
                let bgClass = "bg-white text-slate-600 border-slate-200";
                if (index === analysis15.digits.length - 1) {
                  bgClass = "bg-indigo-600 text-white border-indigo-600 shadow-sm font-bold ring-1 ring-indigo-500/20";
                } else if (isDominant) {
                  bgClass = "bg-emerald-550 text-white border-emerald-550 font-bold";
                }
                return (
                  <div 
                    key={index} 
                    className={`w-7 h-7 rounded text-[11px] font-mono font-semibold border flex items-center justify-center shrink-0 ${bgClass}`}
                  >
                    {d}
                  </div>
                );
              })
            ) : (
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Initializing 15-Tick Sliding Tape...</span>
            )}
          </div>
        </div>
      </section>

      {/* 3. Strategy Comparison Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Mode metrics side-by-side (7 columns) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-slate-500" />
                <h3 className="font-display font-black text-slate-800 text-xs uppercase tracking-widest">
                  Active Strategy Matrix
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">
                Comparing Modes
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Classic Card */}
              <div className={`p-4 rounded-lg border transition-all ${
                activeMode === "CLASSIC" 
                  ? "bg-slate-50/50 border-indigo-200/50" 
                  : "bg-transparent border-slate-200 opacity-60 hover:opacity-90"
              }`}>
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                  <span>Classic Engine</span>
                  {activeMode === "CLASSIC" && <span className="text-[9px] text-indigo-600 font-mono">● LIVE</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2.5 bg-white rounded border border-slate-200">
                    <span className="text-[9px] text-slate-450 uppercase tracking-widest block font-bold">Prediction</span>
                    <span className="font-mono font-black text-slate-800 text-2xl leading-none block mt-1">
                      {predictionDigit !== null ? predictionDigit : "—"}
                    </span>
                    <span className="text-[9px] text-indigo-600 font-mono mt-0.5 block">
                      {predictionDigit !== null 
                        ? `${frequencies.find(f => f.digit === predictionDigit)?.percentage}% Freq`
                        : "—"}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white rounded border border-slate-200">
                    <span className="text-[9px] text-slate-450 uppercase tracking-widest block font-bold">Trigger</span>
                    <span className="font-mono font-black text-amber-600 text-2xl leading-none block mt-1">
                      {triggerDigit !== null ? triggerDigit : "—"}
                    </span>
                    <span className="text-[9px] text-amber-700 font-mono mt-0.5 block">
                      {triggerDigit !== null 
                        ? `${frequencies.find(f => f.digit === triggerDigit)?.percentage}% Freq`
                        : "—"}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 leading-relaxed font-semibold">
                  Pure sliding frequency ratio. Triggers execution as soon as trigger digit appears in feed.
                </div>
              </div>

              {/* Smart Mode Card */}
              <div className={`p-4 rounded-lg border transition-all ${
                activeMode === "SMART" 
                  ? "bg-slate-50/50 border-indigo-200/80 shadow-xs" 
                  : "bg-transparent border-slate-200 opacity-60 hover:opacity-90"
              }`}>
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    Smart Engine
                  </span>
                  {activeMode === "SMART" && <span className="text-[9px] text-indigo-600 font-mono">● LIVE</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2.5 bg-white rounded border border-slate-200">
                    <span className="text-[9px] text-slate-450 uppercase tracking-widest block font-bold">Prediction</span>
                    <span className="font-mono font-black text-slate-800 text-2xl leading-none block mt-1">
                      {smartAnalysis ? smartAnalysis.predictionDigit : "—"}
                    </span>
                    <span className="text-[9px] text-indigo-600 font-mono mt-0.5 block">
                      {smartAnalysis ? `${smartAnalysis.confidenceScore}% Confidence` : "—"}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white rounded border border-slate-200">
                    <span className="text-[9px] text-slate-450 uppercase tracking-widest block font-bold">Trigger</span>
                    <span className="font-mono font-black text-amber-600 text-2xl leading-none block mt-1">
                      {smartAnalysis ? smartAnalysis.triggerDigit : "—"}
                    </span>
                    <span className="text-[9px] text-emerald-600 font-mono mt-0.5 block">
                      Score: {smartAnalysis ? smartAnalysis.tradeQualityScore : "—"}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 leading-relaxed font-semibold">
                  Weighs sub-window ranking stability, momentum, and historical digit sequence correlation.
                </div>
              </div>
            </div>
          </div>

          {/* Quick instructions widget */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <span className="font-bold text-slate-700 block mb-2 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-indigo-600" />
              Dynamic Execution Protocol:
            </span>
            <div className="text-xs leading-relaxed text-slate-600 space-y-1.5">
              <p>
                When the live spot stream encounters <span className="text-amber-700 font-bold">Trigger Digit ({displayTrigger ?? "—"})</span>, the system instantly posts a Matches Contract on <span className="text-indigo-600 font-bold">Prediction ({displayPrediction ?? "—"})</span>.
              </p>
              <p className="text-[11px] text-slate-400 leading-normal">
                {activeMode === "SMART" 
                  ? "💡 Active: Smart scoring evaluates whether the prediction/trigger coupling is stable enough for execution before placing simulated/live trades."
                  : "💡 Active: Classic Mode fires trades strictly on raw 120-tick sliding frequency."}
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Smart Recommendation Panel & Diagnostics Gauges (5 columns) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Active Strategy Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs relative overflow-hidden flex flex-col justify-between min-h-[300px]">
            {activeMode !== "SMART" && (
              <div className="absolute top-3 right-3 bg-indigo-50 text-indigo-600 border border-indigo-200 text-[8px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow-xs">
                Preview Mode
              </div>
            )}
            
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Target className="w-4 h-4 text-indigo-600" />
                <span className="text-slate-800 text-xs font-display font-black uppercase tracking-widest">
                  🎯 Active Strategy Card
                </span>
              </div>

              {smartAnalysis ? (
                <div className="space-y-4">
                  {/* Opportunity Details */}
                  <div className="bg-slate-50 border border-slate-200/60 rounded-lg p-3.5 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Selected Best Pair:</span>
                      <span className="font-mono font-bold text-slate-800">
                        Trigger [{smartAnalysis.triggerDigit}] → Predict [{smartAnalysis.predictionDigit}]
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Confidence Score:</span>
                      <span className={`font-mono font-black ${
                        smartAnalysis.confidenceScore >= 75 ? "text-emerald-600" : "text-amber-650"
                      }`}>
                        {smartAnalysis.confidenceScore}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Risk Exposure:</span>
                      <span className={`font-mono font-bold text-[10px] px-2 py-0.5 rounded ${
                        smartAnalysis.riskLevel === "LOW" 
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                          : smartAnalysis.riskLevel === "MEDIUM"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-rose-50 text-rose-600 border border-rose-200"
                      }`}>
                        {smartAnalysis.riskLevel}
                      </span>
                    </div>
                  </div>

                  {/* Smart Justification */}
                  <div className="text-xs leading-relaxed text-slate-600">
                    <span className="font-bold text-slate-700 block mb-1">Reason Summary:</span>
                    {smartAnalysis.reason}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mb-2 text-slate-300" />
                  <span className="font-mono text-[10px] uppercase tracking-wider">Calculating advanced opportunities...</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 mt-4 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span className="uppercase tracking-wider">Engine: Smart-M1-V1</span>
              <span>Updated live</span>
            </div>
          </div>

          {/* AI Pair Ranking Board */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center gap-1.5 mb-3.5 border-b border-slate-100 pb-2.5">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span className="text-slate-800 text-xs font-display font-black uppercase tracking-widest">
                🧠 AI Pair Ranking Board
              </span>
            </div>

            {smartAnalysis && smartAnalysis.combinations && smartAnalysis.combinations.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/50">
                <table className="w-full text-left border-collapse text-[11px] font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                      <th className="py-2 px-3 text-center">Rank</th>
                      <th className="py-2 px-3">Prediction</th>
                      <th className="py-2 px-3">Trigger</th>
                      <th className="py-2 px-3 text-right">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {smartAnalysis.combinations.slice(0, 3).map((combo, idx) => {
                      const isBest = idx === 0;
                      return (
                        <tr key={`${combo.trigger}_${combo.prediction}`} className={`hover:bg-slate-50 transition-colors ${
                          isBest ? "bg-indigo-50/40 font-semibold text-slate-800" : ""
                        }`}>
                          <td className="py-2 px-3 text-center text-slate-400 font-bold">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isBest ? "bg-indigo-50 text-indigo-600 border border-indigo-200" : "bg-white text-slate-500 border border-slate-200"
                            }`}>
                              {combo.prediction}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              {combo.trigger}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className={combo.confidence >= 80 ? "text-emerald-600 font-bold" : "text-amber-600"}>
                              {combo.confidence}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mb-2 text-slate-300" />
                <span className="text-[10px] uppercase tracking-wider">Awaiting Ranking Matrix...</span>
              </div>
            )}
          </div>

          {/* Indicators Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Market Stability Indicator */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[9px] text-slate-450 font-bold uppercase tracking-widest block mb-2">Market Stability</span>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono font-black text-slate-850 text-xl tracking-tight">
                    {smartAnalysis ? `${smartAnalysis.stabilityIndex}%` : "—"}
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase font-bold font-mono">
                    {smartAnalysis ? smartAnalysis.marketStability : "STABLE"}
                  </span>
                </div>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3.5 border border-slate-200/50 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    smartAnalysis && smartAnalysis.marketStability === "VOLATILE" 
                      ? "bg-rose-550" 
                      : smartAnalysis && smartAnalysis.marketStability === "TRENDING"
                      ? "bg-indigo-600"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${smartAnalysis ? smartAnalysis.stabilityIndex : 50}%` }}
                />
              </div>
            </div>

            {/* Trade Quality Score */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[9px] text-slate-450 font-bold uppercase tracking-widest block mb-2">Quality Score</span>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono font-black text-slate-850 text-xl tracking-tight">
                    {smartAnalysis ? `${smartAnalysis.tradeQualityScore}/100` : "—"}
                  </span>
                </div>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3.5 border border-slate-200/50 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    smartAnalysis && smartAnalysis.tradeQualityScore >= 75
                      ? "bg-emerald-500"
                      : smartAnalysis && smartAnalysis.tradeQualityScore >= 50
                      ? "bg-amber-500"
                      : "bg-rose-550"
                  }`}
                  style={{ width: `${smartAnalysis ? smartAnalysis.tradeQualityScore : 50}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Sliding Window Frequency Matrix Table */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4.5 h-4.5 text-indigo-600" />
            <h3 className="font-display font-black text-slate-800 text-xs uppercase tracking-widest">
              Sliding Window Frequency Matrix
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-450 font-bold uppercase tracking-wider">
            Total occurrences over {ticks.length} Ticks
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Table (7 cols) */}
          <div className="md:col-span-7 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                  <th className="pb-2.5">Digit</th>
                  <th className="pb-2.5">Window Occurrences</th>
                  <th className="pb-2.5">Distribution %</th>
                  <th className="pb-2.5 text-right">Relative Density</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {frequencies.map((freq) => {
                  const isPrediction = freq.digit === displayPrediction;
                  const isTrigger = freq.digit === displayTrigger;
                  const isLatest = ticks[ticks.length - 1]?.digit === freq.digit;
                  
                  return (
                    <tr 
                      key={freq.digit} 
                      className={`text-xs transition-colors hover:bg-slate-50 ${
                        isLatest ? "bg-indigo-50/20 font-medium" : ""
                      }`}
                    >
                      <td className="py-2.5 flex items-center gap-1.5">
                        <span className={`w-6 h-6 rounded flex items-center justify-center font-mono font-bold border text-xs ${
                          isPrediction 
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : isTrigger
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-50 text-slate-500 border-slate-200"
                        }`}>
                          {freq.digit}
                        </span>
                        {isLatest && (
                          <span className="text-[8px] bg-indigo-100 text-indigo-600 px-1 py-0.2 rounded font-mono font-bold uppercase tracking-widest shrink-0">
                            spot
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-550">
                        {freq.count} <span className="text-slate-400 text-[10px]">/ 120</span>
                      </td>
                      <td className="py-2.5 text-slate-800 font-bold">
                        {freq.percentage}%
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden inline-block ml-auto border border-slate-200/50">
                          <div 
                            className={`h-full rounded-full ${
                              isPrediction ? "bg-indigo-650" : isTrigger ? "bg-amber-500" : "bg-slate-400"
                            }`} 
                            style={{ width: `${Math.min(100, freq.percentage * 4.5)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Matrix Visualization Grid (5 cols) */}
          <div className="md:col-span-5 flex flex-col justify-between">
            <div>
              <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
                Real-time matrix grid showing current frequency highlights. A glowing dot signifies the most recent spot.
              </p>

              {/* Grid 2x5 */}
              <div className="grid grid-cols-5 gap-2.5">
                {Array.from({ length: 10 }).map((_, digit) => {
                  const freq = frequencies.find(f => f.digit === digit);
                  const isPrediction = digit === displayPrediction;
                  const isTrigger = digit === displayTrigger;
                  const isLatest = ticks[ticks.length - 1]?.digit === digit;

                  let gridBorder = "border-slate-200 bg-slate-50/30";
                  let badge = null;

                  if (isLatest) {
                    gridBorder = "border-indigo-500 bg-indigo-50/60 shadow-sm";
                    badge = <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse"></span>;
                  } else if (isPrediction) {
                    gridBorder = "border-indigo-200 bg-indigo-50/20";
                  } else if (isTrigger) {
                    gridBorder = "border-amber-200 bg-amber-50/20";
                  }

                  return (
                    <div 
                      key={digit} 
                      className={`border rounded-lg p-2.5 flex flex-col items-center justify-between relative min-h-[64px] transition-all ${gridBorder}`}
                    >
                      {badge}
                      <span className={`text-base font-mono font-bold ${
                        isPrediction ? "text-indigo-600 font-black" : isTrigger ? "text-amber-700 font-black" : "text-slate-500"
                      }`}>
                        {digit}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 mt-1 font-bold">
                        {freq ? `${Math.round(freq.percentage)}%` : "0%"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick stats on the grid */}
            <div className="mt-5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] leading-relaxed text-slate-500">
              <span className="font-bold text-slate-700 block mb-1 uppercase tracking-wider text-[10px]">📊 Distribution Balance:</span>
              Standard deviations are monitored over rolling blocks to isolate structural anomalies in the spot stream.
            </div>
          </div>
        </div>
      </section>

      {/* 5. Gemini AI Quantum Analysis Refinement Section */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {/* Toggle Header */}
        <button
          onClick={() => {
            if (!showAiReport) {
              requestAiReport();
            } else {
              setShowAiReport(!showAiReport);
            }
          }}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer text-left"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-display font-black text-slate-800 text-xs uppercase tracking-widest flex items-center gap-2">
                Gemini AI Quant Refinement
                <span className="text-[9px] bg-indigo-100 text-indigo-600 font-mono px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">
                  advanced
                </span>
              </h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Perform real-time machine intelligence anomaly and imbalance analysis on sliding window distribution.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {aiReport && !aiLoading && (
              <span className="text-[11px] text-indigo-600 font-mono font-bold uppercase tracking-wider">Report Ready</span>
            )}
            {showAiReport ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </button>

        {/* Report Content */}
        {showAiReport && (
          <div className="p-5 bg-slate-50/30">
            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                <p className="text-xs text-slate-600 font-bold uppercase tracking-wider font-mono">
                  Querying Gemini server-side...
                </p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono uppercase tracking-widest">
                  Reconstructing 120-tick frequency imbalance patterns.
                </p>
              </div>
            ) : aiError ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold uppercase tracking-widest block mb-1 text-[10px]">Quantum Analytics Failed</span>
                  {aiError}
                </div>
              </div>
            ) : aiReport ? (
              <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-5 shadow-sm max-h-[400px] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-2">
                  <span className="text-[10px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Executive Quantitative Summary
                  </span>
                  <button 
                    onClick={requestAiReport}
                    className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </button>
                </div>
                
                <div className="space-y-2 prose max-w-none">
                  {renderSimpleMarkdown(aiReport)}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

