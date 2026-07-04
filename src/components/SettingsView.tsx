import React, { useState } from "react";
import { Settings, Lock, Globe, RefreshCw, CheckCircle, Shield, Volume2, Smartphone, Key, Bell, ExternalLink } from "lucide-react";
import { StrategyConfig, SystemStatus } from "../types";
import { saveToCloudStorage } from "../lib/telegram";

interface SettingsViewProps {
  config: StrategyConfig;
  status: SystemStatus;
  onUpdateConfig: (newConfig: Partial<StrategyConfig> & { derivMode?: "SIMULATED" | "LIVE" }) => void;
}

export default function SettingsView({
  config,
  status,
  onUpdateConfig,
}: SettingsViewProps) {
  const [token, setToken] = useState(config.derivToken || "");
  const [appId, setAppId] = useState(config.derivAppId || "1089");
  const [isUpdating, setIsUpdating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setSuccessMessage(null);

    try {
      const trimmedToken = token.trim();
      const trimmedAppId = appId.trim();
      await onUpdateConfig({
        derivToken: trimmedToken,
        derivAppId: trimmedAppId,
        derivMode: status.derivMode
      });
      // Persist to Telegram's CloudStorage too, so the token survives a
      // server redeploy (Render's free tier wipes local disk on every
      // deploy — CloudStorage lives on Telegram's side, not ours).
      await Promise.all([
        saveToCloudStorage("deriv_token", trimmedToken),
        saveToCloudStorage("deriv_app_id", trimmedAppId)
      ]);
      setSuccessMessage("✅ Live Deriv Gateway & Credentials synchronized successfully!");
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto pb-16 w-full space-y-5 animate-fadeIn">
      {/* Title Header */}
      <div className="bg-white border border-[#E5E0D5] rounded-3xl p-6 shadow-xs space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#F4F1EA] border border-[#E4DFD3] text-[#937238] flex items-center justify-center">
            <Settings className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h2 className="font-display font-black text-lg text-[#2B2721] tracking-tight uppercase">
              System Settings & Gateway
            </h2>
            <p className="text-xs text-[#8C8377] font-medium">
              Manage live Deriv API tokens, application identifiers, and notifications
            </p>
          </div>
        </div>
      </div>

      {/* Live Gateway Credentials Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-[#E5E0D5] rounded-3xl p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-[#E5E0D5]/60 pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-[#937238]" />
            <h3 className="font-display font-black text-xs text-[#2B2721] uppercase tracking-widest">
              API Gateway Configuration
            </h3>
          </div>
          <span className="text-[10px] font-mono font-bold bg-[#F4F1EA] text-[#937238] px-2.5 py-0.5 rounded-full uppercase">
            WebSocket Auth
          </span>
        </div>

        <div className="p-4 bg-[#FAF8F5] border border-[#E5E0D5] rounded-2xl text-xs text-[#665F55] space-y-1.5 leading-relaxed">
          <p>
            To execute trades on your real or demo Deriv account over WebSocket, generate an API token from your Deriv Security tab with <strong>Read</strong> and <strong>Trade</strong> scopes enabled.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[#665F55] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#8C8377]" />
              Deriv API Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="••••••••••••••••••••"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="w-full text-xs px-4 py-3.5 border border-[#E5E0D5] rounded-2xl bg-[#FAF8F5] text-[#2B2721] focus:outline-none focus:border-[#937238] focus:bg-white font-mono transition"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[#665F55] flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#8C8377]" />
              Application ID
            </label>
            <input
              type="text"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="1089"
              className="w-full text-xs px-4 py-3.5 border border-[#E5E0D5] rounded-2xl bg-[#FAF8F5] text-[#2B2721] focus:outline-none focus:border-[#937238] focus:bg-white font-mono transition"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                { id: "1089", label: "1089 (API Default)" },
                { id: "16929", label: "16929 (Deriv Official)" },
                { id: "1911", label: "1911 (Deriv DBot)" }
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAppId(item.id)}
                  className={`px-3 py-1.5 text-[10px] rounded-xl border font-mono font-bold transition cursor-pointer ${
                    appId === item.id
                      ? "bg-[#937238] border-[#81632E] text-white"
                      : "bg-[#FAF8F5] border-[#E5E0D5] text-[#665F55] hover:bg-[#F4F1EA]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {successMessage && (
          <div className="p-3.5 bg-[#F4F1EA] border border-[#937238]/40 rounded-2xl text-xs font-mono text-[#2B2721] flex items-center gap-2 animate-fadeIn">
            <CheckCircle className="w-4 h-4 text-[#937238] shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isUpdating}
          className="w-full py-4 rounded-2xl bg-[#937238] hover:bg-[#81632E] active:bg-[#705526] disabled:opacity-50 text-white font-display font-black text-xs uppercase tracking-widest transition cursor-pointer shadow-md flex items-center justify-center gap-2"
        >
          {isUpdating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Connecting Gateway...</span>
            </>
          ) : (
            <span>Save & Connect Live Gateway</span>
          )}
        </button>
      </form>

      {/* Preferences Section */}
      <div className="bg-white border border-[#E5E0D5] rounded-3xl p-6 shadow-xs space-y-4">
        <h3 className="font-display font-black text-xs text-[#2B2721] uppercase tracking-widest border-b border-[#E5E0D5]/60 pb-3">
          App Preferences & Audio
        </h3>

        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#FAF8F5] border border-[#E5E0D5] flex items-center justify-center text-[#937238]">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-[#2B2721]">Trade Voice Synthesizer</div>
              <div className="text-[10px] text-[#8C8377]">Announce winning & losing contracts</div>
            </div>
          </div>
          <div className="bg-[#937238] text-white text-[10px] font-mono font-bold px-2.5 py-1 rounded-full uppercase">
            ACTIVE
          </div>
        </div>

        <div className="flex items-center justify-between py-2 border-t border-[#E5E0D5]/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#FAF8F5] border border-[#E5E0D5] flex items-center justify-center text-[#937238]">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-[#2B2721]">Haptic Engine Impact</div>
              <div className="text-[10px] text-[#8C8377]">Telegram mobile vibration response</div>
            </div>
          </div>
          <div className="bg-[#937238] text-white text-[10px] font-mono font-bold px-2.5 py-1 rounded-full uppercase">
            ENABLED
          </div>
        </div>
      </div>
    </div>
  );
}
