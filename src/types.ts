export interface Tick {
  id: string;
  epoch: number;
  price: number;
  digit: number;
  symbol: string;
}

export interface Trade {
  id: string;
  timestamp: string;
  symbol: string;
  predictionDigit: number;
  triggerDigit: number;
  stake: number;
  payout: number;
  profit: number;
  result: 'WIN' | 'LOSS' | 'PENDING';
  entryPrice?: number;
  exitPrice?: number;
  entryEpoch?: number;
  exitEpoch?: number;
  entryDigit?: number;
  exitDigit?: number;
  balanceAfter?: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'trigger' | 'trade' | 'error' | 'success';
  message: string;
}

export interface SystemStatus {
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';
  streamStatus: 'LIVE' | 'IDLE' | 'ERROR';
  engineStatus: 'RUNNING' | 'PAUSED';
  autoTrading: boolean;
  derivMode: 'SIMULATED' | 'LIVE';
  balance: number;
  reservedBalance?: number;
  symbol: string;
  tieStatus?: 'NONE' | 'TIE_PAUSED' | 'COOLDOWN';
  cooldownSecondsLeft?: number;
  sessionStartBalance?: number;
}

export interface StrategyConfig {
  windowSize: number; // Fixed at 120
  stake: number;
  symbol: string;
  derivToken: string;
  derivAppId: string;
  derivAccountType: 'demo' | 'real';
  martingaleEnabled: boolean;
  martingaleMultiplier: number;
  martingaleMaxSteps: number;
  analysisMode: 'CLASSIC' | 'SMART' | 'HFT_15';
  lockedPredictionDigit?: number | null;
  lockedTriggerDigit?: number | null;
  useLockedPair?: boolean;
  cooldownAfterTieEnabled: boolean;
  takeProfitEnabled: boolean;
  takeProfitAmount: number;
  stopLossEnabled: boolean;
  stopLossAmount: number;
  maxStakeEnabled: boolean;
  maxStakeAmount: number;
  martingaleActionOnMax: 'RESET' | 'HALT';
  consecutiveLossLimitEnabled: boolean;
  consecutiveLossLimitAmount: number;
}

export interface SmartPairCombination {
  prediction: number;
  trigger: number;
  score: number;
  confidence: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface SmartAnalysisResult {
  predictionDigit: number | null;
  triggerDigit: number | null;
  confidenceScore: number;
  reason: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  stabilityIndex: number;
  tradeQualityScore: number;
  marketStability: 'STABLE' | 'VOLATILE' | 'TRENDING';
  combinations: SmartPairCombination[];
}

export interface DigitStat {
  wins: number;
  total: number;
  rate: number;
}

export interface PerformanceStats {
  winRateByPrediction: Record<number, DigitStat>;
  winRateByTrigger: Record<number, DigitStat>;
  winRateByPair: Record<string, DigitStat>;
  totalProfit: number;
  totalLoss: number;
  avgProfitLoss: number;
  bestPairs: Array<{ pair: string; rate: number; total: number }>;
  worstPairs: Array<{ pair: string; rate: number; total: number }>;
}

export interface FrequencyInfo {
  digit: number;
  count: number;
  percentage: number;
}

export interface AnalysisSummary {
  userId?: string;
  username?: string;
  ticks: Tick[];
  frequencies: FrequencyInfo[];
  predictionDigit: number | null;
  triggerDigit: number | null;
  status: SystemStatus;
  config: StrategyConfig;
  trades: Trade[];
  logs: LogEntry[];
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
}

export interface TelegramUser {
  id: number | string;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  is_premium?: boolean;
}

export interface UserAccountProfile {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  isTelegram: boolean;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            photo_url?: string;
            is_premium?: boolean;
          };
        };
        colorScheme?: 'light' | 'dark';
        themeParams?: Record<string, string>;
        isExpanded?: boolean;
        viewportHeight?: number;
        viewportStableHeight?: number;
        ready: () => void;
        expand: () => void;
        close: () => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}

