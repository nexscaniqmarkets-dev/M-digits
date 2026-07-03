import React from "react";
import { UserAccountProfile } from "../types";
import { triggerHaptic } from "../lib/telegram";

interface TelegramHeaderProps {
  profile: UserAccountProfile;
  onOpenProfile: () => void;
  derivMode: "SIMULATED" | "LIVE";
  balance: number;
}

export default function TelegramHeader({
  profile,
  onOpenProfile,
  derivMode,
  balance
}: TelegramHeaderProps) {
  return (
    <div className="bg-slate-900 border-b border-slate-800 px-3 py-2 flex items-center justify-between sticky top-0 z-40 shadow-md w-full max-w-full overflow-hidden">
      {/* Left side: Telegram Identity Badge */}
      <div 
        onClick={() => {
          triggerHaptic("light");
          onOpenProfile();
        }}
        className="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer group hover:bg-slate-800/80 px-1.5 sm:px-2 py-1 rounded-lg transition min-w-0 shrink"
      >
        <div className="relative">
          {profile.avatarUrl ? (
            <img 
              src={profile.avatarUrl} 
              alt={profile.name} 
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full border border-cyan-500/50 object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white text-xs border border-cyan-400">
              {profile.name.charAt(0)}
            </div>
          )}
          {profile.isTelegram && (
            <span className="absolute -bottom-0.5 -right-0.5 bg-[#2481cc] text-white rounded-full p-0.5 shadow">
              <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            </span>
          )}
        </div>
        <div className="flex flex-col">
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-semibold text-slate-100 max-w-[120px] truncate">
              {profile.name}
            </span>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded group-hover:bg-slate-700">
              ▼
            </span>
          </div>
          <span className="text-[10px] text-cyan-400 font-mono leading-none">
            {profile.username}
          </span>
        </div>
      </div>

      {/* Right side: Multi-User Account Badge & Balance */}
      <div className="flex items-center space-x-2">
        <div className="flex flex-col items-end">
          <span className={`text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded uppercase ${
            derivMode === "LIVE" 
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" 
              : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
          }`}>
            {derivMode === "LIVE" ? "⚡ DERIV LIVE" : "🛡️ TMA SANDBOX"}
          </span>
          <span className="text-xs font-mono font-bold text-slate-100 mt-0.5">
            ${balance.toFixed(2)}
          </span>
        </div>
        
        <button
          onClick={() => {
            triggerHaptic("medium");
            onOpenProfile();
          }}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition border border-slate-700"
          title="Account Switcher & Telegram Profile"
        >
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
