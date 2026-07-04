import React, { useState, useEffect, useRef, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import TelegramHeader from "./components/TelegramHeader";
import DigitUnderTopNav from "./components/DigitUnderTopNav";
import SettingsView from "./components/SettingsView";
import TelegramProfileModal from "./components/TelegramProfileModal";
import DashboardView from "./components/DashboardView";
import StrategyView from "./components/StrategyView";
import AutoTradeView from "./components/AutoTradeView";
import HistoryView from "./components/HistoryView";
import BottomNavBar from "./components/BottomNavBar";

import { 
  Tick, 
  Trade, 
  LogEntry, 
  SystemStatus, 
  StrategyConfig, 
  FrequencyInfo, 
  AnalysisSummary,
  SmartAnalysisResult,
  UserAccountProfile
} from "./types";
import { initTelegramWebApp, switchActiveProfile, getTelegramInitData, authHeaders } from "./lib/telegram";

export default function App() {
  const [activeProfile, setActiveProfile] = useState<UserAccountProfile>(() => initTelegramWebApp());
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const userIdRef = useRef<string>(activeProfile.id);
  const usernameRef = useRef<string>(activeProfile.name);

  useEffect(() => {
    userIdRef.current = activeProfile.id;
    usernameRef.current = activeProfile.name;
  }, [activeProfile]);

  const [activeTab, setActiveTab] = useState<string>("strategy");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // State elements matching full AnalysisSummary
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [frequencies, setFrequencies] = useState<FrequencyInfo[]>([]);
  const [predictionDigit, setPredictionDigit] = useState<number | null>(null);
  const [triggerDigit, setTriggerDigit] = useState<number | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [smartAnalysis, setSmartAnalysis] = useState<SmartAnalysisResult | null>(null);
  
  // Real-time 15-tick engines states
  const [analysis15, setAnalysis15] = useState<any>(null);
  const [signal15, setSignal15] = useState<any>(null);
  
  const [status, setStatus] = useState<SystemStatus>({
    connectionStatus: "CONNECTING",
    streamStatus: "IDLE",
    engineStatus: "RUNNING",
    autoTrading: false,
    derivMode: "SIMULATED",
    balance: 10000.00,
    reservedBalance: 0.00,
    symbol: "R_100"
  });

  const [config, setConfig] = useState<StrategyConfig>({
    windowSize: 120,
    stake: 10.0,
    symbol: "R_100",
    derivToken: "",
    derivAppId: "1089",
    martingaleEnabled: false,
    martingaleMultiplier: 1.5,
    martingaleMaxSteps: 5,
    analysisMode: "CLASSIC",
    cooldownAfterTieEnabled: true,
    takeProfitEnabled: false,
    takeProfitAmount: 100.0,
    stopLossEnabled: false,
    stopLossAmount: 50.0,
    maxStakeEnabled: false,
    maxStakeAmount: 500.0,
    martingaleActionOnMax: "RESET",
    consecutiveLossLimitEnabled: true,
    consecutiveLossLimitAmount: 10
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSummaryREST = useCallback(async () => {
    try {
      const uId = userIdRef.current;
      const res = await fetch(`/api/summary?userId=${encodeURIComponent(uId)}`, {
        headers: authHeaders()
      });
      if (res.ok) {
        const data: AnalysisSummary = await res.json();
        updateLocalState(data, uId);
      }
    } catch (err) {
      console.warn("REST summary poll failed, waiting for WebSocket:", err);
    }
  }, []);

  const syncStateWithBackend = useCallback(async (uId: string) => {
    try {
      const savedBalance = localStorage.getItem(`sandbox_balance_${uId}`);
      const savedReserved = localStorage.getItem(`sandbox_reserved_balance_${uId}`);
      const savedTrades = localStorage.getItem(`sandbox_trades_${uId}`);
      const savedLogs = localStorage.getItem(`sandbox_logs_${uId}`);
      const savedConfig = localStorage.getItem(`sandbox_config_${uId}`);

      if (savedBalance || savedReserved || savedTrades || savedLogs || savedConfig) {
        await fetch(`/api/sync-state?userId=${encodeURIComponent(uId)}`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            userId: uId,
            balance: savedBalance ? parseFloat(savedBalance) : null,
            reservedBalance: savedReserved ? parseFloat(savedReserved) : null,
            trades: savedTrades ? JSON.parse(savedTrades) : null,
            logs: savedLogs ? JSON.parse(savedLogs) : null,
            config: savedConfig ? JSON.parse(savedConfig) : null
          })
        });
      }
    } catch (err) {
      console.warn("Client state synchronization note:", err);
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const uId = userIdRef.current;
    const uName = usernameRef.current;
    const initData = getTelegramInitData();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?userId=${encodeURIComponent(uId)}&username=${encodeURIComponent(uName)}${initData ? `&initData=${encodeURIComponent(initData)}` : ""}`;
    
    console.log("Connecting browser to internal websocket server:", wsUrl);
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Internal WebSocket linked successfully for user:", uId);
        setStatus(prev => ({ ...prev, connectionStatus: "CONNECTED" }));
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "SUMMARY_UPDATE" && payload.data) {
            updateLocalState(payload.data, uId);
          }
        } catch (err) {
          console.warn("Error parsing WS summary package:", err);
        }
      };

      ws.onclose = () => {
        console.warn("Internal WebSocket severed. Reconnecting in 3.5s...");
        setStatus(prev => ({ ...prev, connectionStatus: "DISCONNECTED" }));
        
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3500);
      };

      ws.onerror = (err) => {
        console.warn("Internal WS Connection Note:", err);
        ws.close();
      };

    } catch (e) {
      console.warn("WebSocket construction note:", e);
    }
  }, []);

  // Initialize connection whenever active profile changes
  useEffect(() => {
    const initProfileSession = async () => {
      const uId = activeProfile.id;
      await syncStateWithBackend(uId);
      await fetchSummaryREST();
      connectWebSocket();
    };

    initProfileSession();

    const pollingInterval = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        fetchSummaryREST();
      }
    }, 3000);

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      clearInterval(pollingInterval);
    };
  }, [activeProfile.id, syncStateWithBackend, fetchSummaryREST, connectWebSocket]);

  const handleSelectProfile = (newProfile: UserAccountProfile) => {
    switchActiveProfile(newProfile);
    setActiveProfile(newProfile);
  };

  const updateLocalState = (data: any, uId: string) => {
    if (data.ticks) setTicks(data.ticks);
    if (data.frequencies) setFrequencies(data.frequencies);
    if (data.predictionDigit !== undefined) setPredictionDigit(data.predictionDigit);
    if (data.triggerDigit !== undefined) setTriggerDigit(data.triggerDigit);
    if (data.trades) setTrades(data.trades);
    if (data.logs) setLogs(data.logs);
    if (data.status) setStatus(data.status);
    if (data.config) setConfig(data.config);
    if (data.smartAnalysis) setSmartAnalysis(data.smartAnalysis);
    if (data.analysis15) setAnalysis15(data.analysis15);
    if (data.signal15) setSignal15(data.signal15);

    if (data.status) {
      if (data.status.derivMode === "SIMULATED" && typeof data.status.balance === "number") {
        localStorage.setItem(`sandbox_balance_${uId}`, data.status.balance.toString());
      }
      if (typeof data.status.reservedBalance === "number") {
        localStorage.setItem(`sandbox_reserved_balance_${uId}`, data.status.reservedBalance.toString());
      }
    }
    if (data.trades) {
      localStorage.setItem(`sandbox_trades_${uId}`, JSON.stringify(data.trades));
    }
    if (data.logs) {
      localStorage.setItem(`sandbox_logs_${uId}`, JSON.stringify(data.logs));
    }
    if (data.config) {
      localStorage.setItem(`sandbox_config_${uId}`, JSON.stringify(data.config));
    }
  };

  // REST mutations
  const handleToggleAutoTrade = async (explicitValue?: boolean) => {
    const wantToTurnOn = explicitValue !== undefined ? explicitValue : !status.autoTrading;
    if (wantToTurnOn && (status.balance <= 0 || status.balance < config.stake)) {
      alert(`⚠️ Insufficient balance ($${status.balance.toFixed(2)}) to start automated trading with required stake ($${config.stake.toFixed(2)}).`);
      return;
    }
    try {
      const uId = userIdRef.current;
      const res = await fetch(`/api/action?userId=${encodeURIComponent(uId)}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ 
          userId: uId,
          action: "TOGGLE_AUTO_TRADE",
          ...(explicitValue !== undefined ? { value: explicitValue } : {})
        })
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(prev => ({ ...prev, autoTrading: data.autoTrading }));
      } else if (data && data.message) {
        alert(data.message);
      }
    } catch (err) {
      console.error("Failed to toggle auto trade:", err);
    }
  };

  const handleToggleEngine = async () => {
    try {
      const uId = userIdRef.current;
      const res = await fetch(`/api/action?userId=${encodeURIComponent(uId)}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ userId: uId, action: "TOGGLE_ENGINE" })
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(prev => ({ ...prev, engineStatus: data.engineStatus }));
      }
    } catch (err) {
      console.error("Failed to toggle analysis engine:", err);
    }
  };

  const handleResetTrades = async () => {
    try {
      const uId = userIdRef.current;
      const res = await fetch(`/api/action?userId=${encodeURIComponent(uId)}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ userId: uId, action: "RESET_TRADES" })
      });
      if (res.ok) {
        fetchSummaryREST();
      }
    } catch (err) {
      console.error("Failed to reset trades:", err);
    }
  };

  const handleResetBalance = async () => {
    try {
      const uId = userIdRef.current;
      const res = await fetch(`/api/action?userId=${encodeURIComponent(uId)}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ userId: uId, action: "RESET_BALANCE" })
      });
      if (res.ok) {
        fetchSummaryREST();
      }
    } catch (err) {
      console.error("Failed to reset balance:", err);
    }
  };

  const handleVaultAction = async (subAction: 'DEPOSIT' | 'WITHDRAW' | 'WITHDRAW_ALL' | 'SET_ACTIVE_LEAVE', amount?: number) => {
    try {
      const uId = userIdRef.current;
      const res = await fetch(`/api/action?userId=${encodeURIComponent(uId)}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ userId: uId, action: "MANAGE_VAULT", subAction, amount })
      });
      if (res.ok) {
        fetchSummaryREST();
      }
    } catch (err) {
      console.error("Failed to manage vault:", err);
    }
  };

  const handleEmergencyStop = async () => {
    try {
      const uId = userIdRef.current;
      const res = await fetch(`/api/action?userId=${encodeURIComponent(uId)}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ userId: uId, action: "EMERGENCY_STOP" })
      });
      if (res.ok) {
        setStatus(prev => ({ ...prev, autoTrading: false }));
        fetchSummaryREST();
      }
    } catch (err) {
      console.error("Emergency stop failed:", err);
    }
  };

  const handleUpdateConfig = async (newConfig: Partial<StrategyConfig> & { derivMode?: 'SIMULATED' | 'LIVE' }) => {
    try {
      const uId = userIdRef.current;
      const res = await fetch(`/api/config?userId=${encodeURIComponent(uId)}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ userId: uId, ...newConfig })
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setStatus(data.status);
        fetchSummaryREST();
      }
    } catch (err) {
      console.error("Failed to update system config:", err);
    }
  };

  return (
    <div id="full-app-root" className="min-h-screen bg-[#f8fafc] text-slate-800 flex font-sans w-full max-w-full overflow-x-hidden">
      {/* Left Navigation Sidebar / Drawer */}
      <Sidebar 
        status={status}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onEmergencyStop={handleEmergencyStop}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Telegram Mini App Profile Modal */}
      <TelegramProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        activeProfile={activeProfile}
        onSelectProfile={handleSelectProfile}
        config={config}
        onUpdateConfig={handleUpdateConfig}
        derivMode={status.derivMode}
        onSwitchMode={(mode) => handleUpdateConfig({ derivMode: mode })}
      />

      {/* Main Content Pane */}
      <div id="main-content-pane" className="flex-1 min-w-0 w-full max-w-full flex flex-col overflow-x-hidden">
        {/* Unified Warm Ivory & Bronze Header */}
        <DigitUnderTopNav
          status={status}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeProfile={activeProfile}
          onOpenProfile={() => setProfileModalOpen(true)}
          onResetBalance={handleResetBalance}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Content canvas padding to prevent header overlap and bottom bar overlap */}
        <main className="p-3 sm:p-6 pt-4 sm:pt-6 pb-28 max-w-7xl mx-auto w-full flex-1 overflow-x-hidden">
          {activeTab === "dashboard" && (
            <DashboardView 
              userId={activeProfile.id}
              ticks={ticks}
              frequencies={frequencies}
              predictionDigit={predictionDigit}
              triggerDigit={triggerDigit}
              status={status}
              logs={logs}
              config={config}
              smartAnalysis={smartAnalysis}
              analysis15={analysis15}
              signal15={signal15}
              onUpdateConfig={handleUpdateConfig}
              onEmergencyStop={handleEmergencyStop}
              onToggleAutoTrade={handleToggleAutoTrade}
            />
          )}

          {activeTab === "strategy" && (
            <StrategyView 
              config={config}
              status={status}
              onUpdateConfig={handleUpdateConfig}
              onResetTrades={handleResetTrades}
              onResetBalance={handleResetBalance}
              onVaultAction={handleVaultAction}
            />
          )}

          {activeTab === "autotrade" && (
            <AutoTradeView 
              userId={activeProfile.id}
              status={status}
              config={config}
              logs={logs}
              smartAnalysis={smartAnalysis}
              analysis15={analysis15}
              signal15={signal15}
              onToggleAutoTrade={handleToggleAutoTrade}
              onUpdateConfig={handleUpdateConfig}
            />
          )}

          {activeTab === "history" && (
            <HistoryView 
              trades={trades}
              balance={status.balance}
              onResetTrades={handleResetTrades}
              onResetBalance={handleResetBalance}
            />
          )}

          {activeTab === "settings" && (
            <SettingsView
              config={config}
              status={status}
              onUpdateConfig={handleUpdateConfig}
            />
          )}
        </main>

        {/* Bottom Navigation Bar with Professional Icons */}
        <BottomNavBar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
        />
      </div>
    </div>
  );
}
