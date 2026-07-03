import React, { useState } from "react";
import { 
  CheckCircle, 
  ShieldCheck, 
  Wallet,
  ArrowDown,
  ArrowUp,
  Banknote,
  Landmark,
  Shield
} from "lucide-react";
import { StrategyConfig, SystemStatus } from "../types";

interface StrategyViewProps {
  config: StrategyConfig;
  status: SystemStatus;
  onUpdateConfig: (newConfig: Partial<StrategyConfig> & { derivMode?: 'SIMULATED' | 'LIVE' }) => void;
  onResetTrades?: () => void;
  onResetBalance?: () => void;
  onVaultAction?: (subAction: 'DEPOSIT' | 'WITHDRAW' | 'WITHDRAW_ALL' | 'SET_ACTIVE_LEAVE', amount?: number) => Promise<void> | void;
}

export default function StrategyView({
  status,
  onUpdateConfig,
  onResetBalance,
  onVaultAction
}: StrategyViewProps) {
  const [transferAmount, setTransferAmount] = useState("");
  const [direction, setDirection] = useState<"TO_BANK" | "TO_TRADING">("TO_BANK");
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleModeSwitch = async (newMode: "SIMULATED" | "LIVE") => {
    try {
      await onUpdateConfig({ derivMode: newMode });
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmTransfer = async () => {
    if (!onVaultAction) return;
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      setMessage("⚠️ Please enter a valid transfer amount greater than 0.");
      return;
    }

    setIsProcessing(true);
    setMessage(null);
    try {
      if (direction === "TO_BANK") {
        if (amount > status.balance) {
          setMessage("⚠️ Insufficient available balance for deposit into bank.");
          setIsProcessing(false);
          return;
        }
        await onVaultAction("DEPOSIT", amount);
        setMessage(`✅ Successfully transferred $${amount.toFixed(2)} to Reserved Bank.`);
      } else {
        const currentReserved = status.reservedBalance ?? 0;
        if (amount > currentReserved) {
          setMessage("⚠️ Insufficient reserved bank funds for transfer to trading.");
          setIsProcessing(false);
          return;
        }
        await onVaultAction("WITHDRAW", amount);
        setMessage(`✅ Successfully moved $${amount.toFixed(2)} to Active Trading Balance.`);
      }
      setTransferAmount("");
    } catch (err: any) {
      setMessage(`❌ Transfer failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const activeBalanceFormatted = status.balance.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const reservedBankFormatted = (status.reservedBalance ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const isSimulated = status.derivMode === "SIMULATED";

  return (
    <div className="max-w-xl mx-auto pb-16 w-full space-y-4 animate-fadeIn">
      {/* ACCOUNT MODE Selector */}
      <div className="space-y-2">
        <label className="text-[11px] font-mono font-bold tracking-widest text-[#665F55] uppercase block px-1">
          ACCOUNT MODE
        </label>
        <div className="bg-[#F4F1EA] p-1.5 rounded-2xl border border-[#E4DFD3] grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleModeSwitch("LIVE")}
            className={`py-3.5 px-4 rounded-xl font-display text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              !isSimulated
                ? "bg-white text-[#2B2721] font-black shadow-xs border border-[#E5E0D5]"
                : "text-[#8C8377] hover:text-[#5C5346] font-bold"
            }`}
          >
            DERIV ACCOUNT
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch("SIMULATED")}
            className={`py-3.5 px-4 rounded-xl font-display text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer ${
              isSimulated
                ? "bg-white text-[#2B2721] font-black shadow-xs border border-[#E5E0D5]"
                : "text-[#8C8377] hover:text-[#5C5346] font-bold"
            }`}
          >
            SANDBOX DEMO
          </button>
        </div>
      </div>

      {/* AVAILABLE BALANCE Card */}
      <div className="bg-white border border-[#E5E0D5] rounded-3xl p-6 shadow-xs relative overflow-hidden transition-all hover:border-[#937238]/40">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-bold tracking-widest text-[#665F55] uppercase block">
              AVAILABLE BALANCE
            </span>
            <div className="font-display font-black text-3xl sm:text-4xl text-[#2B2721] mt-3 tracking-tight">
              ${activeBalanceFormatted}
            </div>
            <span className="text-[11px] font-bold text-[#8C8377] mt-1.5 uppercase tracking-wider block">
              {isSimulated ? "DEMO ACCOUNT" : "LIVE TRADING ACCOUNT"}
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#F4F1EA] border border-[#E4DFD3] flex items-center justify-center text-[#937238] shadow-2xs shrink-0">
            <Banknote className="w-6 h-6 stroke-[2]" />
          </div>
        </div>
      </div>

      {/* RESERVED BANK Card */}
      <div className="bg-white border border-[#E5E0D5] rounded-3xl p-6 shadow-xs relative overflow-hidden transition-all hover:border-[#937238]/40">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-bold tracking-widest text-[#665F55] uppercase block">
              RESERVED BANK
            </span>
            <div className="font-display font-black text-3xl sm:text-4xl text-[#2B2721] mt-3 tracking-tight">
              ${reservedBankFormatted}
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#F4F1EA] border border-[#E4DFD3] flex items-center justify-center text-[#937238] shadow-2xs shrink-0">
            <Landmark className="w-6 h-6 stroke-[2]" />
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-[#F4F1EA] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-black text-[#665F55] uppercase tracking-wider">
            <Shield className="w-4 h-4 text-[#937238] fill-[#937238]/20" />
            <span>SECURED</span>
          </div>
          {isSimulated && onResetBalance && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Reset demo bank and active trading balance back to $10,000.00?")) {
                  onResetBalance();
                }
              }}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 underline cursor-pointer transition"
            >
              Reset bank
            </button>
          )}
        </div>
      </div>

      {/* INTERNAL TRANSFER Card */}
      <div className="bg-white border border-[#E5E0D5] rounded-3xl p-6 shadow-xs space-y-5">
        <span className="font-display font-black text-sm tracking-widest text-[#2B2721] uppercase block">
          INTERNAL TRANSFER
        </span>

        <div className="space-y-2">
          <label className="text-[10px] font-mono font-bold tracking-widest text-[#665F55] uppercase block">
            AMOUNT TO MOVE
          </label>
          <div className="bg-[#FAF8F5] border border-[#E4DFD3] rounded-2xl p-4 flex items-center justify-between focus-within:border-[#937238] focus-within:bg-white transition shadow-2xs">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              className="font-mono font-black text-2xl text-[#2B2721] bg-transparent focus:outline-none w-full placeholder:text-[#D4CEBF]"
            />
            <span className="font-display font-black text-sm text-[#2B2721] uppercase shrink-0 pl-2">
              USD
            </span>
          </div>
        </div>

        {/* Direction Selector Grid */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => setDirection("TO_BANK")}
            className={`py-3.5 px-3 rounded-xl font-display font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition shadow-2xs ${
              direction === "TO_BANK"
                ? "bg-[#3D4A5C] text-white shadow-sm ring-2 ring-[#3D4A5C]/20"
                : "bg-[#FAF8F5] hover:bg-[#F4F1EA] text-[#665F55] border border-[#E4DFD3]"
            }`}
          >
            <ArrowDown className="w-4 h-4 stroke-[2.5]" />
            <span>TO BANK</span>
          </button>

          <button
            type="button"
            onClick={() => setDirection("TO_TRADING")}
            className={`py-3.5 px-3 rounded-xl font-display font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition shadow-2xs ${
              direction === "TO_TRADING"
                ? "bg-[#EAE5DC] text-[#2B2721] shadow-sm ring-2 ring-[#937238]/30 border border-[#DFD9CE]"
                : "bg-[#FAF8F5] hover:bg-[#F4F1EA] text-[#665F55] border border-[#E4DFD3]"
            }`}
          >
            <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            <span>TO TRADING</span>
          </button>
        </div>

        {/* Status Message */}
        {message && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-mono font-bold animate-fadeIn ${
              message.startsWith("✅")
                ? "bg-[#E3EFEA] text-[#1D7A58] border border-[#BDE0D1]"
                : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}
          >
            {message}
          </div>
        )}

        {/* Confirm Transfer Button */}
        <button
          type="button"
          onClick={handleConfirmTransfer}
          disabled={isProcessing}
          className="w-full py-4 rounded-2xl bg-[#937238] hover:bg-[#81632E] active:bg-[#705526] disabled:opacity-50 text-white font-display font-black text-sm uppercase tracking-widest shadow-md cursor-pointer transition flex items-center justify-center gap-2 pt-4"
        >
          {isProcessing ? "PROCESSING TRANSFER..." : "CONFIRM TRANSFER"}
        </button>
      </div>
    </div>
  );
}
