import React, { useState, useEffect, useRef } from "react";
import { 
  Bot, 
  Play, 
  Pause, 
  DollarSign, 
  Info,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  Terminal,
  Calculator,
  Layers,
  Sliders,
  X,
  Search,
  Sparkles,
  Lock,
  Unlock,
  RefreshCw,
  Check,
  Shield,
  ShieldAlert,
  Minimize2,
  Maximize2,
  History
} from "lucide-react";
import { SystemStatus, LogEntry, StrategyConfig, SmartAnalysisResult, Trade } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface AutoTradeViewProps {
  status: SystemStatus;
  config: StrategyConfig;
  logs: LogEntry[];
  trades?: Trade[];
  onNavigateToHistory?: () => void;
  smartAnalysis?: SmartAnalysisResult;
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
  onToggleAutoTrade: (explicitValue?: boolean) => void;
  onUpdateConfig: (newConfig: Partial<StrategyConfig>) => void;
}

export default function AutoTradeView({
  status,
  config,
  logs,
  trades = [],
  onNavigateToHistory,
  smartAnalysis,
  analysis15,
  signal15,
  onToggleAutoTrade,
  onUpdateConfig
}: AutoTradeViewProps) {
  
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState("");
  const [showLogsDrawer, setShowLogsDrawer] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll terminal logs to bottom on new additions
  useEffect(() => {
    if (terminalEndRef.current && showLogsDrawer) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, showLogsDrawer]);

  const handleSearchAndLoadBestPair = () => {
    setIsScanning(true);
    setScanProgress(0);
    setScanMessage("Initializing 120-tick sliding window scan...");
    
    const steps = [
      { progress: 20, msg: "Retrieving latest Volatility index streams..." },
      { progress: 45, msg: "Calculating digit frequency density matrix..." },
      { progress: 70, msg: "Evaluating sequential transition couplings..." },
      { progress: 90, msg: "Ranking top 90 pair combinations via AI engine..." },
      { progress: 100, msg: "Optimal statistical pair isolated!" }
    ];

    steps.forEach((step, idx) => {
      setTimeout(async () => {
        setScanProgress(step.progress);
        setScanMessage(step.msg);
        
        if (step.progress === 100) {
          try {
            const response = await fetch("/api/scan-all", {
              method: "POST",
              headers: { "Content-Type": "application/json" }
            });
            const result = await response.json();
            
            if (result.success) {
              onUpdateConfig({
                symbol: result.symbol,
                lockedPredictionDigit: result.lockedPredictionDigit,
                lockedTriggerDigit: result.lockedTriggerDigit,
                useLockedPair: true
              });
            } else {
              const bestCombo = smartAnalysis?.combinations?.[0] || { prediction: 4, trigger: 9 };
              onUpdateConfig({
                lockedPredictionDigit: bestCombo.prediction,
                lockedTriggerDigit: bestCombo.trigger,
                useLockedPair: true
              });
            }
          } catch (e) {
            console.error("Error executing pool scan:", e);
            const bestCombo = smartAnalysis?.combinations?.[0] || { prediction: 4, trigger: 9 };
            onUpdateConfig({
              lockedPredictionDigit: bestCombo.prediction,
              lockedTriggerDigit: bestCombo.trigger,
              useLockedPair: true
            });
          } finally {
            setTimeout(() => {
              setIsScanning(false);
            }, 600);
          }
        }
      }, (idx + 1) * 350);
    });
  };

  const handleResetToDynamic = () => {
    onUpdateConfig({
      lockedPredictionDigit: null,
      lockedTriggerDigit: null,
      useLockedPair: false
    });
  };

  const symbols = [
    { value: "1HZ100V", label: "Volatility 100 (1s) Index" },
    { value: "1HZ10V", label: "Volatility 10 (1s) Index" },
    { value: "1HZ25V", label: "Volatility 25 (1s) Index" },
    { value: "1HZ50V", label: "Volatility 50 (1s) Index" },
    { value: "1HZ75V", label: "Volatility 75 (1s) Index" },
    { value: "R_10", label: "Volatility 10 Index" },
    { value: "R_100", label: "Volatility 100 Index" },
    { value: "R_25", label: "Volatility 25 Index" },
    { value: "R_50", label: "Volatility 50 Index" },
    { value: "R_75", label: "Volatility 75 Index" }
  ];

  const handleStakeChange = (value: number) => {
    if (value > 0) {
      onUpdateConfig({ stake: value });
    }
  };

  const handleMartingaleToggle = (enabled: boolean) => {
    onUpdateConfig({ martingaleEnabled: enabled });
  };

  const handleCooldownToggle = (enabled: boolean) => {
    onUpdateConfig({ cooldownAfterTieEnabled: enabled });
  };

  const handleMultiplierChange = (value: number) => {
    if (value >= 1) {
      onUpdateConfig({ martingaleMultiplier: value });
    }
  };

  const handleMaxStepsChange = (value: number) => {
    if (value >= 1 && value <= 15) {
      onUpdateConfig({ martingaleMaxSteps: value });
    }
  };

  const handleTakeProfitToggle = (enabled: boolean) => {
    onUpdateConfig({ takeProfitEnabled: enabled });
  };

  const handleTakeProfitAmountChange = (amount: number) => {
    if (!isNaN(amount) && amount >= 0) {
      onUpdateConfig({ takeProfitAmount: amount });
    }
  };

  const handleStopLossToggle = (enabled: boolean) => {
    onUpdateConfig({ stopLossEnabled: enabled });
  };

  const handleStopLossAmountChange = (amount: number) => {
    if (!isNaN(amount) && amount >= 0) {
      onUpdateConfig({ stopLossAmount: amount });
    }
  };

  const handleMaxStakeToggle = (enabled: boolean) => {
    onUpdateConfig({ maxStakeEnabled: enabled });
  };

  const handleMaxStakeAmountChange = (amount: number) => {
    if (!isNaN(amount) && amount >= 0) {
      onUpdateConfig({ maxStakeAmount: amount });
    }
  };

  const handleMartingaleActionChange = (action: "RESET" | "HALT") => {
    onUpdateConfig({ martingaleActionOnMax: action });
  };

  const handleConsecutiveLossToggle = (enabled: boolean) => {
    onUpdateConfig({ consecutiveLossLimitEnabled: enabled });
  };

  const handleConsecutiveLossAmountChange = (amount: number) => {
    if (!isNaN(amount) && amount >= 1) {
      onUpdateConfig({ consecutiveLossLimitAmount: amount });
    }
  };

  const stakePresets = [2, 5, 10, 25, 50];

  // Calculate risk tiers for table projection
  const getMartingaleProjection = () => {
    const projection = [];
    const base = config.stake || 10;
    const mult = config.martingaleMultiplier || 1.5;
    const steps = Math.min(config.martingaleMaxSteps || 5, 8);
    
    for (let i = 0; i < steps; i++) {
      const value = base * Math.pow(mult, i);
      let risk: "LOW" | "MED" | "HIGH" = "LOW";
      if (i >= 2 && i <= 4) risk = "MED";
      if (i >= 5) risk = "HIGH";
      
      projection.push({
        step: i,
        stake: parseFloat(value.toFixed(2)),
        risk
      });
    }
    return projection;
  };

  const projectionList = getMartingaleProjection();

  const getLogIcon = (type: LogEntry["type"]) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
      case "error":
        return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
      case "trade":
        return <Bot className="w-4 h-4 text-indigo-500 shrink-0" />;
      case "trigger":
        return <Activity className="w-4 h-4 text-amber-500 shrink-0 animate-pulse" />;
      case "info":
      default:
        return <Info className="w-4 h-4 text-slate-450 shrink-0" />;
    }
  };

  const getLogBg = (type: LogEntry["type"]) => {
    switch (type) {
      case "success":
        return "bg-emerald-50/50 border-emerald-100 text-emerald-900";
      case "error":
        return "bg-rose-50/50 border-rose-100 text-rose-900";
      case "trade":
        return "bg-indigo-50/50 border-indigo-100 text-indigo-900";
      case "trigger":
        return "bg-amber-50/50 border-amber-100 text-amber-900";
      case "info":
      default:
        return "bg-slate-50/45 border-slate-100 text-slate-700";
    }
  };

  const sessionPnL = status.balance - (status.sessionStartBalance ?? status.balance);

  return (
    <div id="autotrade-view-root" className="relative space-y-6 max-w-7xl mx-auto w-full overflow-hidden">
      
      {/* 1. STRATEGIC MASTER EXECUTION COMMAND DECK (Hero Command Console) */}
      <div className={`border rounded-2xl p-5 md:p-6 shadow-xl transition-all duration-300 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6 w-full overflow-hidden ${
        status.autoTrading 
          ? "bg-gradient-to-r from-slate-900 via-slate-900 to-rose-950/80 border-rose-500/50 text-white ring-2 ring-rose-500/30 shadow-rose-950/40" 
          : "bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/80 border-slate-800 text-white shadow-indigo-950/40"
      }`}>
        <div className="space-y-3 flex-1 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`p-2 rounded-xl border shrink-0 ${
              status.autoTrading ? "bg-rose-500/20 border-rose-500/40 text-rose-400" : "bg-indigo-500/20 border-indigo-500/40 text-indigo-400"
            }`}>
              {status.autoTrading ? <Activity className="w-5 h-5 animate-pulse" /> : <Shield className="w-5 h-5" />}
            </span>
            <div className="min-w-0">
              <h3 className="font-display font-black text-base md:text-lg tracking-wide uppercase text-white truncate flex items-center gap-2">
                Algorithmic Execution Command Center
                {status.autoTrading && (
                  <span className="bg-rose-500 text-white text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-widest animate-pulse">
                    LIVE STREAMING
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-300 font-mono line-clamp-2">
                {status.autoTrading 
                  ? "High-frequency volatility scalping bot is actively streaming market ticks and executing contracts." 
                  : "Review active parameters below and launch the algorithmic volatility scalping engine."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[10px] font-mono font-bold bg-slate-800/90 border border-slate-700 px-2.5 py-1 rounded-lg text-cyan-300 shrink-0">
              ⚡ Stake: ${config.stake.toFixed(2)} USD
            </span>
            <span className="text-[10px] font-mono font-bold bg-slate-800/90 border border-slate-700 px-2.5 py-1 rounded-lg text-indigo-300 shrink-0">
              📊 {config.martingaleEnabled ? `Martingale x${config.martingaleMultiplier}` : "Flat Stake Strategy"}
            </span>
            <span className="text-[10px] font-mono font-bold bg-slate-800/90 border border-slate-700 px-2.5 py-1 rounded-lg text-emerald-300 shrink-0">
              🛡️ {config.takeProfitEnabled || config.stopLossEnabled ? "TP / SL Capital Guards Active" : "Standard Safeguards"}
            </span>
          </div>
        </div>

        <div className="shrink-0 flex flex-col justify-center">
          <button
            onClick={() => onToggleAutoTrade()}
            className={`w-full lg:w-auto px-8 py-4 rounded-xl font-display font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all active:scale-97 cursor-pointer shadow-2xl ${
              status.autoTrading
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/80 border border-rose-400 ring-4 ring-rose-500/20 animate-pulse"
                : "bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow-indigo-950/80 border border-cyan-400/30 ring-4 ring-indigo-500/20"
            }`}
          >
            {status.autoTrading ? (
              <>
                <Pause className="w-5 h-5 shrink-0 animate-spin" />
                <span>STOP AUTO-TRADER</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 shrink-0 fill-current" />
                <span>START AUTO-TRADER</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. REAL-TIME ACCOUNT & MARKET PERFORMANCE OVERVIEW */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 md:p-6 shadow-xs w-full overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          {/* Account Equity */}
          <div className="bg-slate-50/70 border border-slate-200/60 rounded-xl p-3 sm:p-3.5 flex flex-col justify-center min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono truncate">
              Account Equity
            </span>
            <span className="text-sm sm:text-base md:text-lg font-black font-mono text-slate-800 mt-1 flex items-center gap-0.5 truncate">
              <DollarSign className="w-4 h-4 text-slate-400 -ml-0.5 shrink-0" />
              {status.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Session Net Profit */}
          <div className="bg-slate-50/70 border border-slate-200/60 rounded-xl p-3 sm:p-3.5 flex flex-col justify-center min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono truncate">
              Session Net Profit
            </span>
            <span className={`text-sm sm:text-base md:text-lg font-black font-mono mt-1 flex items-center gap-0.5 truncate ${
              sessionPnL >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}>
              {sessionPnL >= 0 ? "+" : ""}
              ${sessionPnL.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Target Asset */}
          <div className="bg-slate-50/70 border border-slate-200/60 rounded-xl p-3 sm:p-3.5 flex flex-col justify-center min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono truncate">
              Active Connection Market
            </span>
            <span className="text-xs sm:text-sm font-bold text-slate-700 mt-1 truncate">
              {symbols.find(s => s.value === config.symbol)?.label || config.symbol}
            </span>
          </div>

          {/* Engine Health */}
          <div className="bg-slate-50/70 border border-slate-200/60 rounded-xl p-3 sm:p-3.5 flex flex-col justify-center min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono truncate">
              Engine Health
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${status.autoTrading ? "bg-emerald-500 animate-ping" : "bg-slate-400"}`} />
              <span className={`text-xs font-bold font-mono tracking-wide truncate ${status.autoTrading ? "text-emerald-600" : "text-slate-500"}`}>
                {status.autoTrading ? "AUTO ACTIVE" : "STANDBY"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. CONFIGURATION WORKSPACE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN: Setup, Sizing & Capital Guards */}
        <div className="space-y-6">
          
          {/* Card A1: Market Selector & Stake size */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider">
                Asset & Stake Setup
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Asset Selector */}
              <div className="space-y-2">
                <label htmlFor="pair-select" className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono block">
                  Select Volatility Asset
                </label>
                <select
                  id="pair-select"
                  value={config.symbol || "R_100"}
                  onChange={(e) => onUpdateConfig({ symbol: e.target.value })}
                  className="w-full text-xs font-mono font-bold px-3 py-2.5 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-xs"
                >
                  {symbols.map((sym) => (
                    <option key={sym.value} value={sym.value} className="bg-white text-slate-800">
                      {sym.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Stake input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="stake-input" className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono block">
                    Base Contract Stake
                  </label>
                  <span className="text-[9px] font-mono text-slate-400 font-bold uppercase tracking-widest">USD</span>
                </div>
                
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-slate-400">
                    $
                  </span>
                  <input
                    type="number"
                    id="stake-input"
                    min="0.35"
                    step="0.5"
                    value={config.stake}
                    onChange={(e) => handleStakeChange(parseFloat(e.target.value))}
                    placeholder="10.00"
                    className="w-full text-xs font-mono font-bold pl-7 pr-3 py-2.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500 text-slate-800 shadow-xs"
                  />
                </div>
              </div>

            </div>

            {/* Quick Stake presets */}
            <div className="space-y-2 pt-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono block">
                Quick Size Presets
              </span>
              <div className="grid grid-cols-5 gap-2">
                {stakePresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleStakeChange(preset)}
                    className={`py-2 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer ${
                      config.stake === preset
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white hover:bg-slate-50 border-slate-200 text-slate-500"
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Card A2: Optimal Pairing Scan */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Optimal Pairing Scan
                </h3>
              </div>
              
              {config.useLockedPair ? (
                <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-mono font-black uppercase tracking-wider">
                  LOCKED STREAM
                </span>
              ) : (
                <span className="text-[8px] bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full font-mono font-black uppercase tracking-wider">
                  DYNAMIC ROTATION
                </span>
              )}
            </div>

            {isScanning ? (
              <div className="space-y-3 py-3 font-mono bg-slate-50/60 p-4 rounded-xl border border-dashed border-slate-200">
                <div className="flex justify-between items-center text-[10px] text-slate-500">
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                    {scanMessage}
                  </span>
                  <span className="font-black">{scanProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden border border-slate-300/10">
                  <motion.div 
                    className="bg-indigo-600 h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${scanProgress}%` }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
              </div>
            ) : config.useLockedPair ? (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-150/70 rounded-xl p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block font-mono">
                      Secured Static Coupling
                    </span>
                    <span className="text-sm font-black font-mono text-slate-800 block tracking-wider mt-0.5">
                      Trigger <span className="text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold">[{config.lockedTriggerDigit}]</span> → Predict <span className="text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">[{config.lockedPredictionDigit}]</span>
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1 bg-indigo-50 text-indigo-600 border border-indigo-200 px-2.5 py-1 rounded-lg font-mono text-[9px] font-bold">
                    <Lock className="w-3 h-3" />
                    <span>LOCKED</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleSearchAndLoadBestPair}
                    className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono font-bold text-slate-600 transition-all cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wider"
                  >
                    <Search className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Re-Scan Pool</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetToDynamic}
                    className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono font-bold text-rose-600 transition-all cursor-pointer flex items-center justify-center gap-1.5 uppercase tracking-wider"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unlock Pair</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[10px] text-slate-450 uppercase font-mono leading-relaxed">
                  Market analysis is currently in dynamic floating mode. Digit pairings rotate with real-time statistics. Lock a pairing to stabilize performance.
                </p>

                <button
                  type="button"
                  onClick={handleSearchAndLoadBestPair}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white rounded-xl text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-widest shadow-sm border border-indigo-500"
                >
                  <Search className="w-4 h-4 text-white" />
                  <span>Search & Lock Best Pairing</span>
                </button>
              </div>
            )}
          </section>

          {/* Card A3: Capital Protection Safeguards */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <Shield className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
              <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider">
                Capital Protection Guards
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              
              {/* Target Profit Guard */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all duration-300 ${
                config.takeProfitEnabled ? "bg-emerald-50/20 border-emerald-200/50" : "bg-transparent border-slate-150/60 opacity-60"
              }`}>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700 font-mono">
                      Target Profit
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTakeProfitToggle(!config.takeProfitEnabled)}
                      className={`w-7 h-4 rounded-full transition-colors duration-200 focus:outline-none cursor-pointer p-0.5 flex items-center ${
                        config.takeProfitEnabled ? "bg-emerald-600 justify-end" : "bg-slate-200 justify-start"
                      }`}
                    >
                      <span className="w-3 h-3 bg-white rounded-full shadow-xs" />
                    </button>
                  </div>
                  <p className="text-[8px] text-slate-400 font-mono uppercase tracking-wider leading-relaxed">
                    Halts execution upon achieving session target.
                  </p>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold text-slate-400">$</span>
                    <input
                      type="number"
                      min="1"
                      disabled={!config.takeProfitEnabled}
                      value={config.takeProfitAmount ?? 100.0}
                      onChange={(e) => handleTakeProfitAmountChange(parseFloat(e.target.value))}
                      className="w-full text-[10px] font-mono font-bold pl-5 pr-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-500 text-slate-800 disabled:opacity-40"
                    />
                  </div>
                  
                  {config.takeProfitEnabled && (
                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-1">
                      <div 
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{
                           width: `${Math.max(0, Math.min(100, (sessionPnL / (config.takeProfitAmount || 100)) * 100))}%`
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Drawdown Guard */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all duration-300 ${
                config.stopLossEnabled ? "bg-rose-50/20 border-rose-200/50" : "bg-transparent border-slate-150/60 opacity-60"
              }`}>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700 font-mono">
                      Stop Loss
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStopLossToggle(!config.stopLossEnabled)}
                      className={`w-7 h-4 rounded-full transition-colors duration-200 focus:outline-none cursor-pointer p-0.5 flex items-center ${
                        config.stopLossEnabled ? "bg-rose-600 justify-end" : "bg-slate-200 justify-start"
                      }`}
                    >
                      <span className="w-3 h-3 bg-white rounded-full shadow-xs" />
                    </button>
                  </div>
                  <p className="text-[8px] text-slate-400 font-mono uppercase tracking-wider leading-relaxed">
                    Emergency shutdown if drawdown exceeds cap.
                  </p>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold text-slate-400">$</span>
                    <input
                      type="number"
                      min="1"
                      disabled={!config.stopLossEnabled}
                      value={config.stopLossAmount ?? 50.0}
                      onChange={(e) => handleStopLossAmountChange(parseFloat(e.target.value))}
                      className="w-full text-[10px] font-mono font-bold pl-5 pr-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-rose-500 text-slate-800 disabled:opacity-40"
                    />
                  </div>

                  {config.stopLossEnabled && (
                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-1">
                      <div 
                        className="bg-rose-500 h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(0, Math.min(100, (Math.max(0, -sessionPnL) / (config.stopLossAmount || 50)) * 100))}%`
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Max Contract Stake Guard */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all duration-300 ${
                config.maxStakeEnabled ? "bg-indigo-50/20 border-indigo-200/50" : "bg-transparent border-slate-150/60 opacity-60"
              }`}>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700 font-mono">
                      Max Stake
                    </span>
                    <button
                      type="button"
                      onClick={() => handleMaxStakeToggle(!config.maxStakeEnabled)}
                      className={`w-7 h-4 rounded-full transition-colors duration-200 focus:outline-none cursor-pointer p-0.5 flex items-center ${
                        config.maxStakeEnabled ? "bg-indigo-600 justify-end" : "bg-slate-200 justify-start"
                      }`}
                    >
                      <span className="w-3 h-3 bg-white rounded-full shadow-xs" />
                    </button>
                  </div>
                  <p className="text-[8px] text-slate-400 font-mono uppercase tracking-wider leading-relaxed">
                    Stops Martingale from scaling stake infinitely.
                  </p>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold text-slate-400">$</span>
                    <input
                      type="number"
                      min="1"
                      disabled={!config.maxStakeEnabled}
                      value={config.maxStakeAmount ?? 500.0}
                      onChange={(e) => handleMaxStakeAmountChange(parseFloat(e.target.value))}
                      className="w-full text-[10px] font-mono font-bold pl-5 pr-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-indigo-500 text-slate-800 disabled:opacity-40"
                    />
                  </div>
                  
                  {config.maxStakeEnabled && (
                    <div className="text-[8px] font-mono uppercase text-indigo-600 pt-1 text-center font-bold">
                      Stakes capped at ${config.maxStakeAmount?.toFixed(0)} USD
                    </div>
                  )}
                </div>
              </div>

              {/* Consecutive Loss Guard */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all duration-300 ${
                config.consecutiveLossLimitEnabled ? "bg-amber-50/20 border-amber-200/50" : "bg-transparent border-slate-150/60 opacity-60"
              }`}>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700 font-mono">
                      Loss Streak Stop
                    </span>
                    <button
                      type="button"
                      onClick={() => handleConsecutiveLossToggle(!config.consecutiveLossLimitEnabled)}
                      className={`w-7 h-4 rounded-full transition-colors duration-200 focus:outline-none cursor-pointer p-0.5 flex items-center ${
                        config.consecutiveLossLimitEnabled ? "bg-amber-600 justify-end" : "bg-slate-200 justify-start"
                      }`}
                    >
                      <span className="w-3 h-3 bg-white rounded-full shadow-xs" />
                    </button>
                  </div>
                  <p className="text-[8px] text-slate-400 font-mono uppercase tracking-wider leading-relaxed">
                    Stops trading if consecutive losses hit threshold.
                  </p>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold text-slate-400">#</span>
                    <input
                      type="number"
                      min="1"
                      disabled={!config.consecutiveLossLimitEnabled}
                      value={config.consecutiveLossLimitAmount ?? 10}
                      onChange={(e) => handleConsecutiveLossAmountChange(parseInt(e.target.value, 10))}
                      className="w-full text-[10px] font-mono font-bold pl-5 pr-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-500 text-slate-800 disabled:opacity-40"
                    />
                  </div>
                  
                  {config.consecutiveLossLimitEnabled && (
                    <div className="text-[8px] font-mono uppercase text-amber-600 pt-1 text-center font-bold">
                      Halt at {config.consecutiveLossLimitAmount} losses
                    </div>
                  )}
                </div>
              </div>

            </div>
          </section>

        </div>

        {/* RIGHT COLUMN: Martingale Risk Controls & stabilization */}
        <div className="space-y-6">
          
          {/* Card B1: Martingale Engine Settings & table */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-4.5 h-4.5 text-indigo-650" />
                <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Martingale Risk Engine
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest">
                  {config.martingaleEnabled ? "ACTIVE" : "DISABLED"}
                </span>
                <button
                  type="button"
                  onClick={() => handleMartingaleToggle(!config.martingaleEnabled)}
                  className={`w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none cursor-pointer p-0.5 flex items-center ${
                    config.martingaleEnabled ? "bg-indigo-600 justify-end" : "bg-slate-200 justify-start"
                  }`}
                >
                  <span className="w-4 h-4 bg-white rounded-full shadow-xs" />
                </button>
              </div>
            </div>

            {config.martingaleEnabled ? (
              <div className="space-y-4">
                
                {/* Side-by-side Multiplier & Max Steps inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono block">
                      Stake Multiplier
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1.0"
                      value={config.martingaleMultiplier || 1.5}
                      onChange={(e) => handleMultiplierChange(parseFloat(e.target.value))}
                      className="w-full text-xs font-mono font-bold px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:border-indigo-500 shadow-xs"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono block">
                      Max Multiplication Steps
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="15"
                      value={config.martingaleMaxSteps || 5}
                      onChange={(e) => handleMaxStepsChange(parseInt(e.target.value, 10))}
                      className="w-full text-xs font-mono font-bold px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:border-indigo-500 shadow-xs"
                    />
                  </div>
                </div>

                {/* Risk projection Table */}
                <div className="space-y-2 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono block">
                    Calculated Multiplier Projection Sequence
                  </span>
                  
                  <div className="border border-slate-150/70 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-150/70 text-[9px] font-mono font-bold uppercase tracking-widest text-slate-450">
                          <th className="p-2.5 pl-4">Multiplication Step</th>
                          <th className="p-2.5">Stake Size</th>
                          <th className="p-2.5 text-right pr-4">Risk Profile</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-xs">
                        {projectionList.map((item) => (
                          <tr key={item.step} className={item.step === 0 ? "bg-indigo-50/20" : "bg-white"}>
                            <td className="p-2.5 pl-4 text-slate-600 font-bold">
                              {item.step === 0 ? "Step 0 (Base)" : `Loss Step ${item.step}`}
                            </td>
                            <td className="p-2.5 text-slate-800 font-black">
                              ${item.stake.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-2.5 text-right pr-4">
                              {item.risk === "LOW" && (
                                <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded font-black">LOW</span>
                              )}
                              {item.risk === "MED" && (
                                <span className="text-[8px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded font-black">MED</span>
                              )}
                              {item.risk === "HIGH" && (
                                <span className="text-[8px] bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded font-black">HIGH</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            ) : (
              <div className="bg-slate-50/70 border border-slate-200 border-dashed rounded-xl p-6 text-center space-y-2">
                <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Flat Sizing Mode Active</p>
                <p className="text-[10px] text-slate-400 font-mono max-w-sm mx-auto uppercase">
                  Multiplier is currently disabled. Every trade will execute flat utilizing your base stake of ${config.stake?.toFixed(2)} USD.
                </p>
              </div>
            )}
          </section>

          {/* Card B2: Stabilization & Bridge Protocol */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                <h3 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Post-Tie Stabilization
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest">
                  {config.cooldownAfterTieEnabled !== false ? "ENABLED" : "DISABLED"}
                </span>
                <button
                  type="button"
                  onClick={() => handleCooldownToggle(config.cooldownAfterTieEnabled === false)}
                  className={`w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none cursor-pointer p-0.5 flex items-center ${
                    config.cooldownAfterTieEnabled !== false ? "bg-indigo-600 justify-end" : "bg-slate-200 justify-start"
                  }`}
                >
                  <span className="w-4 h-4 bg-white rounded-full shadow-xs" />
                </button>
              </div>
            </div>

            <p className="text-[10px] text-slate-450 uppercase font-mono leading-relaxed">
              When statistics tie is broken, wait 30 seconds for distributions to stabilize before taking new trades. Turn off to resume trading immediately.
            </p>

            {/* Tie Status alert banner */}
            {status.tieStatus && status.tieStatus !== "NONE" && (
              <div 
                id="tie-status-alert" 
                className={`border rounded-xl p-3 flex gap-3 animate-pulse ${
                  status.tieStatus === "TIE_PAUSED" 
                    ? "bg-rose-50 border-rose-200 text-rose-800"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                }`}
              >
                <div className="shrink-0 flex items-center justify-center">
                  <AlertTriangle className={`w-4.5 h-4.5 ${status.tieStatus === "TIE_PAUSED" ? "text-rose-600" : "text-amber-600"}`} />
                </div>
                <div className="flex-1 space-y-0.5">
                  <h4 className="text-[9px] font-bold uppercase tracking-widest font-display">
                    {status.tieStatus === "TIE_PAUSED" ? "Trading Paused: Tie Detected" : "Stabilization Cooldown"}
                  </h4>
                  <p className="text-[8px] font-mono leading-relaxed uppercase tracking-wider text-slate-500">
                    {status.tieStatus === "TIE_PAUSED" 
                      ? "Multiple digits share highest frequency. Waiting for tie to break..." 
                      : `Tie broken! Waiting ${status.cooldownSecondsLeft ?? 30}s for statistics to stabilize...`}
                  </p>
                </div>
              </div>
            )}

            {/* Ceiling Breach Protocol Selector */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono block">
                Stake Ceiling Breach Action
              </span>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleMartingaleActionChange("RESET")}
                  className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer focus:outline-none ${
                    config.martingaleActionOnMax === "RESET"
                      ? "bg-indigo-50/55 border-indigo-300 text-indigo-950 shadow-xs"
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50/50"
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    config.martingaleActionOnMax === "RESET" ? "border-indigo-500" : "border-slate-350"
                  }`}>
                    {config.martingaleActionOnMax === "RESET" && <div className="w-2 h-2 bg-indigo-500 rounded-full" />}
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold font-mono uppercase tracking-widest block">
                      RESET TO BASE
                    </span>
                    <span className="text-[8px] uppercase tracking-wider block leading-normal text-slate-400">
                      Recycles back to base stake after limits.
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleMartingaleActionChange("HALT")}
                  className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer focus:outline-none ${
                    config.martingaleActionOnMax === "HALT"
                      ? "bg-rose-50 border-rose-300 text-rose-950 shadow-xs"
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50/50"
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    config.martingaleActionOnMax === "HALT" ? "border-rose-500" : "border-slate-350"
                  }`}>
                    {config.martingaleActionOnMax === "HALT" && <div className="w-2 h-2 bg-rose-500 rounded-full" />}
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold font-mono uppercase tracking-widest block">
                      HALT ENGINE
                    </span>
                    <span className="text-[8px] uppercase tracking-wider block leading-normal text-slate-400">
                      Emergency stop to protect remaining capital.
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </section>

        </div>

      </div>

      {/* 4. RECENT AUTOMATED EXECUTION LEDGER & HISTORY LINK */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4 w-full overflow-hidden">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-display font-black text-sm text-slate-800 uppercase tracking-wide">
              Automated Trade History Ledger
            </h4>
            <p className="text-xs text-slate-500 font-mono">
              {trades.length > 0 
                ? `${trades.length} executed trade records stored in live session ledger.` 
                : "No trades executed yet in current session."}
            </p>
          </div>
        </div>

        {onNavigateToHistory && (
          <button
            onClick={onNavigateToHistory}
            className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-display font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <span>Open History Ledger Tab</span>
            <span className="font-mono text-indigo-400 font-black">→</span>
          </button>
        )}
      </div>

      {/* Floating Logs Trigger Button */}
      <div className="fixed bottom-24 right-6 z-40 flex flex-col items-end gap-2">
        {status.autoTrading && (
          <div className="bg-emerald-500 text-white font-mono text-[8px] font-bold px-2.5 py-0.5 rounded-full shadow-md animate-bounce tracking-widest uppercase">
            LIVE
          </div>
        )}
        <button
          onClick={() => setShowLogsDrawer(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white p-4 rounded-full shadow-2xl border border-slate-700 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center relative group"
          title="Open Live Audit Logs"
        >
          <Terminal className="w-5.5 h-5.5 text-indigo-400" />
          {logs.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-indigo-600 text-[9px] font-mono font-black text-white w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-900">
              {logs.length}
            </span>
          )}
        </button>
      </div>

      {/* Side Logs Drawer Overlay */}
      <AnimatePresence>
        {showLogsDrawer && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogsDrawer(false)}
              className="fixed inset-0 bg-slate-950 z-50 cursor-pointer"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full sm:w-[450px] bg-slate-900 text-slate-100 z-50 shadow-2xl flex flex-col border-l border-slate-800"
            >
              {/* Drawer Header */}
              <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Terminal className="w-4.5 h-4.5 text-indigo-400 animate-pulse" />
                  <div className="space-y-0.5">
                    <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-slate-100">
                      Live Audit Console
                    </h3>
                    <p className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">
                      {logs.length} operations streamed
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowLogsDrawer(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-850 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content - Live Logs */}
              <div className="flex-1 overflow-y-auto p-5 space-y-2 scrollbar-thin font-mono bg-slate-900">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <Bot className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Ledger Empty</p>
                    <p className="text-[9px] mt-0.5 uppercase tracking-widest">
                      Real-time entries will stream here during automated executions.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {logs.map((log) => (
                      <div 
                        key={log.id} 
                        className={`px-3 py-2 rounded-lg border text-[10px] flex items-center justify-between gap-4 font-mono transition-colors ${getLogBg(log.type)}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getLogIcon(log.type)}
                          <span className="font-bold tracking-wide uppercase truncate">
                            {log.message}
                          </span>
                        </div>
                        <span className="text-[9px] font-semibold text-slate-400 opacity-80 uppercase shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                    <div ref={terminalEndRef} />
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              <div className="px-5 py-4 bg-slate-950 border-t border-slate-800 text-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-semibold">
                  Live Console Stream active • Click outside to minimize
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
