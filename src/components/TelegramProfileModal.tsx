import React, { useState } from "react";
import { UserAccountProfile, StrategyConfig } from "../types";
import { triggerHaptic } from "../lib/telegram";

interface TelegramProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfile: UserAccountProfile;
  onSelectProfile?: (profile: UserAccountProfile) => void;
  config: StrategyConfig;
  onUpdateConfig: (newConf: Partial<StrategyConfig>) => void;
  derivMode: "SIMULATED" | "LIVE";
  onSwitchMode: (mode: "SIMULATED" | "LIVE") => void;
}

export default function TelegramProfileModal({
  isOpen,
  onClose,
  activeProfile,
  config,
  onUpdateConfig,
  derivMode,
  onSwitchMode
}: TelegramProfileModalProps) {
  const [tokenInput, setTokenInput] = useState(config.derivToken || "");
  const [appIdInput, setAppIdInput] = useState(config.derivAppId || "1089");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSaveToken = () => {
    triggerHaptic("success");
    onUpdateConfig({
      derivToken: tokenInput.trim(),
      derivAppId: appIdInput.trim()
    });
  };

  const shareLink = `https://t.me/DerivAITraderBot/app?startapp=${activeProfile.id}`;

  const copyShareLink = () => {
    triggerHaptic("selection");
    navigator.clipboard?.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
            <h3 className="font-bold text-slate-100 text-base">Telegram Mini App Profile</h3>
          </div>
          <button 
            onClick={() => {
              triggerHaptic("light");
              onClose();
            }}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-5 text-xs text-slate-300">
          
          {/* Active User Card */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/80 flex items-center space-x-3.5">
            {activeProfile.avatarUrl ? (
              <img 
                src={activeProfile.avatarUrl} 
                alt={activeProfile.name} 
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full border-2 border-cyan-500 object-cover shadow-lg"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white text-xl border-2 border-cyan-400 shadow-lg">
                {activeProfile.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-1.5">
                <h4 className="text-sm font-bold text-slate-100 truncate">{activeProfile.name}</h4>
                {activeProfile.isTelegram && (
                  <span className="bg-[#2481cc] text-white text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase">
                    Telegram
                  </span>
                )}
              </div>
              <p className="text-cyan-400 font-mono text-xs mt-0.5">{activeProfile.username}</p>
              <p className="text-[10px] text-slate-400 font-mono mt-1">Session ID: {activeProfile.id}</p>
            </div>
          </div>

          {/* Multi-User Isolation Note */}
          <div className="bg-blue-950/40 border border-blue-500/30 rounded-xl p-3 flex items-start space-x-2.5">
            <span className="text-blue-400 text-sm">🔒</span>
            <div className="space-y-1">
              <span className="font-semibold text-blue-300">Multi-User Account Isolation Active</span>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Every user has their own independent sandbox balance, automated trading state, safeguards, and personal Deriv API connection.
              </p>
            </div>
          </div>

          {/* User-Specific Deriv Token Setup */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-200">Personal Deriv API Account</label>
              <button 
                onClick={() => {
                  triggerHaptic("medium");
                  onSwitchMode(derivMode === "LIVE" ? "SIMULATED" : "LIVE");
                }}
                className={`text-[10px] font-bold px-2 py-1 rounded transition ${
                  derivMode === "LIVE" 
                    ? "bg-amber-500 text-slate-950 shadow" 
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                }`}
              >
                {derivMode === "LIVE" ? "⚡ Live Deriv Mode" : "🛡️ Switch to Live"}
              </button>
            </div>

            <div className="space-y-2 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
              <div>
                <label className="text-[10px] text-slate-400 font-semibold block mb-1">Personal API Token</label>
                <input 
                  type="password"
                  placeholder="Enter your Deriv API token (Read & Trade scopes)"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 font-semibold block mb-1">App ID</label>
                  <input 
                    type="text"
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                    placeholder="1089"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleSaveToken}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-1.5 px-3 rounded-lg transition shadow flex items-center justify-center space-x-1"
                  >
                    <span>Save Token</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Share Telegram Mini App Link */}
          <div className="border-t border-slate-800 pt-4 space-y-2">
            <label className="font-semibold text-slate-200">Share Mini App</label>
            <div className="flex items-center space-x-2">
              <input 
                type="text" 
                readOnly 
                value={shareLink} 
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-400 font-mono text-[11px] flex-1 truncate select-all"
              />
              <button
                onClick={copyShareLink}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg font-semibold transition"
              >
                {copied ? "Copied! ✓" : "Copy"}
              </button>
            </div>
          </div>

          {/* TMA Haptic Tester */}
          <div className="border-t border-slate-800 pt-4 flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-200 block">Telegram Haptics</span>
              <span className="text-[10px] text-slate-400">Feel vibration feedback inside Telegram</span>
            </div>
            <div className="flex space-x-1.5">
              {(["light", "medium", "heavy"] as const).map(style => (
                <button
                  key={style}
                  onClick={() => triggerHaptic(style)}
                  className="bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 px-2 py-1 rounded border border-slate-700 capitalize"
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-950 p-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={() => {
              triggerHaptic("light");
              onClose();
            }}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-5 py-1.5 rounded-xl transition shadow"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
