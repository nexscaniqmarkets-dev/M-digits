import React, { useState } from "react";
import { 
  Download, 
  Trash2, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  HelpCircle,
  Database,
  History,
  Activity,
  Layers
} from "lucide-react";
import { Trade } from "../types";

interface HistoryViewProps {
  trades: Trade[];
  balance: number;
  onResetTrades: () => void;
  onResetBalance?: () => void;
}

export default function HistoryView({
  trades,
  balance,
  onResetTrades,
  onResetBalance
}: HistoryViewProps) {
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showConfirmBalance, setShowConfirmBalance] = useState(false);

  // General metrics calculations
  const totalTrades = trades.length;
  const wins = trades.filter(t => t.result === "WIN");
  const winRate = totalTrades > 0 ? ((wins.length / totalTrades) * 100).toFixed(1) : "0.0";
  const netProfit = trades.reduce((acc, t) => acc + t.profit, 0);

  // Shorthand elegant symbol mapper matching professional financial dashboards
  const formatSymbolShorthand = (sym: string): string => {
    const mapping: Record<string, string> = {
      "1HZ100V": "V100(1s)",
      "1HZ10V": "V10(1s)",
      "1HZ25V": "V25(1s)",
      "1HZ50V": "V50(1s)",
      "1HZ75V": "V75(1s)",
      "R_10": "V10",
      "R_25": "V25",
      "R_50": "V50",
      "R_75": "V75",
      "R_100": "V100"
    };
    return mapping[sym] || sym;
  };

  // Export to CSV helper
  const exportToCSV = () => {
    if (trades.length === 0) return;
    
    const headers = ["Timestamp", "Symbol", "Prediction", "Trigger", "Exit Spot", "Stake", "P&L", "Result"];
    const rows = trades.map((t) => [
      new Date(t.timestamp).toLocaleTimeString(),
      formatSymbolShorthand(t.symbol),
      `≠${t.predictionDigit}`,
      t.triggerDigit,
      t.exitDigit !== undefined ? t.exitDigit : "",
      t.stake.toFixed(2),
      t.profit.toFixed(2),
      t.result
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `m_digits_ledger_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="history-view" className="space-y-4 max-w-4xl mx-auto px-1 sm:px-2 w-full max-w-full overflow-hidden">
      
      {/* 1. Slim System Summary Deck */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Demo Balance Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
          <span className="text-slate-400 text-[9px] font-black uppercase tracking-wider block mb-1">
            Demo Balance
          </span>
          <div className="flex items-center justify-between gap-1 mt-0.5">
            <span className="font-mono font-black text-slate-800 text-base sm:text-lg">
              ${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {onResetBalance && (
              <div className="shrink-0">
                {!showConfirmBalance ? (
                  <button
                    onClick={() => {
                      setShowConfirmBalance(true);
                      setShowConfirmReset(false);
                    }}
                    className="text-[9px] text-indigo-600 hover:text-indigo-700 font-extrabold tracking-wider uppercase bg-slate-50 hover:bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    Reset
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 text-[9px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 font-mono animate-in fade-in duration-150">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Reset?</span>
                    <button
                      onClick={() => {
                        onResetBalance();
                        setShowConfirmBalance(false);
                      }}
                      className="text-indigo-600 hover:text-indigo-800 font-black hover:underline cursor-pointer"
                    >
                      Yes
                    </button>
                    <span className="text-slate-300">/</span>
                    <button
                      onClick={() => setShowConfirmBalance(false)}
                      className="text-slate-500 hover:text-slate-700 font-semibold cursor-pointer"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Total Yield Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
          <span className="text-slate-400 text-[9px] font-black uppercase tracking-wider block mb-1">
            Total Yield (P&L)
          </span>
          <div className={`font-mono font-black text-base sm:text-lg mt-0.5 flex items-center gap-1 ${
            netProfit >= 0 ? "text-emerald-600" : "text-rose-600"
          }`}>
            {netProfit >= 0 ? "+" : ""}${netProfit.toFixed(2)}
          </div>
        </div>

        {/* Accuracy Index Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
          <span className="text-slate-400 text-[9px] font-black uppercase tracking-wider block mb-1">
            Accuracy Index
          </span>
          <div className="font-mono font-black text-slate-800 text-base sm:text-lg mt-0.5">
            {winRate}%
            <span className="text-[10px] text-slate-500 font-normal font-sans ml-1.5">
              ({wins.length}/{totalTrades})
            </span>
          </div>
        </div>

        {/* Total Audited Volume Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between col-span-2 lg:col-span-1">
          <span className="text-slate-400 text-[9px] font-black uppercase tracking-wider block mb-1">
            Total Audited
          </span>
          <div className="font-mono font-black text-slate-800 text-base sm:text-lg mt-0.5">
            {totalTrades}
            <span className="text-[10px] text-slate-500 font-normal font-sans ml-1.5 uppercase">
              Contracts
            </span>
          </div>
        </div>
      </section>

      {/* 2. Main Ledger & Logs Section */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col overflow-hidden">
        
        {/* Table Filter / Clear Toolbar */}
        <div className="bg-slate-50 border-b border-slate-200/60 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider font-mono">
              Live Audit Trails
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Export Utility */}
            {totalTrades > 0 && (
              <button
                onClick={exportToCSV}
                className="px-2.5 py-1 text-[10px] text-slate-600 hover:text-slate-950 hover:bg-slate-100 border border-slate-200 rounded font-bold transition-all cursor-pointer flex items-center gap-1 uppercase"
                title="Download CSV Ledger"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}

            {/* Quick Log Purge */}
            <div>
              {!showConfirmReset ? (
                <button
                  onClick={() => {
                    setShowConfirmReset(true);
                    setShowConfirmBalance(false);
                  }}
                  className="px-2.5 py-1 text-[10px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 rounded font-bold transition-all cursor-pointer flex items-center gap-1 uppercase"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 text-[9px] bg-rose-50 border border-rose-200 rounded px-2 py-1 font-mono animate-in fade-in duration-150">
                  <span className="text-rose-700 font-bold uppercase tracking-wider">Confirm Delete?</span>
                  <button
                    onClick={() => {
                      onResetTrades();
                      setShowConfirmReset(false);
                    }}
                    className="text-rose-600 hover:text-rose-800 font-black hover:underline cursor-pointer bg-white border border-rose-200 px-1 rounded"
                  >
                    Yes
                  </button>
                  <span className="text-slate-300">/</span>
                  <button
                    onClick={() => setShowConfirmReset(false)}
                    className="text-slate-500 hover:text-slate-700 font-semibold cursor-pointer"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Responsive, Scrollbar-Free Table */}
        <div className="w-full">
          {totalTrades === 0 ? (
            <div className="py-16 text-center flex flex-col items-center justify-center px-4">
              <Activity className="w-8 h-8 text-slate-300 mb-2.5 animate-pulse" />
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Audit Log Ready</p>
              <p className="text-[9px] text-slate-500 mt-1 max-w-xs uppercase tracking-wider font-mono">
                Initiate the trading bot to register microsecond trade executions.
              </p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto scrollbar-thin">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-400 text-[9px] font-black uppercase tracking-wider font-mono">
                    <th className="py-2.5 px-3 w-[22%] sm:w-[18%]">Time</th>
                    <th className="py-2.5 px-2 w-[20%] sm:w-[22%]">Symbol</th>
                    <th className="py-2.5 px-2 w-[28%] sm:w-[25%] text-center">Digits</th>
                    <th className="py-2.5 px-2 w-[15%] sm:w-[15%] text-right">Stake</th>
                    <th className="py-2.5 px-3 w-[15%] sm:w-[20%] text-right">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700 font-semibold">
                  {trades.map((trade) => {
                    const isWin = trade.result === "WIN";
                    const isPending = trade.result === "PENDING";
                    
                    const timeStr = new Date(trade.timestamp).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false
                    });

                    return (
                      <tr 
                        key={trade.id} 
                        className="hover:bg-slate-50 transition-colors text-slate-700"
                      >
                        {/* 1. Time Column */}
                        <td className="py-3 px-3 text-slate-400 truncate" title={timeStr}>
                          {timeStr}
                        </td>

                        {/* 2. Shorthand Symbol Column */}
                        <td className="py-3 px-2 truncate">
                          <span className="text-amber-700 font-black tracking-wide">
                            {formatSymbolShorthand(trade.symbol)}
                          </span>
                        </td>

                        {/* 3. Combined Digits Trace */}
                        <td className="py-3 px-2 text-center">
                          <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded text-[10px]">
                            <span className="text-slate-500 font-bold" title="Prediction: ≠">≠{trade.predictionDigit}</span>
                            <span className="text-slate-300 opacity-50">|</span>
                            {isPending ? (
                              <span className="text-slate-400 font-bold animate-pulse">..</span>
                            ) : (
                              <span className={isWin ? "text-emerald-600 font-black" : "text-rose-600 font-black"} title="Exit spot digit">
                                {trade.exitDigit}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 4. Stake Value */}
                        <td className="py-3 px-2 text-right text-slate-500">
                          ${trade.stake.toFixed(0)}
                        </td>

                        {/* 5. Color-coded Yield Column */}
                        <td className={`py-3 px-3 text-right font-black ${
                          isPending ? "text-slate-400" : isWin ? "text-emerald-600" : "text-rose-600"
                        }`}>
                          {isPending ? (
                            "—"
                          ) : (
                            <span>
                              {isWin ? "+" : "-"}${Math.abs(trade.profit).toFixed(2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 3. Synchronized Live Database Info Footer */}
      <div className="flex items-start gap-1.5 px-2 text-[9px] text-slate-400 uppercase tracking-wider font-mono justify-between">
        <div className="flex items-center gap-1">
          <Database className="w-3 h-3 text-indigo-600/70 shrink-0" />
          <span>Deriv System Database Connected</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <HelpCircle className="w-3 h-3 shrink-0" />
          <span>Client Autonomic Sync</span>
        </div>
      </div>

    </div>
  );
}
