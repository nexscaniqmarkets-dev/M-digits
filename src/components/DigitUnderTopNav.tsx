import React from "react";
import { X, ChevronDown, MoreVertical, Box, RefreshCw, CheckCircle2, AlertCircle, Shield } from "lucide-react";
import { SystemStatus, UserAccountProfile } from "../types";

interface DigitUnderTopNavProps {
  status: SystemStatus;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeProfile: UserAccountProfile;
  onOpenProfile: () => void;
  onResetBalance?: () => void;
  onToggleSidebar: () => void;
}

export default function DigitUnderTopNav({
  status,
  activeTab,
  setActiveTab,
  activeProfile,
  onOpenProfile,
  onResetBalance,
  onToggleSidebar
}: DigitUnderTopNavProps) {
  const isConnected = status.connectionStatus === "CONNECTED";
  const isSimulated = status.derivMode === "SIMULATED";

  return (
    <header className="sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#E5E0D5] w-full max-w-full overflow-hidden shadow-2xs">
      {/* Top Title Bar */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-[#E5E0D5]/60">
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-2 rounded-xl text-[#2B2721] hover:bg-[#F4F1EA] transition cursor-pointer"
          title="Toggle Control Board / Close"
        >
          <X className="w-5 h-5 stroke-[2.5]" />
        </button>

        <button
          onClick={onOpenProfile}
          className="flex items-center gap-1.5 font-display font-black text-sm text-[#2B2721] hover:text-[#937238] transition cursor-pointer tracking-tight"
        >
          <span>Digit Under Bot</span>
          <ChevronDown className="w-4 h-4 stroke-[2.5] text-[#8C8377]" />
        </button>

        <button
          onClick={onOpenProfile}
          className="p-2 -mr-2 rounded-xl text-[#2B2721] hover:bg-[#F4F1EA] transition cursor-pointer"
          title="Account Profile & Options"
        >
          <MoreVertical className="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>

      {/* Sub-Header Brand & Balance Status Banner */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
        {/* Left: Brand Icon & Title */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-[#F4F1EA] border border-[#E4DFD3] text-[#937238] flex items-center justify-center shadow-2xs shrink-0">
            <Box className="w-5 h-5 stroke-[2.5]" />
          </div>
          <span className="font-display font-black text-xs sm:text-sm text-[#2B2721] tracking-wider uppercase">
            DIGIT UNDER BOT
          </span>
        </div>

        {/* Right: Pill Badges */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Demo Balance & Reset Pill */}
          <div className="bg-[#EAE5DC] text-[#5C5346] px-3 py-1.5 rounded-full text-xs font-mono font-bold flex items-center gap-2 border border-[#DFD9CE] shadow-2xs">
            <span className="text-[#8C8377] uppercase text-[11px] font-bold">
              {isSimulated ? "DEMO" : "LIVE"}
            </span>
            <span className="text-[#2B2721] font-black text-xs">
              ${status.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {isSimulated && onResetBalance && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Reset Demo Account balance back to $10,000.00?")) {
                    onResetBalance();
                  }
                }}
                className="text-[11px] font-sans font-black uppercase text-[#2B2721] hover:text-[#937238] underline cursor-pointer pl-1 transition"
              >
                RESET
              </button>
            )}
          </div>

          {/* Connection Pill */}
          <div
            onClick={() => setActiveTab("settings")}
            className={`cursor-pointer px-3 py-1 rounded-full text-xs font-bold tracking-wider flex items-center gap-1.5 transition shadow-2xs ${
              isConnected
                ? "bg-[#E3EFEA] text-[#1D7A58] border border-[#BDE0D1]"
                : "bg-amber-100 text-amber-800 border border-amber-300"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isConnected ? "bg-[#1D7A58] animate-pulse" : "bg-amber-600 animate-ping"
              }`}
            />
            <span className="text-[11px] uppercase font-mono font-black">
              {isConnected ? "CONNECTED" : "SYNCING..."}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
