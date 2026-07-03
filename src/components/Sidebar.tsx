import React from "react";
import { 
  Radio,
  Wallet,
  X,
  Bot,
  Activity,
  ShieldAlert,
  Sliders,
  AlertTriangle,
  TrendingUp,
  History,
  Shield
} from "lucide-react";
import { SystemStatus } from "../types";

interface SidebarProps {
  status: SystemStatus;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  onEmergencyStop: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ 
  status, 
  activeTab = "dashboard",
  setActiveTab,
  onEmergencyStop,
  isOpen,
  onClose
}: SidebarProps) {

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: TrendingUp, desc: "Market Analytics" },
    { id: "strategy", label: "Wallet Setup", icon: Wallet, desc: "Token & Credentials" },
    { id: "autotrade", label: "Auto-Trader", icon: Bot, desc: "Algorithmic Bot" },
    { id: "history", label: "Trade History", icon: History, desc: "Execution Ledger" }
  ];

  return (
    <>
      {/* Backdrop overlay for smaller/all screens when drawer is active */}
      {isOpen && (
        <div 
          id="sidebar-backdrop"
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 transition-opacity duration-300"
        />
      )}

      <aside 
        id="app-sidebar" 
        className={`w-72 bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 z-55 transition-transform duration-300 shadow-xl ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand & Identity */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold font-display text-lg shadow-sm shadow-indigo-500/10">
              Ω
            </div>
            <div>
              <h1 className="font-display font-black text-slate-800 tracking-tight leading-none text-base uppercase">
                M-Digits
              </h1>
              <span className="text-[9px] text-indigo-600 font-mono tracking-widest uppercase font-bold mt-1.5 block">
                Control Board
              </span>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* System Cabinet Indicators Content */}
        <div className="flex-1 p-5 space-y-6 overflow-y-auto bg-white">
          
          {/* Main Navigation Menu */}
          {setActiveTab && (
            <div className="space-y-2">
              <div className="space-y-1">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                  Navigation Menu
                </h3>
                <div className="h-px bg-slate-100 w-full" />
              </div>
              <div className="grid grid-cols-1 gap-1.5 pt-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        onClose();
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all text-left cursor-pointer ${
                        isActive
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                          : "bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100/80"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg ${isActive ? "bg-indigo-700 text-white" : "bg-white text-slate-500 border border-slate-200/60"}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-display font-bold text-xs leading-tight">{item.label}</div>
                          <div className={`text-[10px] font-mono truncate ${isActive ? "text-indigo-200" : "text-slate-400"}`}>
                            {item.desc}
                          </div>
                        </div>
                      </div>
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0 mr-1" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section Heading */}
          <div className="space-y-1">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
              Account Ledger
            </h3>
            <div className="h-px bg-slate-100 w-full" />
          </div>

          {/* Wallet / Balance */}
          <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200/50 flex items-center justify-center flex-shrink-0">
                <Wallet className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[8px] text-slate-500 font-mono font-bold uppercase tracking-widest leading-none">
                  {status.derivMode === "LIVE" ? "Live Deriv Account" : "Active Demo Balance"}
                </div>
                <div className="font-mono font-black text-slate-800 text-base tracking-tight truncate mt-1 block">
                  ${status.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {status.derivMode === "SIMULATED" && (
              <div className="pt-2 border-t border-emerald-100/80 flex items-center justify-between text-[10px] font-mono">
                <span className="text-slate-500 flex items-center gap-1 font-bold">
                  <Shield className="w-3 h-3 text-indigo-600" />
                  Reserved Safe:
                </span>
                <span className="font-black text-indigo-700">
                  ${(status.reservedBalance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {/* Section Heading */}
          <div className="space-y-1">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
              Live Connection Status
            </h3>
            <div className="h-px bg-slate-100 w-full" />
          </div>

          {/* Status Matrix Indicators */}
          <div className="space-y-3 bg-slate-50 p-4 border border-slate-200 rounded-xl">
            {/* Mode status */}
            <div className="flex items-center justify-between text-xs text-slate-600 py-1 border-b border-slate-100">
              <span className="flex items-center gap-2 font-bold text-[10px] uppercase tracking-wider">
                <Radio className={`w-4 h-4 ${status.derivMode === "LIVE" ? "text-rose-600 animate-pulse" : "text-indigo-600"}`} />
                Trading Mode:
              </span>
              <span className={`font-mono font-bold px-2 py-0.5 rounded text-[9px] uppercase tracking-wider ${
                status.derivMode === "LIVE" 
                  ? "bg-rose-50 text-rose-600 border border-rose-200" 
                  : "bg-indigo-50 text-indigo-600 border border-indigo-200"
              }`}>
                {status.derivMode}
              </span>
            </div>

            {/* Engine trading state */}
            <div className="flex items-center justify-between text-xs text-slate-600 py-1 border-b border-slate-100">
              <span className="flex items-center gap-2 font-bold text-[10px] uppercase tracking-wider">
                <Bot className="w-4 h-4 text-slate-500" />
                Algorithmic:
              </span>
              <span className={`font-mono font-bold px-2 py-0.5 rounded text-[9px] uppercase tracking-wider ${
                status.autoTrading 
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200 animate-pulse" 
                  : "bg-slate-100 text-slate-500 border border-slate-200"
              }`}>
                {status.autoTrading ? "ONLINE" : "OFFLINE"}
              </span>
            </div>

            {/* Websocket Stream state */}
            <div className="flex items-center justify-between text-xs text-slate-600 py-1">
              <span className="flex items-center gap-2 font-bold text-[10px] uppercase tracking-wider">
                <Activity className="w-4 h-4 text-indigo-600" />
                Stream Engine:
              </span>
              <span className={`font-mono font-bold px-2 py-0.5 rounded text-[9px] uppercase tracking-wider ${
                status.engineStatus === "RUNNING" 
                  ? "bg-indigo-50 text-indigo-600 border border-indigo-200" 
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}>
                {status.engineStatus}
              </span>
            </div>
          </div>

          {/* System Warning details */}
          <div className="p-3 bg-amber-50 border border-amber-200/60 rounded-xl text-[10px] text-amber-800 leading-relaxed flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold uppercase tracking-wider block mb-0.5 text-[9px] text-amber-700">Platform Advisory:</span>
              Keep parameters monitored. High volatility synthetic indices fluctuate rapidly. The automated bot matches digits based on live distribution calculations.
            </div>
          </div>

        </div>

        {/* Connection & Mode Indicator Panel bottom footer */}
        <div className="p-5 border-t border-slate-200 bg-slate-50 space-y-3.5">
          {/* Emergency Halt */}
          <button
            id="sidebar-emergency-halt"
            onClick={() => {
              onEmergencyStop();
              onClose();
            }}
            className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black text-xs transition-colors flex items-center justify-center gap-2 shadow-sm shadow-rose-600/10 uppercase tracking-wider cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
            Emergency Stop
          </button>
        </div>
      </aside>
    </>
  );
}

