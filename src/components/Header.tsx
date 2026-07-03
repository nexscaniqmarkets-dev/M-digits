import React from "react";
import { Link2, Unlink, RefreshCw, AlertCircle, Play, Pause, Menu, Wallet, TrendingUp, Bot, History, Shield } from "lucide-react";
import { SystemStatus } from "../types";

interface HeaderProps {
  status: SystemStatus;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  predictionDigit: number | null;
  triggerDigit: number | null;
  onToggleEngine: () => void;
  onToggleAutoTrade?: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function Header({
  status,
  activeTab,
  setActiveTab,
  predictionDigit,
  triggerDigit,
  onToggleEngine,
  onToggleAutoTrade,
  sidebarOpen,
  onToggleSidebar
}: HeaderProps) {
  
  const pageTitles: Record<string, string> = {
    dashboard: "Live Trading Analytics",
    strategy: "Wallet & Credentials Setup",
    autotrade: "Algorithmic Trade Console",
    history: "Trade Ledger & Diagnostics"
  };

  // Human readable symbol names
  const symbolNames: Record<string, string> = {
    "1HZ100V": "Volatility 100 (1s) Index",
    "1HZ10V": "Volatility 10 (1s) Index",
    "1HZ25V": "Volatility 25 (1s) Index",
    "1HZ50V": "Volatility 50 (1s) Index",
    "1HZ75V": "Volatility 75 (1s) Index",
    "R_10": "Volatility 10 Index",
    "R_100": "Volatility 100 Index",
    "R_25": "Volatility 25 Index",
    "R_50": "Volatility 50 Index",
    "R_75": "Volatility 75 Index"
  };

  const getStatusBadge = () => {
    switch (status.connectionStatus) {
      case "CONNECTED":
        return (
          <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] sm:text-[11px] font-medium font-mono uppercase tracking-wider shrink-0">
            <Link2 className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">Deriv: </span><span>Linked</span>
          </div>
        );
      case "CONNECTING":
        return (
          <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-[10px] sm:text-[11px] font-medium font-mono uppercase tracking-wider animate-pulse shrink-0">
            <RefreshCw className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
            <span>Syncing...</span>
          </div>
        );
      case "DISCONNECTED":
      default:
        return (
          <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-[10px] sm:text-[11px] font-medium font-mono uppercase tracking-wider shrink-0">
            <Unlink className="w-3 h-3 text-red-400 shrink-0" />
            <span>Dropped</span>
          </div>
        );
    }
  };

  return (
    <header id="app-header" className="h-14 sm:h-16 border-b border-slate-200 bg-white/90 backdrop-blur-md flex items-center justify-between px-3 sm:px-6 sticky top-[46px] sm:top-[49px] transition-all duration-300 z-30 shadow-xs w-full max-w-full overflow-hidden">
      {/* Title & Sidebar Toggle */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer shrink-0"
          title="Open Control Board"
        >
          <Menu className="w-5 h-5" />
        </button>
 
        <h2 className="font-display font-black text-slate-800 text-xs sm:text-sm tracking-wide uppercase ml-0.5 sm:ml-1.5 truncate">
          {pageTitles[activeTab] || "System Dashboard"}
        </h2>
        
        {/* Active Index */}
        <span className="hidden md:inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 bg-slate-50 border border-slate-200 text-slate-600 rounded font-mono font-bold ml-2 shrink-0">
          {configSymbolToLabel(status.symbol)}
        </span>
      </div>

      {/* Primary Navigation Tabs (Desktop / Tablet) */}
      <nav className="hidden lg:flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 shrink-0">
        {[
          { id: "dashboard", label: "Dashboard", icon: TrendingUp },
          { id: "strategy", label: "Wallet Setup", icon: Wallet },
          { id: "autotrade", label: "Auto-Trader", icon: Bot },
          { id: "history", label: "Trade History", icon: History }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-display font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-slate-400"}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Badges & Actions */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Active Balance Indicator Button */}
        <button
          onClick={onToggleSidebar}
          className="hidden md:flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-emerald-700 cursor-pointer transition-all shrink-0"
          title="Active Trading Balance"
        >
          <Wallet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="hidden xl:inline-block text-[10px] uppercase tracking-wider text-slate-500 font-sans font-medium">Active:</span>
          <span>${status.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </button>

        {status.derivMode === "SIMULATED" && (status.reservedBalance ?? 0) > 0 && (
          <button
            onClick={() => setActiveTab("strategy")}
            className="hidden lg:flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-indigo-700 cursor-pointer transition-all shrink-0"
            title="Reserved Safe Vault (Click to manage)"
          >
            <Shield className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="hidden xl:inline-block text-[10px] uppercase tracking-wider text-indigo-500 font-sans font-medium">Safe:</span>
            <span>${(status.reservedBalance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </button>
        )}
 
        {/* Instant Prediction Readout */}
        {(predictionDigit !== null || triggerDigit !== null) && (
          <div className="hidden xl:flex items-center gap-3 mr-2 text-xs border-r border-slate-200 pr-4">
            <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Signals:</span>
            <div className="flex items-center gap-1.5 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              <span className="text-indigo-600 text-[9px] font-mono font-bold">PRED:</span>
              <span className="font-mono font-black text-indigo-700 text-xs">{predictionDigit}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              <span className="text-amber-700 text-[9px] font-mono font-bold">TRIG:</span>
              <span className="font-mono font-black text-amber-800 text-xs">{triggerDigit}</span>
            </div>
          </div>
        )}
 
        {/* Global Strategic Auto-Trade Quick Action Button */}
        {onToggleAutoTrade && (
          <button
            onClick={onToggleAutoTrade}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-[11px] font-display font-black uppercase tracking-wider cursor-pointer transition-all shadow-sm shrink-0 ${
              status.autoTrading
                ? "bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 ring-2 ring-rose-500/30 animate-pulse"
                : "bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white border border-cyan-400/40 shadow-indigo-500/20"
            }`}
            title={status.autoTrading ? "Click to Stop Algorithmic Bot" : "Click to Start Algorithmic Bot"}
          >
            {status.autoTrading ? (
              <>
                <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 animate-spin" />
                <span>STOP BOT</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 fill-current" />
                <span>START BOT</span>
              </>
            )}
          </button>
        )}

        {/* Engine status toggle button */}
        <button
          onClick={onToggleEngine}
          className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors border shrink-0 ${
            status.engineStatus === "RUNNING"
              ? "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
              : "bg-amber-50 border-amber-200 hover:bg-amber-100/80 text-amber-700"
          }`}
 
          title={status.engineStatus === "RUNNING" ? "Click to Pause Streaming" : "Click to Resume Streaming"}
        >
          {status.engineStatus === "RUNNING" ? (
            <>
              <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 shrink-0" />
              <span className="hidden sm:inline">Stream: </span><span>Active</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 animate-pulse shrink-0" />
              <span className="hidden sm:inline">Stream: </span><span>Paused</span>
            </>
          )}
        </button>
 
        {/* Stream health status */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          {status.streamStatus === "LIVE" && status.engineStatus === "RUNNING" ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400"></span>
            </span>
          )}
          <span className="text-[11px] text-slate-500 font-mono uppercase tracking-wider">
            {status.engineStatus === "PAUSED" ? "Paused" : status.streamStatus === "LIVE" ? "Live" : "Muted"}
          </span>
        </div>
 
        {/* Connection status badge */}
        {getStatusBadge()}
      </div>
    </header>
  );

  function configSymbolToLabel(sym: string) {
    return symbolNames[sym] || sym;
  }
}
