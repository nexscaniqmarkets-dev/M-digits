import express from "express";
import path from "path";
import http from "http";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { URL } from "url";

dotenv.config();

let __filename = "";
let __dirname = "";
try {
  __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
} catch (e) {
  __dirname = process.cwd();
}

import {
  Tick,
  Trade,
  LogEntry,
  SystemStatus,
  StrategyConfig,
  FrequencyInfo,
  AnalysisSummary,
  SmartAnalysisResult
} from "./src/types.js";
import { verifyTelegramInitData, VerifiedTelegramUser } from "./src/telegramAuth.js";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// ---------------------------------------------------------------------------
// AUTH: resolve a verified, per-user session id from the request.
//
// If TELEGRAM_BOT_TOKEN is configured, we ONLY trust a signed `initData`
// string (sent via 'x-telegram-init-data' header on REST calls, or an
// 'initData' query param on the WebSocket URL — browsers can't set custom
// headers on native WebSocket connections). A raw client-supplied `userId`
// is NEVER trusted for identity once a bot token is present.
//
// If no bot token is configured (local dev), we fall back to trusting the
// client-supplied `userId` so the app keeps working outside Telegram.
// ---------------------------------------------------------------------------
function resolveSessionId(initData: string | undefined, fallbackUserId: string | undefined): string | null {
  if (BOT_TOKEN) {
    if (!initData) return null;
    const verified = verifyTelegramInitData(initData, BOT_TOKEN);
    if (!verified) return null;
    return `tg_${verified.id}`;
  }
  return fallbackUserId || "anonymous";
}

function requireSession(req: express.Request, res: express.Response): TradingSession | null {
  const headerInitData = req.header("x-telegram-init-data") || undefined;
  const queryUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const bodyUserId = typeof req.body?.userId === "string" ? req.body.userId : undefined;
  const sessionId = resolveSessionId(headerInitData, queryUserId || bodyUserId);
  if (!sessionId) {
    res.status(401).json({ error: "Missing or invalid Telegram authentication." });
    return null;
  }
  const session = getOrCreateSession(sessionId);
  session.touch();
  return session;
}

// ---------------------------------------------------------------------------
// Simulated base prices & per-symbol statistical profiles (shared read-only
// config, not per-user state — safe to keep at module scope)
// ---------------------------------------------------------------------------
const DEFAULT_SYMBOL_PRICES: Record<string, number> = {
  "R_10": 125.40,
  "R_25": 280.15,
  "R_50": 3450.80,
  "R_75": 8720.30,
  "R_100": 14230.50,
  "1HZ10V": 98.42,
  "1HZ25V": 285.50,
  "1HZ50V": 3465.20,
  "1HZ75V": 8745.10,
  "1HZ100V": 1243.67
};

const SYMBOL_PROFILES: Record<string, { dominant: number[]; biasFactor: number; transition?: { from: number; to: number; prob: number } }> = {
  "1HZ100V": { dominant: [5, 6], biasFactor: 0.35, transition: { from: 5, to: 6, prob: 0.40 } },
  "1HZ10V":  { dominant: [2, 3], biasFactor: 0.20, transition: { from: 2, to: 3, prob: 0.25 } },
  "1HZ25V":  { dominant: [0, 4], biasFactor: 0.05 },
  "1HZ50V":  { dominant: [8, 9], biasFactor: 0.30, transition: { from: 8, to: 9, prob: 0.35 } },
  "1HZ75V":  { dominant: [1, 2], biasFactor: 0.15, transition: { from: 1, to: 2, prob: 0.22 } },
  "R_10":    { dominant: [0, 1], biasFactor: 0.25, transition: { from: 0, to: 1, prob: 0.30 } },
  "R_100":   { dominant: [7, 8], biasFactor: 0.08 },
  "R_25":    { dominant: [4, 7], biasFactor: 0.22, transition: { from: 4, to: 7, prob: 0.28 } },
  "R_50":    { dominant: [3, 4], biasFactor: 0.18, transition: { from: 3, to: 4, prob: 0.24 } },
  "R_75":    { dominant: [9, 2], biasFactor: 0.06 }
};

function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return function () {
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function generateDigitsForSymbol(symbol: string, count: number, seed?: string): number[] {
  const profile = SYMBOL_PROFILES[symbol] || { dominant: [4, 9], biasFactor: 0.15 };
  const digits: number[] = [];
  const rng = seed ? seededRandom(seed) : Math.random;

  let prevDigit = Math.floor(rng() * 10);
  digits.push(prevDigit);

  for (let i = 1; i < count; i++) {
    let nextDigit = Math.floor(rng() * 10);
    if (profile.transition && prevDigit === profile.transition.from) {
      if (rng() < profile.transition.prob) nextDigit = profile.transition.to;
    } else {
      if (rng() < profile.biasFactor) {
        const randIndex = Math.floor(rng() * profile.dominant.length);
        nextDigit = profile.dominant[randIndex];
      }
    }
    digits.push(nextDigit);
    prevDigit = nextDigit;
  }
  return digits;
}

// Gemini client is stateless — safe to share across sessions
let aiClient: any = null;
function getAI() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not defined in Secrets.");
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } }
    });
  }
  return aiClient;
}

const SESSIONS_DIR = path.join(process.cwd(), "sessions_data");
function ensureSessionsDir() {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  } catch (e) {
    console.error("Failed to create sessions_data directory:", e);
  }
}
function safeSessionFileName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_\-]/g, "_") + ".json";
}

// ---------------------------------------------------------------------------
// TradingSession: everything that used to be a module-level global is now an
// instance field here. One instance per authenticated user.
// ---------------------------------------------------------------------------
class TradingSession {
  id: string;
  ticks: Tick[] = [];
  trades: Trade[] = [];
  logs: LogEntry[] = [];
  balance = 10000.00;
  reservedBalance = 0.00;
  sessionStartBalance = 10000.00;

  config: StrategyConfig = {
    windowSize: 120,
    stake: 10.0,
    symbol: "R_100",
    derivToken: "",
    derivAppId: "1089",
    derivAccountType: "demo",
    martingaleEnabled: false,
    martingaleMultiplier: 1.5,
    martingaleMaxSteps: 5,
    analysisMode: "CLASSIC",
    lockedPredictionDigit: null,
    lockedTriggerDigit: null,
    useLockedPair: false,
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
  };

  currentMartingaleStep = 0;
  consecutiveLosses = 0;
  dominantDigitHistory: (number | null)[] = [];

  currentAnalysis = {
    window: 15,
    digits: [] as number[],
    frequencies: {} as Record<number, number>,
    dominant_digit: 0,
    trigger_digit: 0,
    confidence: 0
  };

  currentStrategyResult = {
    signal: false,
    contract_type: "DIGITMATCH" as const,
    target_digit: 0,
    trigger_digit: 0,
    confidence: 0,
    reason: "No data"
  };

  tieDetected = false;
  tieBrokenTime: number | null = null;

  status: SystemStatus = {
    connectionStatus: "CONNECTED",
    streamStatus: "LIVE",
    engineStatus: "RUNNING",
    autoTrading: false,
    derivMode: "SIMULATED",
    balance: 10000.00,
    reservedBalance: 0.00,
    symbol: "R_100",
    tieStatus: "NONE",
    cooldownSecondsLeft: 0
  };

  pendingTrade: Trade | null = null;
  simulatedInterval: NodeJS.Timeout | null = null;
  derivWs: WebSocket | null = null;
  derivPingInterval: NodeJS.Timeout | null = null;
  symbolPrices: Record<string, number> = { ...DEFAULT_SYMBOL_PRICES };
  derivAccountCurrency: string = "USD";

  wsClients: Set<WebSocket> = new Set();
  lastActivity = Date.now();

  constructor(id: string) {
    this.id = id;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  // --- Persistence -----------------------------------------------------
  saveState() {
    try {
      ensureSessionsDir();
      const data = {
        balance: this.balance,
        reservedBalance: this.reservedBalance,
        trades: this.trades,
        logs: this.logs,
        config: this.config,
        currentMartingaleStep: this.currentMartingaleStep,
        sessionStartBalance: this.sessionStartBalance
      };
      fs.writeFileSync(path.join(SESSIONS_DIR, safeSessionFileName(this.id)), JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      console.error(`[${this.id}] Failed to save session state:`, err);
    }
  }

  loadState() {
    try {
      ensureSessionsDir();
      const filePath = path.join(SESSIONS_DIR, safeSessionFileName(this.id));
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf8");
        const data = JSON.parse(raw);
        if (typeof data.balance === "number") {
          this.balance = data.balance;
          this.status.balance = this.balance;
        }
        if (typeof data.reservedBalance === "number") {
          this.reservedBalance = data.reservedBalance;
          this.status.reservedBalance = this.reservedBalance;
        }
        if (Array.isArray(data.trades)) this.trades = data.trades;
        if (Array.isArray(data.logs)) this.logs = data.logs;
        if (data.config && typeof data.config === "object") {
          this.config = { ...this.config, ...data.config };
          this.status.symbol = this.config.symbol;
        }
        if (typeof data.currentMartingaleStep === "number") this.currentMartingaleStep = data.currentMartingaleStep;
        this.sessionStartBalance = typeof data.sessionStartBalance === "number" ? data.sessionStartBalance : this.balance;
      }
    } catch (err) {
      console.error(`[${this.id}] Failed to load session state:`, err);
    }
  }

  addLog(type: LogEntry["type"], message: string) {
    const log: LogEntry = {
      id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      type,
      message
    };
    this.logs.unshift(log);
    if (this.logs.length > 200) this.logs.pop();
    this.saveState();
  }

  bootstrapHistoricalTicks() {
    this.ticks = [];
    let basePrice = this.symbolPrices[this.config.symbol] || 1000.0;
    const now = Math.floor(Date.now() / 1000);
    const digits = generateDigitsForSymbol(this.config.symbol, 120);

    for (let i = 120; i > 0; i--) {
      const change = (Math.random() - 0.5) * 4.0;
      basePrice = parseFloat((basePrice + change).toFixed(2));
      const digit = digits[120 - i];
      this.ticks.push({
        id: `hist_${now - i}_${Math.floor(Math.random() * 1000)}`,
        epoch: now - i,
        price: basePrice,
        digit,
        symbol: this.config.symbol
      });
    }
    this.addLog("info", `Engine initialized with ${this.ticks.length} bootstrapped ticks.`);
  }

  calculateDigits() {
    const activeTicks = this.ticks.filter(t => t.symbol === this.config.symbol);
    const counts = Array(10).fill(0);
    activeTicks.forEach(t => { if (t.digit >= 0 && t.digit <= 9) counts[t.digit]++; });

    const freqs: FrequencyInfo[] = counts.map((count, digit) => ({
      digit,
      count,
      percentage: parseFloat(((count / Math.max(1, activeTicks.length)) * 100).toFixed(2))
    }));

    const sorted = [...freqs].sort((a, b) => (b.count !== a.count ? b.count - a.count : a.digit - b.digit));
    const predictionDigit = sorted[0]?.digit !== undefined ? sorted[0].digit : null;
    const triggerDigit = sorted[1]?.digit !== undefined ? sorted[1].digit : null;

    return { freqs, predictionDigit, triggerDigit };
  }

  calculateAnalysisEngine(windowSize = 15) {
    const symbolTicks = this.ticks.filter(t => t.symbol === this.config.symbol);
    const activeTicks = symbolTicks.slice(-windowSize);
    const lastDigits = activeTicks.map(t => t.digit);

    const counts: Record<number, number> = {};
    for (let d = 0; d <= 9; d++) counts[d] = 0;
    activeTicks.forEach(t => { if (t.digit >= 0 && t.digit <= 9) counts[t.digit]++; });

    let dominant_digit = 0;
    let maxCount = -1;
    for (let d = 0; d <= 9; d++) {
      if (counts[d] > maxCount) { maxCount = counts[d]; dominant_digit = d; }
    }

    let trigger_digit = (dominant_digit + 1) % 10;
    let secondMaxCount = -1;
    for (let d = 0; d <= 9; d++) {
      if (d !== dominant_digit && counts[d] > secondMaxCount) { secondMaxCount = counts[d]; trigger_digit = d; }
    }

    const actualWindowSize = activeTicks.length || 1;
    const confidence = parseFloat(((maxCount / actualWindowSize) * 100).toFixed(2));

    return { window: windowSize, digits: lastDigits, frequencies: counts, dominant_digit, trigger_digit, confidence };
  }

  evaluateStrategy(analysis: { window: number; digits: number[]; frequencies: Record<number, number>; dominant_digit: number; trigger_digit: number; confidence: number }) {
    const { dominant_digit, trigger_digit, confidence, frequencies } = analysis;

    const ruleConfidence = confidence >= 22.0;
    const last3 = this.dominantDigitHistory.slice(-3);
    const ruleStable3 = last3.length >= 3 && last3.every(d => d === dominant_digit);
    const uniqueCounts = new Set(Object.values(frequencies));
    const ruleNotUniform = uniqueCounts.size > 1;
    const last5 = this.dominantDigitHistory.slice(-5);
    const ruleNoConflict5 = last5.every(d => d === dominant_digit || d === null);

    const signal = ruleConfidence && ruleStable3 && ruleNotUniform && ruleNoConflict5;

    let reason = "";
    if (signal) {
      reason = `Dominant digit [${dominant_digit}] is highly stable with ${confidence.toFixed(1)}% confidence (>= 22%). Trigger digit set to [${trigger_digit}]. No conflicting dominant digit in last 5 ticks.`;
    } else {
      const reasons: string[] = [];
      if (!ruleConfidence) reasons.push(`confidence too low (${confidence.toFixed(1)}% < 22%)`);
      if (!ruleStable3) reasons.push("dominant digit unstable across last 3 cycles");
      if (!ruleNotUniform) reasons.push("market distribution is uniform");
      if (!ruleNoConflict5) reasons.push("conflicting dominant digit detected in last 5 ticks");
      reason = `Signal not generated: ${reasons.join(", ")}.`;
    }

    return { signal, contract_type: "DIGITMATCH" as const, target_digit: dominant_digit, trigger_digit, confidence, reason };
  }

  checkDigitTie(): boolean {
    const activeTicks = this.ticks.filter(t => t.symbol === this.config.symbol);
    if (activeTicks.length === 0) return false;
    const counts = Array(10).fill(0);
    activeTicks.forEach(t => { if (t.digit >= 0 && t.digit <= 9) counts[t.digit]++; });
    const sortedCounts = [...counts].sort((a, b) => b - a);
    const highestCount = sortedCounts[0] || 0;
    const secondHighestCount = sortedCounts[1] || 0;
    if (highestCount === 0) return false;
    return highestCount === secondHighestCount;
  }

  updateTieState() {
    const isCurrentlyTie = this.checkDigitTie();

    if (isCurrentlyTie) {
      if (!this.tieDetected) {
        this.tieDetected = true;
        this.tieBrokenTime = null;
        this.status.tieStatus = "TIE_PAUSED";
        this.addLog("error", `⚠️ TIE DETECTED: Multiple digits have tied for highest or second-highest frequency. Trading paused until the tie is broken.`);
      } else {
        this.status.tieStatus = "TIE_PAUSED";
      }
    } else {
      if (this.tieDetected) {
        this.tieDetected = false;
        if (this.config.cooldownAfterTieEnabled) {
          this.tieBrokenTime = Date.now();
          this.status.tieStatus = "COOLDOWN";
          this.addLog("trigger", `🔄 TIE BROKEN: Digit tie has broken! Entering mandatory 30-second stabilization cooldown before trading can resume.`);
        } else {
          this.tieBrokenTime = null;
          this.status.tieStatus = "NONE";
          this.status.cooldownSecondsLeft = 0;
          this.addLog("success", `✅ TIE BROKEN: Digit tie has broken! Cooldown bypassed. Bot is ready to trade.`);
        }
      } else if (this.tieBrokenTime !== null) {
        if (!this.config.cooldownAfterTieEnabled) {
          this.tieBrokenTime = null;
          this.status.tieStatus = "NONE";
          this.status.cooldownSecondsLeft = 0;
          this.addLog("success", `✅ COOLDOWN DEACTIVATED: Cooldown bypassed. Bot is ready to trade.`);
        } else {
          const elapsed = Date.now() - this.tieBrokenTime;
          const left = 30 - Math.floor(elapsed / 1000);
          if (left <= 0) {
            this.tieBrokenTime = null;
            this.status.tieStatus = "NONE";
            this.status.cooldownSecondsLeft = 0;
            this.addLog("success", `✅ COOLDOWN OVER: 30-second post-tie stabilization finished. Bot is ready to trade.`);
          } else {
            this.status.tieStatus = "COOLDOWN";
            this.status.cooldownSecondsLeft = left;
          }
        }
      } else {
        this.status.tieStatus = "NONE";
        this.status.cooldownSecondsLeft = 0;
      }
    }
  }

  calculateSmartAnalysis(customTicks?: Tick[]): SmartAnalysisResult {
    const sourceTicks = customTicks || this.ticks.filter(t => t.symbol === this.config.symbol);
    const rollingTicks = sourceTicks.slice(-120);

    const counts = Array(10).fill(0);
    rollingTicks.forEach(t => { if (t.digit >= 0 && t.digit <= 9) counts[t.digit]++; });

    const freqs = counts.map((count, digit) => ({
      digit, count, percentage: parseFloat(((count / Math.max(1, rollingTicks.length)) * 100).toFixed(2))
    }));

    const chunks: Array<number[]> = [[], [], [], []];
    const chunkSize = 30;
    for (let i = 0; i < rollingTicks.length; i++) {
      const chunkIdx = Math.floor(i / chunkSize);
      if (chunkIdx < 4) chunks[chunkIdx].push(rollingTicks[i].digit);
    }

    const chunkCounts = Array(10).fill(0).map(() => Array(4).fill(0));
    chunks.forEach((chunk, chunkIdx) => {
      chunk.forEach(digit => { if (digit >= 0 && digit <= 9) chunkCounts[digit][chunkIdx]++; });
    });

    const stabilities = Array(10).fill(0);
    for (let d = 0; d < 10; d++) {
      const countsList = chunkCounts[d];
      const avg = countsList.reduce((a, b) => a + b, 0) / 4;
      const variance = countsList.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / 4;
      const stdDev = Math.sqrt(variance);
      stabilities[d] = Math.max(0, Math.min(100, Math.round(100 - (stdDev / Math.max(1, avg)) * 40)));
    }

    const recent20 = rollingTicks.slice(-20);
    const older100 = rollingTicks.slice(0, Math.max(0, rollingTicks.length - 20));
    const recentCounts = Array(10).fill(0);
    recent20.forEach(t => { if (t.digit >= 0 && t.digit <= 9) recentCounts[t.digit]++; });
    const olderCounts = Array(10).fill(0);
    older100.forEach(t => { if (t.digit >= 0 && t.digit <= 9) olderCounts[t.digit]++; });

    const transitions = Array(10).fill(0).map(() => Array(10).fill(0));
    for (let i = 0; i < rollingTicks.length - 1; i++) {
      const tDigit = rollingTicks[i].digit;
      const pDigit = rollingTicks[i + 1].digit;
      if (tDigit >= 0 && tDigit <= 9 && pDigit >= 0 && pDigit <= 9) transitions[tDigit][pDigit]++;
    }

    const combinations = [];
    for (let p = 0; p < 10; p++) {
      for (let t = 0; t < 10; t++) {
        if (p === t) continue;
        const predFreq = freqs[p].percentage;
        const predStability = stabilities[p];
        const frequencyStrength = Math.max(0, Math.min(100, (predFreq * 5) + (predStability * 0.25)));
        const triggerFreq = freqs[t].percentage;
        const triggerRarityScore = Math.max(0, Math.min(100, 100 - Math.abs(triggerFreq - 9.5) * 15));
        const stabilityScore = Math.round((stabilities[p] * 0.6) + (stabilities[t] * 0.4));
        const separationVal = Math.abs(freqs[p].percentage - freqs[t].percentage);
        const signalSeparation = Math.min(100, separationVal * 15);
        const totalTransitionsFromT = transitions[t].reduce((a, b) => a + b, 0);
        const transitionRate = totalTransitionsFromT > 0 ? (transitions[t][p] / totalTransitionsFromT) : 0;
        const correlationScore = Math.min(100, transitionRate * 300);

        const totalWeightedScore = (frequencyStrength * 0.30) + (triggerRarityScore * 0.20) + (stabilityScore * 0.20) + (signalSeparation * 0.15) + (correlationScore * 0.15);
        const confidence = Math.max(10, Math.min(99, Math.round(totalWeightedScore)));

        let risk: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
        if (confidence >= 80) risk = "LOW";
        else if (confidence < 55) risk = "HIGH";

        combinations.push({ prediction: p, trigger: t, score: totalWeightedScore, confidence, risk });
      }
    }

    combinations.sort((a, b) => b.score - a.score);
    const bestCombo = combinations[0] || { prediction: 4, trigger: 9, score: 50, confidence: 60, risk: "MEDIUM" as const };

    const recPrediction = bestCombo.prediction;
    const recTrigger = bestCombo.trigger;
    const confidenceScore = bestCombo.confidence;
    const riskLevel = bestCombo.risk;

    const maxPct = Math.max(...freqs.map(f => f.percentage));
    const minPct = Math.min(...freqs.map(f => f.percentage));
    const spread = maxPct - minPct;

    let marketStability: "STABLE" | "VOLATILE" | "TRENDING" = "STABLE";
    let stabilityIndex = 50;
    if (spread < 6) { marketStability = "VOLATILE"; stabilityIndex = Math.round(25 + spread * 4); }
    else if (spread > 13) { marketStability = "TRENDING"; stabilityIndex = Math.min(100, Math.round(75 + (spread - 13) * 2)); }
    else { marketStability = "STABLE"; stabilityIndex = Math.round(50 + (spread - 6) * 3.5); }

    const tradeQualityScore = Math.min(100, Math.round((confidenceScore * 0.7) + (stabilityIndex * 0.3)));

    let reason = "";
    const momentumDirection = recentCounts[recPrediction] > olderCounts[recPrediction] ? "building positive trend momentum" : "stable statistical density";
    const transitionPercent = Math.round((transitions[recTrigger][recPrediction] / Math.max(1, transitions[recTrigger].reduce((a, b) => a + b, 0))) * 100);

    if (confidenceScore > 80) {
      reason = `Digit [${recPrediction}] is highly dominant with ${stabilities[recPrediction]}% sub-window stability. Strong local coupling detected: follows Trigger [${recTrigger}] ${transitionPercent}% of the time with ${momentumDirection}.`;
    } else if (confidenceScore > 60) {
      reason = `Digit [${recPrediction}] is exhibiting ${momentumDirection} with moderate stability (${stabilities[recPrediction]}%). Core transition correlation with trigger [${recTrigger}] is active.`;
    } else {
      reason = `Sideways market detected. Digit [${recPrediction}] remains the optimal prediction with high-risk exposure; suggest waiting for a more pronounced trend.`;
    }

    return {
      predictionDigit: recPrediction, triggerDigit: recTrigger, confidenceScore, reason, riskLevel,
      stabilityIndex, tradeQualityScore, marketStability, combinations: combinations.slice(0, 10)
    };
  }

  getActiveDigits() {
    if (this.config.useLockedPair && this.config.lockedPredictionDigit !== null && this.config.lockedPredictionDigit !== undefined && this.config.lockedTriggerDigit !== null && this.config.lockedTriggerDigit !== undefined) {
      return { predictionDigit: this.config.lockedPredictionDigit, triggerDigit: this.config.lockedTriggerDigit };
    }
    if (this.config.analysisMode === "SMART") {
      const smart = this.calculateSmartAnalysis();
      return { predictionDigit: smart.predictionDigit, triggerDigit: smart.triggerDigit };
    }
    const classic = this.calculateDigits();
    return { predictionDigit: classic.predictionDigit, triggerDigit: classic.triggerDigit };
  }

  checkRiskLimits() {
    if (!this.status.autoTrading) return;

    if (this.config.takeProfitEnabled) {
      const sessionProfit = this.balance - this.sessionStartBalance;
      if (sessionProfit >= this.config.takeProfitAmount) {
        this.status.autoTrading = false;
        this.addLog("success", `🏆 TAKE PROFIT TARGET REACHED! Session Profit of +$${sessionProfit.toFixed(2)} met or exceeded target of +$${this.config.takeProfitAmount.toFixed(2)}. Auto-trading halted for your safety.`);
        return;
      }
    }
    if (this.config.stopLossEnabled) {
      const sessionLoss = this.sessionStartBalance - this.balance;
      if (sessionLoss >= this.config.stopLossAmount) {
        this.status.autoTrading = false;
        this.addLog("error", `🛡️ STOP LOSS LIMIT REACHED! Session Loss of -$${sessionLoss.toFixed(2)} met or exceeded limit of -$${this.config.stopLossAmount.toFixed(2)}. Auto-trading halted for capital protection.`);
        return;
      }
    }
    if (this.config.consecutiveLossLimitEnabled) {
      if (this.consecutiveLosses >= this.config.consecutiveLossLimitAmount) {
        this.status.autoTrading = false;
        this.addLog("error", `🚨 CONSECUTIVE LOSS LIMIT BREACHED: ${this.config.consecutiveLossLimitAmount} consecutive losses detected. Auto-trading halted for capital protection. (You can adjust/disable this in the safeguard settings)`);
        return;
      }
    }
    if (this.balance <= 0 || this.balance < this.config.stake) {
      this.status.autoTrading = false;
      this.addLog("error", `🛑 INSUFFICIENT BALANCE: Available balance ($${this.balance.toFixed(2)}) is less than required base stake ($${this.config.stake.toFixed(2)}). Automated trading halted to prevent negative balance.`);
    }
  }

  runOrchestrator(newTick: Tick) {
    if (this.pendingTrade) {
      const exitDigit = newTick.digit;
      const targetPrediction = this.pendingTrade.predictionDigit;

      this.pendingTrade.exitPrice = newTick.price;
      this.pendingTrade.exitEpoch = newTick.epoch;
      this.pendingTrade.exitDigit = exitDigit;

      if (exitDigit === targetPrediction) {
        const profit = parseFloat((this.pendingTrade.stake * 8.09).toFixed(2));
        this.pendingTrade.profit = profit;
        this.pendingTrade.payout = parseFloat((this.pendingTrade.stake + profit).toFixed(2));
        this.pendingTrade.result = "WIN";
        this.balance = parseFloat((this.balance + profit).toFixed(2));
        this.pendingTrade.balanceAfter = this.balance;
        this.status.balance = this.balance;
        this.consecutiveLosses = 0;
        this.currentMartingaleStep = 0;
        this.addLog("success", `🎯 TRADE WIN: Exit digit ${exitDigit} matched prediction ${targetPrediction}! Profit: +$${profit}. New Balance: $${this.balance}. Martingale reset.`);
      } else {
        const loss = -this.pendingTrade.stake;
        this.pendingTrade.profit = loss;
        this.pendingTrade.payout = 0.0;
        this.pendingTrade.result = "LOSS";
        this.balance = parseFloat(Math.max(0, this.balance + loss).toFixed(2));
        this.pendingTrade.balanceAfter = this.balance;
        this.status.balance = this.balance;

        if (this.status.autoTrading && this.balance < this.config.stake) {
          this.status.autoTrading = false;
          this.addLog("error", `🛑 INSUFFICIENT BALANCE AFTER LOSS: Remaining balance ($${this.balance.toFixed(2)}) is lower than base stake ($${this.config.stake.toFixed(2)}). Automated trading stopped to prevent negative balance.`);
        }

        this.consecutiveLosses++;
        if (this.config.martingaleEnabled) this.currentMartingaleStep++;

        this.addLog("error", `❌ TRADE LOSS: Exit digit was ${exitDigit} (Target Prediction: ${targetPrediction}). Stake lost: -$${this.pendingTrade.stake}. New Balance: $${this.balance}. Consecutive losses: ${this.consecutiveLosses}.`);
      }

      this.trades.unshift(this.pendingTrade);
      if (this.trades.length > 500) this.trades.pop();
      this.pendingTrade = null;
      this.saveState();
    }

    this.ticks.push(newTick);
    if (this.ticks.length > this.config.windowSize) this.ticks.shift();

    this.currentAnalysis = this.calculateAnalysisEngine(15);

    if (this.currentAnalysis.dominant_digit !== null && this.currentAnalysis.dominant_digit !== undefined) {
      this.dominantDigitHistory.push(this.currentAnalysis.dominant_digit);
      if (this.dominantDigitHistory.length > 10) this.dominantDigitHistory.shift();
    }

    this.currentStrategyResult = this.evaluateStrategy(this.currentAnalysis);

    if (this.status.autoTrading) {
      this.checkRiskLimits();

      if (this.status.autoTrading && !this.pendingTrade) {
        let shouldTrade = false;
        let targetPrediction: number | null = null;
        let targetTrigger: number | null = null;
        let executionReason = "";

        const activeMode = this.config.analysisMode || "CLASSIC";

        if (activeMode === "HFT_15") {
          if (this.currentStrategyResult.signal) {
            targetPrediction = this.currentStrategyResult.target_digit;
            targetTrigger = this.currentStrategyResult.trigger_digit;
            if (newTick.digit === targetTrigger) {
              shouldTrade = true;
              executionReason = `HFT 15-Tick Signal is Active. Current tick ended with Trigger Digit [${targetTrigger}]. Executing Matches trade on Dominant Digit [${targetPrediction}].`;
            }
          }
        } else {
          const { predictionDigit, triggerDigit } = this.getActiveDigits();
          if (predictionDigit !== null && triggerDigit !== null) {
            targetPrediction = predictionDigit;
            targetTrigger = triggerDigit;
            if (newTick.digit === targetTrigger) {
              shouldTrade = true;
              executionReason = `${activeMode} Mode Signal Active: Current tick ended with Trigger Digit [${targetTrigger}]. Executing Matches trade on Prediction Digit [${targetPrediction}].`;
            }
          }
        }

        if (shouldTrade && (this.status.tieStatus === "TIE_PAUSED" || this.status.tieStatus === "COOLDOWN")) {
          this.addLog("info", `⏳ Trade trigger bypassed: Engine is in ${this.status.tieStatus} state.`);
          shouldTrade = false;
        }

        if (shouldTrade && targetPrediction !== null && targetTrigger !== null) {
          let activeStake = this.config.stake;
          if (this.config.martingaleEnabled && this.currentMartingaleStep > 0) {
            activeStake = parseFloat((this.config.stake * Math.pow(this.config.martingaleMultiplier, this.currentMartingaleStep)).toFixed(2));
          }

          if (activeStake > this.status.balance && this.config.martingaleEnabled && this.currentMartingaleStep > 0 && this.config.stake <= this.status.balance) {
            this.addLog("info", `⚠️ MARTINGALE STAKE EXCEEDS BALANCE: Stake $${activeStake} exceeds available balance ($${this.status.balance.toFixed(2)}). Reverting to base stake ($${this.config.stake.toFixed(2)}).`);
            this.currentMartingaleStep = 0;
            activeStake = this.config.stake;
          }

          if (this.config.maxStakeEnabled && activeStake > this.config.maxStakeAmount) {
            if (this.config.martingaleActionOnMax === "HALT") {
              this.status.autoTrading = false;
              this.addLog("error", `⚠️ RISK BREACH: Stake of $${activeStake} exceeds maximum allowed stake limit ($${this.config.maxStakeAmount}). Trading halted.`);
              this.broadcastSummary();
              this.saveState();
              return;
            } else {
              this.addLog("info", `⚠️ STAKE EXCEEDED: Stake $${activeStake} exceeds max stake. Resetting martingale steps.`);
              this.currentMartingaleStep = 0;
              activeStake = this.config.stake;
            }
          }

          if (activeStake > this.status.balance || this.status.balance <= 0) {
            this.status.autoTrading = false;
            this.addLog("error", `🛑 INSUFFICIENT BALANCE: Required trade stake ($${activeStake.toFixed(2)}) exceeds available balance ($${this.status.balance.toFixed(2)}). Automated trading halted to prevent negative balance.`);
            this.broadcastSummary();
            this.saveState();
            return;
          }

          const tradeId = `trade_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          this.pendingTrade = {
            id: tradeId,
            timestamp: new Date().toISOString(),
            symbol: this.config.symbol,
            predictionDigit: targetPrediction,
            triggerDigit: targetTrigger,
            stake: activeStake,
            payout: 0,
            profit: 0,
            result: "PENDING",
            entryPrice: newTick.price,
            entryEpoch: newTick.epoch,
            entryDigit: newTick.digit
          };

          const martingaleIndicator = this.config.martingaleEnabled && this.currentMartingaleStep > 0 ? ` [Step ${this.currentMartingaleStep}]` : "";
          this.addLog("trade", `🤖 AUTO TRADE PLACED: Matches Digits on ${this.config.symbol}. Stake: $${activeStake}${martingaleIndicator}. Prediction Target: [${targetPrediction}], Trigger Source: [${targetTrigger}]. Reason: ${executionReason}`);

          if (this.status.derivMode === "LIVE" && this.config.derivToken) {
            this.executeRealDerivTrade(targetPrediction, activeStake);
          }
        }
      }
    }

    this.updateTieState();
    this.saveState();
    this.broadcastSummary();
  }

  buildSummaryPayload(): AnalysisSummary & { analysis15?: any; signal15?: any; smartAnalysis?: any } {
    this.status.sessionStartBalance = this.sessionStartBalance;
    const { freqs, predictionDigit, triggerDigit } = this.calculateDigits();
    const smartAnalysis = this.calculateSmartAnalysis();
    return {
      ticks: this.ticks,
      frequencies: freqs,
      predictionDigit,
      triggerDigit,
      status: this.status,
      config: this.config,
      trades: this.trades,
      logs: this.logs,
      smartAnalysis,
      analysis15: this.currentAnalysis,
      signal15: this.currentStrategyResult
    };
  }

  broadcastSummary() {
    const summary = this.buildSummaryPayload();
    const payload = JSON.stringify({ type: "SUMMARY_UPDATE", data: summary });
    this.wsClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }

  startSimulator() {
    if (this.simulatedInterval) clearInterval(this.simulatedInterval);
    this.addLog("info", `Simulated tick stream started for ${this.config.symbol}`);

    this.simulatedInterval = setInterval(() => {
      if (this.status.engineStatus === "PAUSED") return;

      let currentPrice = this.symbolPrices[this.config.symbol] || 500.0;
      const walkMultiplier = this.config.symbol.startsWith("R_") ? parseFloat(this.config.symbol.replace("R_", "")) / 20 : 5;
      const change = (Math.random() - 0.5) * (walkMultiplier * 0.1);
      currentPrice = parseFloat((currentPrice + change).toFixed(2));
      this.symbolPrices[this.config.symbol] = currentPrice;

      const priceStr = currentPrice.toFixed(2);
      const lastChar = priceStr.charAt(priceStr.length - 1);
      const digit = parseInt(lastChar, 10);

      const newTick: Tick = {
        id: `tick_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        epoch: Math.floor(Date.now() / 1000),
        price: currentPrice,
        digit,
        symbol: this.config.symbol
      };

      this.runOrchestrator(newTick);
    }, 1500);
  }

  stopSimulator() {
    if (this.simulatedInterval) {
      clearInterval(this.simulatedInterval);
      this.simulatedInterval = null;
    }
  }

  async connectToDeriv() {
    if (this.derivWs) {
      try { this.derivWs.close(); } catch (e) {}
      this.derivWs = null;
    }
    if (this.derivPingInterval) clearInterval(this.derivPingInterval);

    if (this.status.derivMode === "SIMULATED") {
      this.status.connectionStatus = "CONNECTED";
      this.status.streamStatus = "LIVE";
      this.startSimulator();
      return;
    }

    this.stopSimulator();
    this.status.connectionStatus = "CONNECTING";
    this.status.streamStatus = "IDLE";
    this.broadcastSummary();

    const appId = this.config.derivAppId || "1089";

    // No token: read-only mode isn't supported by the new Options API
    // (every REST call requires a Bearer token), so fall back to Simulated.
    if (!this.config.derivToken) {
      this.addLog("info", `No token provided. Live read-only mode isn't available on Deriv's current API — returning to Simulated Sandbox Mode.`);
      this.status.derivMode = "SIMULATED";
      this.startSimulator();
      this.broadcastSummary();
      return;
    }

    this.addLog("info", `Connecting to Deriv Options API (App ID: ${appId})...`);

    try {
      // Step 1: List accounts to find the account ID this token belongs to.
      const accountsRes = await fetch("https://api.derivws.com/trading/v1/options/accounts", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.config.derivToken}`,
          "Deriv-App-ID": appId
        }
      });

      if (!accountsRes.ok) {
        const errBody = await accountsRes.json().catch(() => ({}));
        const errMsg = errBody?.errors?.[0]?.message || errBody?.message || `HTTP ${accountsRes.status}`;
        this.addLog("error", `Deriv API Error: ${errMsg}`);
        this.addLog("info", `💡 Hint: Confirm your token is a valid Personal Access Token with Read and Trade scopes, and that your App ID (${appId}) is registered correctly on developers.deriv.com.`);
        this.status.derivMode = "SIMULATED";
        this.addLog("info", `🔄 Automatically returned to Simulated Sandbox Mode.`);
        this.startSimulator();
        this.status.streamStatus = "ERROR";
        this.broadcastSummary();
        return;
      }

      const accountsData = await accountsRes.json();
      const accounts = accountsData?.data ?? [];
      if (!accounts.length) {
        this.addLog("error", `Deriv API Error: No accounts found for this token.`);
        this.status.derivMode = "SIMULATED";
        this.startSimulator();
        this.status.streamStatus = "ERROR";
        this.broadcastSummary();
        return;
      }

      // Prefer a real (non-virtual) account since this is LIVE mode; fall back to first.
      // Pick the account matching the user's demo/real toggle. Fall back to
      // any account of that type; if none exists, fall back to first account
      // available rather than silently switching account types.
      const wantsDemo = this.config.derivAccountType !== "real";
      const account =
        accounts.find((a: any) => (wantsDemo ? !!a.is_virtual : !a.is_virtual)) ?? accounts[0];
      if (wantsDemo && !account.is_virtual) {
        this.addLog("info", `No demo/virtual account found on this token — using ${account.account_id || account.loginid} instead.`);
      } else if (!wantsDemo && account.is_virtual) {
        this.addLog("info", `No real account found on this token — using demo account ${account.account_id || account.loginid} instead.`);
      }
      const accountId = account.account_id || account.loginid;
      this.derivAccountCurrency = account.currency || "USD";

      // Step 2: Request an OTP-authenticated WebSocket URL for that account.
      const otpRes = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${accountId}/otp`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.config.derivToken}`,
          "Deriv-App-ID": appId
        }
      });

      if (!otpRes.ok) {
        const errBody = await otpRes.json().catch(() => ({}));
        const errMsg = errBody?.errors?.[0]?.message || errBody?.message || `HTTP ${otpRes.status}`;
        this.addLog("error", `Deriv API Error requesting OTP: ${errMsg}`);
        this.status.derivMode = "SIMULATED";
        this.startSimulator();
        this.status.streamStatus = "ERROR";
        this.broadcastSummary();
        return;
      }

      const otpData = await otpRes.json();
      const wsUrl = otpData?.data?.url;
      if (!wsUrl) {
        this.addLog("error", `Deriv API Error: OTP response did not include a WebSocket URL.`);
        this.status.derivMode = "SIMULATED";
        this.startSimulator();
        this.status.streamStatus = "ERROR";
        this.broadcastSummary();
        return;
      }

      // Step 3: Connect — this URL is pre-authenticated, no separate authorize message needed.
      this.derivWs = new WebSocket(wsUrl);
      let messagesReceived = 0;
      const receivedTypes: string[] = [];

      this.derivWs.on("open", () => {
        this.status.connectionStatus = "CONNECTED";
        this.status.derivMode = "LIVE";
        this.addLog("success", `Connected & authorized via Deriv Options API! Account: ${accountId}.`);

        this.derivPingInterval = setInterval(() => {
          if (this.derivWs && this.derivWs.readyState === WebSocket.OPEN) {
            // Native WS-protocol ping frame, in case an intermediary proxy
            // needs transport-level keepalive rather than just app-level JSON.
            try { this.derivWs.ping(); } catch (e) {}
            this.derivWs.send(JSON.stringify({ ping: 1 }));
          }
        }, 5000);

        this.derivWs!.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        this.derivWs!.send(JSON.stringify({ ticks: this.config.symbol, subscribe: 1 }));
        this.status.streamStatus = "LIVE";
        this.broadcastSummary();
      });

      this.derivWs.on("message", (rawData) => {
        try {
          const response = JSON.parse(rawData.toString());
          messagesReceived++;
          if (response.msg_type && !receivedTypes.includes(response.msg_type)) {
            receivedTypes.push(response.msg_type);
          }

          if (response.error) {
            const errMsg = response.error.message;
            this.addLog("error", `Deriv API Error: ${errMsg}`);
            this.status.streamStatus = "ERROR";
            if (response.msg_type === "proposal" || response.msg_type === "buy") {
              this.pendingTrade = null;
            }
            this.broadcastSummary();
            return;
          }

          const msgType = response.msg_type;

          if (msgType === "balance" && response.balance) {
            const parsedBal = Number(response.balance.balance);
            if (!isNaN(parsedBal)) {
              this.balance = parsedBal;
              this.status.balance = this.balance;
            }
          } else if (msgType === "tick") {
            if (this.status.engineStatus === "PAUSED") return;
            const tickData = response.tick;
            const price = parseFloat(tickData.quote);
            const epoch = tickData.epoch;
            const symbol = tickData.symbol;
            if (symbol !== this.config.symbol) return;

            const priceStr = price.toFixed(tickData.pip_size || 2);
            const lastChar = priceStr.charAt(priceStr.length - 1);
            const digit = parseInt(lastChar, 10);

            const newTick: Tick = { id: `deriv_${tickData.id}`, epoch, price, digit, symbol };
            this.runOrchestrator(newTick);
          } else if (msgType === "proposal") {
            // Proposal received — confirm price then buy using its ID.
            const proposalId = response.proposal?.id;
            const price = response.proposal?.ask_price;
            if (proposalId && this.derivWs && this.derivWs.readyState === WebSocket.OPEN) {
              this.derivWs.send(JSON.stringify({ buy: proposalId, price }));
            }
          } else if (msgType === "buy") {
            this.addLog("success", `Deriv Contract Bought: ${response.buy.contract_id}. Payout potential: $${response.buy.payout}`);
            const parsedBal = Number(response.buy.balance_after);
            if (!isNaN(parsedBal)) {
              this.balance = parsedBal;
              this.status.balance = this.balance;
            }
          }
        } catch (e: any) {
          console.error(`[${this.id}] Error parsing Deriv message:`, e);
        }
      });

      this.derivWs.on("close", (code, reasonBuf) => {
        const reason = reasonBuf?.toString() || "(no reason given)";
        this.status.connectionStatus = "DISCONNECTED";
        this.status.streamStatus = "IDLE";
        this.addLog("error", `Deriv API Connection Closed. Code: ${code}, Reason: ${reason}. Messages received before close: ${messagesReceived} (types: ${receivedTypes.join(", ") || "none"}).`);
        this.broadcastSummary();

        if (this.status.derivMode === "LIVE") {
          setTimeout(() => {
            if (this.status.derivMode === "LIVE") this.connectToDeriv();
          }, 15000);
        }
      });

      this.derivWs.on("error", (err) => {
        this.status.connectionStatus = "DISCONNECTED";
        this.status.streamStatus = "ERROR";
        this.addLog("error", `Deriv WebSocket Error: ${err.message}`);
        this.broadcastSummary();
      });
    } catch (err: any) {
      this.status.connectionStatus = "DISCONNECTED";
      this.status.streamStatus = "ERROR";
      this.addLog("error", `Failed to connect to Deriv: ${err.message}`);
      this.status.derivMode = "SIMULATED";
      this.startSimulator();
      this.broadcastSummary();
    }
  }

  executeRealDerivTrade(predictionDigit: number, activeStake: number) {
    if (!this.derivWs || this.derivWs.readyState !== WebSocket.OPEN) return;

    // New Options API requires a two-step flow: request a proposal, then buy
    // using the proposal's ID once it comes back on the message handler above.
    const req = {
      proposal: 1,
      amount: activeStake,
      basis: "stake",
      contract_type: "DIGITMATCH",
      currency: "USD",
      duration: 1,
      duration_unit: "t",
      barrier: predictionDigit.toString(),
      underlying_symbol: this.config.symbol
    };

    this.addLog("trade", `📡 REQUESTING PROPOSAL FROM DERIV: Matches Digits on ${this.config.symbol}. Stake: $${activeStake}. Barrier: [${predictionDigit}]`);
    this.derivWs.send(JSON.stringify(req));
  }

  // Fully tears this session down (used on idle eviction). State stays on
  // disk via saveState() and will be reloaded lazily next time this user
  // connects.
  destroy() {
    this.stopSimulator();
    if (this.derivPingInterval) clearInterval(this.derivPingInterval);
    if (this.derivWs) {
      try { this.derivWs.close(); } catch (e) {}
    }
    this.saveState();
  }
}

// ---------------------------------------------------------------------------
// Session registry
// ---------------------------------------------------------------------------
const sessions = new Map<string, TradingSession>();

function getOrCreateSession(id: string): TradingSession {
  let session = sessions.get(id);
  if (!session) {
    session = new TradingSession(id);
    session.loadState();
    session.bootstrapHistoricalTicks();
    session.connectToDeriv(); // starts the simulator (or live feed) for this user
    sessions.set(id, session);
    console.log(`[session] Created new session for ${id}. Active sessions: ${sessions.size}`);
  }
  return session;
}

// Evict idle sessions (no activity for 30+ minutes) to bound memory/CPU as
// more users join. Their state is safely persisted to disk beforehand.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.wsClients.size === 0 && now - session.lastActivity > IDLE_TIMEOUT_MS) {
      session.destroy();
      sessions.delete(id);
      console.log(`[session] Evicted idle session ${id}. Active sessions: ${sessions.size}`);
    }
  }
}, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// REST API Endpoints — every route resolves a session via requireSession()
// ---------------------------------------------------------------------------
app.get("/api/summary", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  res.json(session.buildSummaryPayload());
});

app.post("/api/config", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const newConfig = req.body;
  if (!newConfig) return res.status(400).json({ error: "Missing config body" });

  let modeChanged = false;
  let symbolChanged = false;
  let credentialsChanged = false;

  if (newConfig.derivMode && newConfig.derivMode !== session.status.derivMode) {
    session.status.derivMode = newConfig.derivMode;
    modeChanged = true;
  }
  if (newConfig.symbol && newConfig.symbol !== session.config.symbol) {
    session.config.symbol = newConfig.symbol;
    session.status.symbol = newConfig.symbol;
    symbolChanged = true;
  }
  if (newConfig.stake !== undefined) session.config.stake = parseFloat(newConfig.stake);

  if (newConfig.derivToken !== undefined) {
    const trimmedToken = typeof newConfig.derivToken === "string" ? newConfig.derivToken.trim() : newConfig.derivToken;
    if (trimmedToken !== session.config.derivToken) {
      session.config.derivToken = trimmedToken;
      credentialsChanged = true;
    }
  }
  if (newConfig.derivAppId !== undefined) {
    const trimmedAppId = typeof newConfig.derivAppId === "string" ? newConfig.derivAppId.trim() : newConfig.derivAppId;
    if (trimmedAppId !== session.config.derivAppId) {
      session.config.derivAppId = trimmedAppId;
      credentialsChanged = true;
    }
  }
  if (newConfig.derivAccountType !== undefined && newConfig.derivAccountType !== session.config.derivAccountType) {
    session.config.derivAccountType = newConfig.derivAccountType;
    session.addLog("info", `🔄 Deriv account type switched to: ${newConfig.derivAccountType === "real" ? "REAL" : "DEMO"}`);
    credentialsChanged = true;
  }

  if (newConfig.analysisMode !== undefined) {
    session.config.analysisMode = newConfig.analysisMode;
    session.addLog("info", `🔄 Analysis Mode switched to: ${session.config.analysisMode}`);
  }
  if (newConfig.lockedPredictionDigit !== undefined) session.config.lockedPredictionDigit = newConfig.lockedPredictionDigit;
  if (newConfig.lockedTriggerDigit !== undefined) session.config.lockedTriggerDigit = newConfig.lockedTriggerDigit;
  if (newConfig.useLockedPair !== undefined) session.config.useLockedPair = newConfig.useLockedPair;
  if (newConfig.cooldownAfterTieEnabled !== undefined) {
    session.config.cooldownAfterTieEnabled = !!newConfig.cooldownAfterTieEnabled;
    session.updateTieState();
  }

  if (newConfig.martingaleEnabled !== undefined) {
    session.config.martingaleEnabled = !!newConfig.martingaleEnabled;
    session.currentMartingaleStep = 0;
  }
  if (newConfig.martingaleMultiplier !== undefined) {
    session.config.martingaleMultiplier = parseFloat(newConfig.martingaleMultiplier);
    session.currentMartingaleStep = 0;
  }
  if (newConfig.martingaleMaxSteps !== undefined) {
    session.config.martingaleMaxSteps = parseInt(newConfig.martingaleMaxSteps, 10);
    session.currentMartingaleStep = 0;
  }

  if (newConfig.takeProfitEnabled !== undefined) session.config.takeProfitEnabled = !!newConfig.takeProfitEnabled;
  if (newConfig.takeProfitAmount !== undefined) session.config.takeProfitAmount = parseFloat(newConfig.takeProfitAmount);
  if (newConfig.stopLossEnabled !== undefined) session.config.stopLossEnabled = !!newConfig.stopLossEnabled;
  if (newConfig.stopLossAmount !== undefined) session.config.stopLossAmount = parseFloat(newConfig.stopLossAmount);
  if (newConfig.maxStakeEnabled !== undefined) session.config.maxStakeEnabled = !!newConfig.maxStakeEnabled;
  if (newConfig.maxStakeAmount !== undefined) session.config.maxStakeAmount = parseFloat(newConfig.maxStakeAmount);
  if (newConfig.martingaleActionOnMax !== undefined) session.config.martingaleActionOnMax = newConfig.martingaleActionOnMax;
  if (newConfig.consecutiveLossLimitEnabled !== undefined) session.config.consecutiveLossLimitEnabled = !!newConfig.consecutiveLossLimitEnabled;
  if (newConfig.consecutiveLossLimitAmount !== undefined) session.config.consecutiveLossLimitAmount = parseInt(newConfig.consecutiveLossLimitAmount, 10);

  session.addLog("info", `Configuration updated. Symbol: ${session.config.symbol}, Stake: $${session.config.stake}, Martingale: ${session.config.martingaleEnabled ? "ON (" + session.config.martingaleMultiplier + "x, max " + session.config.martingaleMaxSteps + " steps)" : "OFF"}.`);

  if (symbolChanged) session.bootstrapHistoricalTicks();
  if (modeChanged || symbolChanged || credentialsChanged) {
    session.connectToDeriv();
  } else {
    session.broadcastSummary();
  }
  session.saveState();

  res.json({ success: true, config: session.config, status: session.status });
});

app.post("/api/scan-all", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const AVAILABLE_SYMBOLS = ["1HZ100V", "1HZ10V", "1HZ25V", "1HZ50V", "1HZ75V", "R_10", "R_100", "R_25", "R_50", "R_75"];

  let bestSymbol = session.config.symbol;
  let bestScore = -1;
  let bestResult: SmartAnalysisResult | null = null;

  AVAILABLE_SYMBOLS.forEach(sym => {
    let symTicks: Tick[] = [];
    if (sym === session.config.symbol) {
      symTicks = session.ticks.filter(t => t.symbol === session.config.symbol);
    } else {
      const timeBlock = Math.floor(Date.now() / (1000 * 60 * 15));
      const seed = `${sym}_${timeBlock}`;
      const rng = seededRandom(seed);
      let basePrice = session.symbolPrices[sym] || DEFAULT_SYMBOL_PRICES[sym] || 1000.0;
      const now = Math.floor(Date.now() / 1000);
      const digits = generateDigitsForSymbol(sym, 120, seed);
      for (let i = 120; i > 0; i--) {
        const change = (rng() - 0.5) * 4.0;
        basePrice = parseFloat((basePrice + change).toFixed(2));
        const digit = digits[120 - i];
        symTicks.push({ id: `eval_${sym}_${now - i}`, epoch: now - i, price: basePrice, digit, symbol: sym });
      }
    }

    const analysis = session.calculateSmartAnalysis(symTicks);
    const topCombo = analysis.combinations[0];
    if (topCombo && topCombo.score > bestScore) {
      bestScore = topCombo.score;
      bestSymbol = sym;
      bestResult = analysis;
    }
  });

  if (bestResult) {
    const topCombo = (bestResult as SmartAnalysisResult).combinations[0];
    const oldSymbol = session.config.symbol;

    session.config.symbol = bestSymbol;
    session.status.symbol = bestSymbol;
    session.config.lockedPredictionDigit = topCombo.prediction;
    session.config.lockedTriggerDigit = topCombo.trigger;
    session.config.useLockedPair = true;

    const humanNames: Record<string, string> = {
      "1HZ100V": "Volatility 100 (1s) Index", "1HZ10V": "Volatility 10 (1s) Index", "1HZ25V": "Volatility 25 (1s) Index",
      "1HZ50V": "Volatility 50 (1s) Index", "1HZ75V": "Volatility 75 (1s) Index", "R_10": "Volatility 10 Index",
      "R_100": "Volatility 100 Index", "R_25": "Volatility 25 Index", "R_50": "Volatility 50 Index", "R_75": "Volatility 75 Index"
    };
    const bestSymName = humanNames[bestSymbol] || bestSymbol;
    session.addLog("success", `🔍 GLOBAL POOL SCAN COMPLETED! Evaluated 10 synthetic pairs (900 digit combinations). Isolated absolute best performance profile on ${bestSymName} (${bestSymbol}) with ${(bestResult as SmartAnalysisResult).confidenceScore}% confidence index.`);
    session.addLog("trigger", `🎯 LOADED BEST PAIR: Automated lock secured on ${bestSymbol} → Trigger [${topCombo.trigger}] and Predict [${topCombo.prediction}].`);

    if (oldSymbol !== bestSymbol) {
      session.bootstrapHistoricalTicks();
      session.connectToDeriv();
    } else {
      session.broadcastSummary();
    }

    res.json({
      success: true, symbol: bestSymbol, lockedPredictionDigit: topCombo.prediction, lockedTriggerDigit: topCombo.trigger,
      confidence: (bestResult as SmartAnalysisResult).confidenceScore, tradeQualityScore: (bestResult as SmartAnalysisResult).tradeQualityScore,
      config: session.config, status: session.status
    });
  } else {
    res.status(500).json({ error: "Failed to isolate optimal pair during scan." });
  }
});

app.post("/api/sync-state", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const { balance: clientBalance, reservedBalance: clientReserved, trades: clientTrades, logs: clientLogs, config: clientConfig } = req.body;
    let modified = false;

    if (typeof clientBalance === "number" && !isNaN(clientBalance)) {
      if (session.balance === 10000.00 && clientBalance !== 10000.00) {
        session.balance = clientBalance;
        session.status.balance = session.balance;
        modified = true;
      }
    }
    if (typeof clientReserved === "number" && !isNaN(clientReserved) && clientReserved >= 0) {
      if (session.reservedBalance === 0 && clientReserved > 0) {
        session.reservedBalance = clientReserved;
        session.status.reservedBalance = session.reservedBalance;
        modified = true;
      }
    }
    if (Array.isArray(clientTrades) && clientTrades.length > 0 && session.trades.length === 0) {
      session.trades = clientTrades;
      modified = true;
    }
    if (Array.isArray(clientLogs) && clientLogs.length > 0 && session.logs.length === 0) {
      session.logs = clientLogs;
      modified = true;
    }
    if (clientConfig && typeof clientConfig === "object") {
      session.config = { ...session.config, ...clientConfig };
      session.status.symbol = session.config.symbol;
      modified = true;
    }

    if (modified) {
      session.saveState();
      session.broadcastSummary();
    }

    res.json({ success: true, balance: session.balance, tradesCount: session.trades.length, logsCount: session.logs.length });
  } catch (err: any) {
    console.error(`[${session.id}] Failed to sync state from client:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/action", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const { action, value } = req.body;

  if (action === "TOGGLE_AUTO_TRADE") {
    const wantToTurnOn = value !== undefined ? !!value : !session.status.autoTrading;
    if (wantToTurnOn && (session.balance <= 0 || session.balance < session.config.stake)) {
      session.status.autoTrading = false;
      session.addLog("error", `🛑 CANNOT START AUTO TRADING: Available balance ($${session.balance.toFixed(2)}) is insufficient for base stake ($${session.config.stake.toFixed(2)}).`);
      session.broadcastSummary();
      session.saveState();
      return res.status(400).json({ success: false, error: "INSUFFICIENT_BALANCE", autoTrading: false, message: `Available balance ($${session.balance.toFixed(2)}) is insufficient for base stake ($${session.config.stake.toFixed(2)}).` });
    }
    session.status.autoTrading = wantToTurnOn;
    if (session.status.autoTrading) {
      session.sessionStartBalance = session.balance;
      session.consecutiveLosses = 0;
      session.currentMartingaleStep = 0;
    }
    session.addLog("info", `Automated Trading engine turned ${session.status.autoTrading ? "🔴 ON" : "⚪ OFF"}${session.status.autoTrading ? " (Session Start Balance: $" + session.balance.toFixed(2) + ")" : ""}`);
    session.broadcastSummary();
    session.saveState();
    return res.json({ success: true, autoTrading: session.status.autoTrading });
  }

  if (action === "TOGGLE_ENGINE") {
    session.status.engineStatus = session.status.engineStatus === "RUNNING" ? "PAUSED" : "RUNNING";
    session.addLog("info", `Analysis and streaming engine ${session.status.engineStatus}`);
    session.broadcastSummary();
    return res.json({ success: true, engineStatus: session.status.engineStatus });
  }

  if (action === "CLEAR_LOGS") {
    session.logs = [];
    session.addLog("info", `Audit log cleared.`);
    session.saveState();
    session.broadcastSummary();
    return res.json({ success: true });
  }

  if (action === "RESET_TRADES") {
    session.trades = [];
    session.logs = [];
    session.status.balance = session.balance;
    session.consecutiveLosses = 0;
    session.currentMartingaleStep = 0;
    session.addLog("success", `Trade History cleared. Demo Balance is preserved at $${session.balance.toFixed(2)}.`);
    session.bootstrapHistoricalTicks();
    session.saveState();
    session.broadcastSummary();
    return res.json({ success: true });
  }

  if (action === "RESET_BALANCE") {
    session.balance = 10000.00;
    session.reservedBalance = 0.00;
    session.status.balance = session.balance;
    session.status.reservedBalance = session.reservedBalance;
    session.consecutiveLosses = 0;
    session.currentMartingaleStep = 0;
    session.addLog("success", `Demo balance reset to $10,000.00 (Reserved Safe cleared).`);
    session.saveState();
    session.broadcastSummary();
    return res.json({ success: true });
  }

  if (action === "MANAGE_VAULT") {
    const { subAction, amount } = req.body;
    const amt = parseFloat(amount || "0");

    if (subAction === "DEPOSIT" && amt > 0) {
      if (session.balance >= amt) {
        session.balance = parseFloat((session.balance - amt).toFixed(2));
        session.reservedBalance = parseFloat((session.reservedBalance + amt).toFixed(2));
        session.status.balance = session.balance;
        session.status.reservedBalance = session.reservedBalance;
        session.addLog("info", `🏦 Vault Transfer: Moved $${amt.toFixed(2)} USD into Sandbox Safe. Active demo balance: $${session.balance.toFixed(2)} USD.`);
      } else {
        return res.status(400).json({ error: "Insufficient active balance for deposit." });
      }
    } else if (subAction === "WITHDRAW" && amt > 0) {
      if (session.reservedBalance >= amt) {
        session.reservedBalance = parseFloat((session.reservedBalance - amt).toFixed(2));
        session.balance = parseFloat((session.balance + amt).toFixed(2));
        session.status.balance = session.balance;
        session.status.reservedBalance = session.reservedBalance;
        session.addLog("info", `🏦 Vault Transfer: Withdrew $${amt.toFixed(2)} USD from Sandbox Safe to active account.`);
      } else {
        return res.status(400).json({ error: "Insufficient reserved balance in safe." });
      }
    } else if (subAction === "WITHDRAW_ALL") {
      if (session.reservedBalance > 0) {
        const amtTransferred = session.reservedBalance;
        session.balance = parseFloat((session.balance + session.reservedBalance).toFixed(2));
        session.reservedBalance = 0.00;
        session.status.balance = session.balance;
        session.status.reservedBalance = session.reservedBalance;
        session.addLog("info", `🏦 Vault Transfer: Restored all $${amtTransferred.toFixed(2)} USD from safe back to active account.`);
      }
    } else if (subAction === "SET_ACTIVE_LEAVE" && amt > 0) {
      const totalAvailable = session.balance + session.reservedBalance;
      if (amt >= totalAvailable) {
        session.balance = parseFloat(totalAvailable.toFixed(2));
        session.reservedBalance = 0.00;
      } else {
        session.balance = parseFloat(amt.toFixed(2));
        session.reservedBalance = parseFloat((totalAvailable - amt).toFixed(2));
      }
      session.status.balance = session.balance;
      session.status.reservedBalance = session.reservedBalance;
      session.addLog("success", `🔒 Safe Preserved: Reserved $${session.reservedBalance.toFixed(2)} USD in safe. Active demo testing capital set to exactly $${session.balance.toFixed(2)} USD.`);
    }

    session.saveState();
    session.broadcastSummary();
    return res.json({ success: true, balance: session.balance, reservedBalance: session.reservedBalance });
  }

  if (action === "EMERGENCY_STOP") {
    session.status.autoTrading = false;
    session.pendingTrade = null;
    session.addLog("error", `🚨 EMERGENCY STOP PRESSED! ALL TRADING HALTED IMMEDIATELY!`);
    session.broadcastSummary();
    return res.json({ success: true });
  }

  res.status(400).json({ error: "Unknown action" });
});

app.post("/api/ai-analysis", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const ai = getAI();
    const { freqs, predictionDigit, triggerDigit } = session.calculateDigits();
    const recentDigits = session.ticks.slice(-30).map(t => t.digit).join(", ");

    const systemPrompt = `You are a premium institutional quantitative analyst specializing in high-frequency synthetic index trading (Matches Digits contracts). Your task is to provide an analytical report of the current digits stream.`;
    const userPrompt = `
      --- DIGIT ANALYSIS REQUEST ---
      Rolling Window Size: 120 ticks
      Current Active Symbol: ${session.config.symbol}
      Primary Prediction Digit: ${predictionDigit} (Highest frequency)
      Trigger Digit: ${triggerDigit} (Second highest frequency)

      Digit Distribution Counts and Frequencies:
      ${freqs.map(f => `Digit ${f.digit}: Count=${f.count}, Freq=${f.percentage}%`).join("\n")}

      Last 30 Digits stream: [ ${recentDigits} ]

      Please generate a crisp, executive summary including:
      1. Quantitative Assessment: Analyze the statistical imbalance of the current distribution.
      2. Patterns Observed: Are there micro-trends, repeating digit sequences, or clustering?
      3. Strategic Guidance: Assess whether the current gap between Primary and Trigger suggests high or low success probability for Matches Digits entries.
      Keep it strictly professional, logical, and compact. Format as markdown. Do not include verbose introductory pleasantries.
    `;

    session.addLog("info", `Requesting AI analytics report from Gemini...`);
    session.broadcastSummary();

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: { systemInstruction: systemPrompt }
    });

    const markdownReport = response.text || "No analysis returned.";
    res.json({ success: true, report: markdownReport });
  } catch (error: any) {
    session.addLog("error", `AI Refinement failed: ${error.message}`);
    session.broadcastSummary();
    res.status(500).json({ error: error.message || "Gemini API unavailable" });
  }
});

// --- FRONTEND INTEGRATION ENDPOINTS (secondary, per-session) ---
app.get("/api/analysis", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const windowSize = req.query.window ? parseInt(req.query.window as string, 10) : 15;
  res.json(session.calculateAnalysisEngine(windowSize));
});

app.get("/api/signal", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const windowSize = req.query.window ? parseInt(req.query.window as string, 10) : 15;
  const analysis = session.calculateAnalysisEngine(windowSize);
  res.json(session.evaluateStrategy(analysis));
});

app.get("/api/trades", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  res.json(session.trades);
});

app.get("/api/status", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  res.json(session.status);
});

app.get("/api/balance", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const summary = {
    initial_balance: session.sessionStartBalance,
    current_balance: session.balance,
    profit_loss: parseFloat((session.balance - session.sessionStartBalance).toFixed(2)),
    currency: "USD",
    total_trades: session.trades.length,
    wins: session.trades.filter(t => t.result === "WIN").length,
    losses: session.trades.filter(t => t.result === "LOSS").length
  };
  res.json(summary);
});

// Bootstrap: no global state to initialize anymore — sessions are created
// lazily on first authenticated request/connection.

// ---------------------------------------------------------------------------
// WebSocket: identify the session from the URL, since native browser
// WebSockets can't set custom headers.
// ---------------------------------------------------------------------------
server.on("upgrade", (request, socket, head) => {
  const url = request.url || "";
  const pathname = url.split("?")[0];

  if (pathname === "/ws" || pathname === "/" || pathname === "") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws, request) => {
  let parsed: URL;
  try {
    parsed = new URL(request.url || "/", "http://internal");
  } catch (e) {
    ws.close(4000, "Bad request");
    return;
  }

  const initData = parsed.searchParams.get("initData") || undefined;
  const fallbackUserId = parsed.searchParams.get("userId") || undefined;
  const sessionId = resolveSessionId(initData, fallbackUserId);

  if (!sessionId) {
    ws.close(4001, "Unauthorized");
    return;
  }

  const session = getOrCreateSession(sessionId);
  session.touch();
  session.wsClients.add(ws);

  ws.send(JSON.stringify({ type: "SUMMARY_UPDATE", data: session.buildSummaryPayload() }));

  ws.on("close", () => {
    session.wsClients.delete(ws);
  });

  ws.on("message", (msg) => {
    session.touch();
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === "TOGGLE_AUTO_TRADE") {
        const wantToTurnOn = !session.status.autoTrading;
        if (wantToTurnOn && (session.balance <= 0 || session.balance < session.config.stake)) {
          session.status.autoTrading = false;
          session.addLog("error", `🛑 CANNOT START AUTO TRADING: Available balance ($${session.balance.toFixed(2)}) is insufficient for base stake ($${session.config.stake.toFixed(2)}).`);
          session.broadcastSummary();
          session.saveState();
        } else {
          session.status.autoTrading = wantToTurnOn;
          if (session.status.autoTrading) {
            session.sessionStartBalance = session.balance;
            session.consecutiveLosses = 0;
            session.currentMartingaleStep = 0;
          }
          session.addLog("info", `Automated Trading engine turned ${session.status.autoTrading ? "🔴 ON" : "⚪ OFF"}${session.status.autoTrading ? " (Session Start Balance: $" + session.balance.toFixed(2) + ")" : ""}`);
          session.broadcastSummary();
          session.saveState();
        }
      } else if (data.type === "EMERGENCY_STOP") {
        session.status.autoTrading = false;
        session.pendingTrade = null;
        session.addLog("error", `🚨 EMERGENCY STOP PRESSED! ALL TRADING HALTED IMMEDIATELY!`);
        session.broadcastSummary();
        session.saveState();
      } else if (data.type === "UPDATE_CONFIG") {
        const newConf = data.data;
        if (newConf.stake !== undefined) session.config.stake = parseFloat(newConf.stake);
        if (newConf.martingaleEnabled !== undefined) {
          session.config.martingaleEnabled = !!newConf.martingaleEnabled;
          session.currentMartingaleStep = 0;
        }
        if (newConf.martingaleMultiplier !== undefined) {
          session.config.martingaleMultiplier = parseFloat(newConf.martingaleMultiplier);
          session.currentMartingaleStep = 0;
        }
        if (newConf.martingaleMaxSteps !== undefined) {
          session.config.martingaleMaxSteps = parseInt(newConf.martingaleMaxSteps, 10);
          session.currentMartingaleStep = 0;
        }
        let credentialsChanged = false;
        if (newConf.derivToken !== undefined) {
          const trimmedToken = typeof newConf.derivToken === "string" ? newConf.derivToken.trim() : newConf.derivToken;
          if (trimmedToken !== session.config.derivToken) {
            session.config.derivToken = trimmedToken;
            credentialsChanged = true;
          }
        }
        if (newConf.derivAppId !== undefined) {
          const trimmedAppId = typeof newConf.derivAppId === "string" ? newConf.derivAppId.trim() : newConf.derivAppId;
          if (trimmedAppId !== session.config.derivAppId) {
            session.config.derivAppId = trimmedAppId;
            credentialsChanged = true;
          }
        }
        if (newConf.derivAccountType !== undefined && newConf.derivAccountType !== session.config.derivAccountType) {
          session.config.derivAccountType = newConf.derivAccountType;
          session.addLog("info", `🔄 Deriv account type switched to: ${newConf.derivAccountType === "real" ? "REAL" : "DEMO"} (WS)`);
          credentialsChanged = true;
        }

        if (newConf.symbol !== undefined && newConf.symbol !== session.config.symbol) {
          session.config.symbol = newConf.symbol;
          session.status.symbol = newConf.symbol;
          session.bootstrapHistoricalTicks();
          session.connectToDeriv();
        } else if (newConf.derivMode !== undefined && newConf.derivMode !== session.status.derivMode) {
          session.status.derivMode = newConf.derivMode;
          session.connectToDeriv();
        } else if (credentialsChanged) {
          session.connectToDeriv();
        }
        if (newConf.analysisMode !== undefined) {
          session.config.analysisMode = newConf.analysisMode;
          session.addLog("info", `🔄 Analysis Mode switched to: ${session.config.analysisMode} (WS)`);
        }
        if (newConf.lockedPredictionDigit !== undefined) session.config.lockedPredictionDigit = newConf.lockedPredictionDigit;
        if (newConf.lockedTriggerDigit !== undefined) session.config.lockedTriggerDigit = newConf.lockedTriggerDigit;
        if (newConf.useLockedPair !== undefined) session.config.useLockedPair = newConf.useLockedPair;

        if (newConf.takeProfitEnabled !== undefined) session.config.takeProfitEnabled = !!newConf.takeProfitEnabled;
        if (newConf.takeProfitAmount !== undefined) session.config.takeProfitAmount = parseFloat(newConf.takeProfitAmount);
        if (newConf.stopLossEnabled !== undefined) session.config.stopLossEnabled = !!newConf.stopLossEnabled;
        if (newConf.stopLossAmount !== undefined) session.config.stopLossAmount = parseFloat(newConf.stopLossAmount);
        if (newConf.maxStakeEnabled !== undefined) session.config.maxStakeEnabled = !!newConf.maxStakeEnabled;
        if (newConf.maxStakeAmount !== undefined) session.config.maxStakeAmount = parseFloat(newConf.maxStakeAmount);
        if (newConf.martingaleActionOnMax !== undefined) session.config.martingaleActionOnMax = newConf.martingaleActionOnMax;
        if (newConf.consecutiveLossLimitEnabled !== undefined) session.config.consecutiveLossLimitEnabled = !!newConf.consecutiveLossLimitEnabled;
        if (newConf.consecutiveLossLimitAmount !== undefined) session.config.consecutiveLossLimitAmount = parseInt(newConf.consecutiveLossLimitAmount, 10);

        session.broadcastSummary();
        session.saveState();
      }
    } catch (err) {
      console.error(`[${session.id}] WS Message Error:`, err);
    }
  });
});

// Self-ping keep-alive: prevents free-tier hosts (e.g. Render) from spinning
// down the service due to inactivity. Only runs in production, and only if
// APP_URL is set.
function startKeepAlivePing() {
  const appUrl = process.env.APP_URL;
  if (process.env.NODE_ENV !== "production" || !appUrl) return;

  const PING_INTERVAL_MS = 10 * 60 * 1000;

  setInterval(() => {
    const target = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
    fetch(target)
      .then((res) => console.log(`[keep-alive] Self-ping ${target} -> ${res.status}`))
      .catch((err) => console.error(`[keep-alive] Self-ping failed: ${err.message}`));
  }, PING_INTERVAL_MS);

  console.log(`[keep-alive] Self-ping enabled for ${appUrl} every ${PING_INTERVAL_MS / 60000} minutes.`);
}

// Handle serving SPA in production
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*all", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  import("vite").then(async ({ createServer: createViteServer }) => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  });
}

if (!BOT_TOKEN) {
  console.warn("[auth] TELEGRAM_BOT_TOKEN is not set. Running in DEV MODE: sessions are keyed by unverified client-supplied userId. Set TELEGRAM_BOT_TOKEN before sharing this app with real users.");
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Finance server running on http://localhost:${PORT}`);
  startKeepAlivePing();
});
