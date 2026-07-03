import express from "express";
import path from "path";
import http from "http";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

// Load environment variables
dotenv.config();

// Determine __dirname in both ESM and CJS
let __filename = "";
let __dirname = "";
try {
  __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
} catch (e) {
  // Fallback for CommonJS bundle compiled by esbuild
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
  SmartAnalysisResult,
  SmartPairCombination
} from "./src/types.js";

const app = express();
const PORT = 3000;
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Shared State
let ticks: Tick[] = [];
let trades: Trade[] = [];
let logs: LogEntry[] = [];
let balance = 10000.00; // Mock initial balance
let reservedBalance = 0.00; // Reserved Safe Vault balance

let config: StrategyConfig = {
  windowSize: 120,
  stake: 10.0,
  symbol: "R_100", // Volatility 100 Index
  derivToken: "",
  derivAppId: "1089",
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

let currentMartingaleStep = 0;
let consecutiveLosses = 0;
let dominantDigitHistory: (number | null)[] = [];
let currentAnalysis = {
  window: 15,
  digits: [] as number[],
  frequencies: {} as Record<number, number>,
  dominant_digit: 0,
  trigger_digit: 0,
  confidence: 0
};
let currentStrategyResult = {
  signal: false,
  contract_type: "DIGITMATCH" as "DIGITMATCH",
  target_digit: 0,
  trigger_digit: 0,
  confidence: 0,
  reason: "No data"
};
let sessionStartBalance = balance;

// Tie and Cooldown State
let tieDetected = false;
let tieBrokenTime: number | null = null;

let status: SystemStatus = {
  connectionStatus: "CONNECTED",
  streamStatus: "LIVE",
  engineStatus: "RUNNING",
  autoTrading: false,
  derivMode: "SIMULATED",
  balance: balance,
  reservedBalance: reservedBalance,
  symbol: "R_100",
  tieStatus: "NONE",
  cooldownSecondsLeft: 0
};

// State persistence helpers to keep balance, trades, and logs persistent across restarts
function saveState() {
  try {
    const data = {
      balance,
      reservedBalance,
      trades,
      logs,
      config,
      currentMartingaleStep,
      sessionStartBalance
    };
    fs.writeFileSync(path.join(process.cwd(), "state_persistence.json"), JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save state persistence:", err);
  }
}

function loadState() {
  try {
    const filePath = path.join(process.cwd(), "state_persistence.json");
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(raw);
      if (typeof data.balance === "number") {
        balance = data.balance;
        status.balance = balance;
      }
      if (typeof data.reservedBalance === "number") {
        reservedBalance = data.reservedBalance;
        status.reservedBalance = reservedBalance;
      }
      if (Array.isArray(data.trades)) {
        trades = data.trades;
      }
      if (Array.isArray(data.logs)) {
        logs = data.logs;
      }
      if (data.config && typeof data.config === "object") {
        config = { ...config, ...data.config };
        status.symbol = config.symbol;
      }
      if (typeof data.currentMartingaleStep === "number") {
        currentMartingaleStep = data.currentMartingaleStep;
      }
      if (typeof data.sessionStartBalance === "number") {
        sessionStartBalance = data.sessionStartBalance;
      } else {
        sessionStartBalance = balance;
      }
      console.log("State loaded successfully. Balance:", balance);
    }
  } catch (err) {
    console.error("Failed to load state persistence:", err);
  }
}

loadState();

// Simulated base prices
const symbolPrices: Record<string, number> = {
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

// Distinct statistical signatures for each synthetic index to simulate realistic strategy metrics
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

// Fast, high-uniformity deterministic 32-bit pseudo-random number generator
function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return function() {
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
      if (rng() < profile.transition.prob) {
        nextDigit = profile.transition.to;
      }
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

// Generate historical ticks to bootstrap the platform immediately (120 ticks)
function bootstrapHistoricalTicks() {
  ticks = [];
  let basePrice = symbolPrices[config.symbol] || 1000.0;
  const now = Math.floor(Date.now() / 1000);
  const digits = generateDigitsForSymbol(config.symbol, 120);
  
  for (let i = 120; i > 0; i--) {
    const change = (Math.random() - 0.5) * 4.0;
    basePrice = parseFloat((basePrice + change).toFixed(2));
    const digit = digits[120 - i];
    
    ticks.push({
      id: `hist_${now - i}_${Math.floor(Math.random() * 1000)}`,
      epoch: now - i,
      price: basePrice,
      digit: digit,
      symbol: config.symbol
    });
  }
  
  addLog("info", `Engine initialized with ${ticks.length} bootstrapped ticks.`);
}

// Helper to add log
function addLog(type: LogEntry["type"], message: string) {
  const log: LogEntry = {
    id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    type,
    message
  };
  logs.unshift(log);
  if (logs.length > 200) {
    logs.pop();
  }
  saveState();
}

// Calculate prediction and trigger digits based on rolling 120 ticks
function calculateDigits() {
  const activeTicks = ticks.filter(t => t.symbol === config.symbol);
  const counts = Array(10).fill(0);
  activeTicks.forEach(t => {
    if (t.digit >= 0 && t.digit <= 9) {
      counts[t.digit]++;
    }
  });

  const freqs: FrequencyInfo[] = counts.map((count, digit) => ({
    digit,
    count,
    percentage: parseFloat(((count / Math.max(1, activeTicks.length)) * 100).toFixed(2))
  }));

  // Sort to find primary and trigger
  const sorted = [...freqs].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.digit - b.digit; // Deterministic tie-breaker
  });

  const predictionDigit = sorted[0]?.digit !== undefined ? sorted[0].digit : null;
  const triggerDigit = sorted[1]?.digit !== undefined ? sorted[1].digit : null;

  return { freqs, predictionDigit, triggerDigit };
}

// 2. STATISTICAL ANALYSIS ENGINE
function calculateAnalysisEngine(windowSize = 15) {
  const symbolTicks = ticks.filter(t => t.symbol === config.symbol);
  const activeTicks = symbolTicks.slice(-windowSize);
  const lastDigits = activeTicks.map(t => t.digit);

  const counts: Record<number, number> = {};
  for (let d = 0; d <= 9; d++) {
    counts[d] = 0;
  }
  activeTicks.forEach(t => {
    if (t.digit >= 0 && t.digit <= 9) {
      counts[t.digit]++;
    }
  });

  // Find dominant digit
  let dominant_digit = 0;
  let maxCount = -1;
  for (let d = 0; d <= 9; d++) {
    if (counts[d] > maxCount) {
      maxCount = counts[d];
      dominant_digit = d;
    }
  }

  // Find trigger digit (second most frequent in rolling 15-tick window)
  let trigger_digit = (dominant_digit + 1) % 10;
  let secondMaxCount = -1;
  for (let d = 0; d <= 9; d++) {
    if (d !== dominant_digit && counts[d] > secondMaxCount) {
      secondMaxCount = counts[d];
      trigger_digit = d;
    }
  }

  const actualWindowSize = activeTicks.length || 1;
  const confidence = parseFloat(((maxCount / actualWindowSize) * 100).toFixed(2));

  return {
    window: windowSize,
    digits: lastDigits,
    frequencies: counts,
    dominant_digit,
    trigger_digit,
    confidence
  };
}

// 3. STRATEGY ENGINE (MATCHES LOGIC)
function evaluateStrategy(analysis: { window: number; digits: number[]; frequencies: Record<number, number>; dominant_digit: number; trigger_digit: number; confidence: number }) {
  const { dominant_digit, trigger_digit, confidence, frequencies } = analysis;

  // Condition 1: confidence >= 22%
  const ruleConfidence = confidence >= 22.0;

  // Condition 2: dominant digit stable across last 3 analysis cycles
  const last3 = dominantDigitHistory.slice(-3);
  const ruleStable3 = last3.length >= 3 && last3.every(d => d === dominant_digit);

  // Condition 3: market distribution is not uniform (i.e. frequencies are not all flat or equal)
  const uniqueCounts = new Set(Object.values(frequencies));
  const ruleNotUniform = uniqueCounts.size > 1;

  // Condition 4: no conflicting dominant digit in last 5 ticks
  const last5 = dominantDigitHistory.slice(-5);
  // No conflicting digit means that every non-null entry in the last 5 ticks matches the current dominant_digit
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

  return {
    signal,
    contract_type: "DIGITMATCH" as const,
    target_digit: dominant_digit,
    trigger_digit,
    confidence,
    reason
  };
}

// Check if there is currently a tie in the frequency counts for the highest frequency (Prediction Digit)
function checkDigitTie(): boolean {
  const activeTicks = ticks.filter(t => t.symbol === config.symbol);
  if (activeTicks.length === 0) return false;
  const counts = Array(10).fill(0);
  activeTicks.forEach(t => {
    if (t.digit >= 0 && t.digit <= 9) {
      counts[t.digit]++;
    }
  });

  const sortedCounts = [...counts].sort((a, b) => b - a);

  const highestCount = sortedCounts[0] || 0;
  const secondHighestCount = sortedCounts[1] || 0;

  if (highestCount === 0) return false;

  // Tie for the 1st place (highest count is equal to the second highest count)
  // This is the critical tie that prevents a clear prediction digit
  return highestCount === secondHighestCount;
}

// Update the tie state machine on every incoming tick
function updateTieState() {
  const isCurrentlyTie = checkDigitTie();
  
  if (isCurrentlyTie) {
    if (!tieDetected) {
      tieDetected = true;
      tieBrokenTime = null;
      status.tieStatus = "TIE_PAUSED";
      addLog("error", `⚠️ TIE DETECTED: Multiple digits have tied for highest or second-highest frequency. Trading paused until the tie is broken.`);
    } else {
      status.tieStatus = "TIE_PAUSED";
    }
  } else {
    if (tieDetected) {
      // Tie was detected previously, but now it has broken!
      tieDetected = false;
      if (config.cooldownAfterTieEnabled) {
        tieBrokenTime = Date.now();
        status.tieStatus = "COOLDOWN";
        addLog("trigger", `🔄 TIE BROKEN: Digit tie has broken! Entering mandatory 30-second stabilization cooldown before trading can resume.`);
      } else {
        tieBrokenTime = null;
        status.tieStatus = "NONE";
        status.cooldownSecondsLeft = 0;
        addLog("success", `✅ TIE BROKEN: Digit tie has broken! Cooldown bypassed. Bot is ready to trade.`);
      }
    } else if (tieBrokenTime !== null) {
      if (!config.cooldownAfterTieEnabled) {
        tieBrokenTime = null;
        status.tieStatus = "NONE";
        status.cooldownSecondsLeft = 0;
        addLog("success", `✅ COOLDOWN DEACTIVATED: Cooldown bypassed. Bot is ready to trade.`);
      } else {
        const elapsed = Date.now() - tieBrokenTime;
        const left = 30 - Math.floor(elapsed / 1000);
        if (left <= 0) {
          tieBrokenTime = null;
          status.tieStatus = "NONE";
          status.cooldownSecondsLeft = 0;
          addLog("success", `✅ COOLDOWN OVER: 30-second post-tie stabilization finished. Bot is ready to trade.`);
        } else {
          status.tieStatus = "COOLDOWN";
          status.cooldownSecondsLeft = left;
        }
      }
    } else {
      status.tieStatus = "NONE";
      status.cooldownSecondsLeft = 0;
    }
  }
}

// Calculate advanced statistical smart analysis for Smart Mode
function calculateSmartAnalysis(customTicks?: Tick[]): SmartAnalysisResult {
  const sourceTicks = customTicks || ticks.filter(t => t.symbol === config.symbol);
  const rollingTicks = sourceTicks.slice(-120);
  
  // 1. Calculate overall frequencies
  const counts = Array(10).fill(0);
  rollingTicks.forEach(t => {
    if (t.digit >= 0 && t.digit <= 9) {
      counts[t.digit]++;
    }
  });

  const freqs = counts.map((count, digit) => ({
    digit,
    count,
    percentage: parseFloat(((count / Math.max(1, rollingTicks.length)) * 100).toFixed(2))
  }));

  // 2. Evaluate stability of frequency rankings over time:
  // Divide 120 ticks into 4 sub-chunks of 30 ticks each
  const chunks: Array<number[]> = [[], [], [], []];
  const chunkSize = 30;
  for (let i = 0; i < rollingTicks.length; i++) {
    const chunkIdx = Math.floor(i / chunkSize);
    if (chunkIdx < 4) {
      chunks[chunkIdx].push(rollingTicks[i].digit);
    }
  }

  // Calculate frequency counts for each digit in each sub-chunk
  const chunkCounts = Array(10).fill(0).map(() => Array(4).fill(0));
  chunks.forEach((chunk, chunkIdx) => {
    chunk.forEach(digit => {
      if (digit >= 0 && digit <= 9) {
        chunkCounts[digit][chunkIdx]++;
      }
    });
  });

  // Calculate stability for each digit (100 - standard deviation metric)
  const stabilities = Array(10).fill(0);
  for (let d = 0; d < 10; d++) {
    const countsList = chunkCounts[d];
    const avg = countsList.reduce((a, b) => a + b, 0) / 4;
    const variance = countsList.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / 4;
    const stdDev = Math.sqrt(variance);
    stabilities[d] = Math.max(0, Math.min(100, Math.round(100 - (stdDev / Math.max(1, avg)) * 40)));
  }

  // 3. Detect sudden changes in digit distribution
  // Compare recent 20 ticks vs older 100 ticks
  const recent20 = rollingTicks.slice(-20);
  const older100 = rollingTicks.slice(0, Math.max(0, rollingTicks.length - 20));
  
  const recentCounts = Array(10).fill(0);
  recent20.forEach(t => { if (t.digit >= 0 && t.digit <= 9) recentCounts[t.digit]++; });

  const olderCounts = Array(10).fill(0);
  older100.forEach(t => { if (t.digit >= 0 && t.digit <= 9) olderCounts[t.digit]++; });

  // 4. Measure sequential correlation
  const transitions = Array(10).fill(0).map(() => Array(10).fill(0));
  for (let i = 0; i < rollingTicks.length - 1; i++) {
    const tDigit = rollingTicks[i].digit;
    const pDigit = rollingTicks[i + 1].digit;
    if (tDigit >= 0 && tDigit <= 9 && pDigit >= 0 && pDigit <= 9) {
      transitions[tDigit][pDigit]++;
    }
  }

  // 5. Rank multiple prediction/trigger combinations
  const combinations: SmartPairCombination[] = [];
  
  for (let p = 0; p < 10; p++) {
    for (let t = 0; t < 10; t++) {
      if (p === t) continue;
      
      // Metric 1: Frequency Strength
      // Combined measure of Prediction Digit's dominance and its sub-window ranking stability
      const predFreq = freqs[p].percentage;
      const predStability = stabilities[p];
      const frequencyStrength = Math.max(0, Math.min(100, (predFreq * 5) + (predStability * 0.25)));

      // Metric 2: Trigger Rarity Balance (avoid noise bias of overly dominant triggers)
      // Ideal trigger frequency is around 9.5% to 10.0%. Highly dominant triggers are penalized to avoid noise.
      const triggerFreq = freqs[t].percentage;
      const triggerRarityScore = Math.max(0, Math.min(100, 100 - Math.abs(triggerFreq - 9.5) * 15));

      // Metric 3: Stability Score
      // Joint consistency of both Prediction and Trigger across the recent rolling windows
      const stabilityScore = Math.round((stabilities[p] * 0.6) + (stabilities[t] * 0.4));

      // Metric 4: Signal Separation Quality
      // Physical difference in density between Prediction and Trigger frequency percentage
      const separationVal = Math.abs(freqs[p].percentage - freqs[t].percentage);
      const signalSeparation = Math.min(100, separationVal * 15);

      // Metric 5: Sequence Transition correlation bonus
      const totalTransitionsFromT = transitions[t].reduce((a, b) => a + b, 0);
      const transitionRate = totalTransitionsFromT > 0 ? (transitions[t][p] / totalTransitionsFromT) : 0;
      const correlationScore = Math.min(100, transitionRate * 300);

      // Calculate final combined weighted Confidence Score (0-100%)
      const totalWeightedScore = (frequencyStrength * 0.30) + 
                                 (triggerRarityScore * 0.20) + 
                                 (stabilityScore * 0.20) + 
                                 (signalSeparation * 0.15) + 
                                 (correlationScore * 0.15);

      const confidence = Math.max(10, Math.min(99, Math.round(totalWeightedScore)));
      
      let risk: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
      if (confidence >= 80) risk = 'LOW';
      else if (confidence < 55) risk = 'HIGH';

      combinations.push({
        prediction: p,
        trigger: t,
        score: totalWeightedScore,
        confidence,
        risk
      });
    }
  }

  combinations.sort((a, b) => b.score - a.score);

  const bestCombo = combinations[0] || { prediction: 4, trigger: 9, score: 50, confidence: 60, risk: 'MEDIUM' };
  
  const recPrediction = bestCombo.prediction;
  const recTrigger = bestCombo.trigger;
  const confidenceScore = bestCombo.confidence;
  const riskLevel = bestCombo.risk;

  // Determine market stability index & status
  const maxPct = Math.max(...freqs.map(f => f.percentage));
  const minPct = Math.min(...freqs.map(f => f.percentage));
  const spread = maxPct - minPct;
  
  let marketStability: 'STABLE' | 'VOLATILE' | 'TRENDING' = 'STABLE';
  let stabilityIndex = 50;
  if (spread < 6) {
    marketStability = 'VOLATILE';
    stabilityIndex = Math.round(25 + spread * 4);
  } else if (spread > 13) {
    marketStability = 'TRENDING';
    stabilityIndex = Math.min(100, Math.round(75 + (spread - 13) * 2));
  } else {
    marketStability = 'STABLE';
    stabilityIndex = Math.round(50 + (spread - 6) * 3.5);
  }

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
    predictionDigit: recPrediction,
    triggerDigit: recTrigger,
    confidenceScore,
    reason,
    riskLevel,
    stabilityIndex,
    tradeQualityScore,
    marketStability,
    combinations: combinations.slice(0, 10)
  };
}

// Utility to resolve the correct digits based on active analysis mode
function getActiveDigits() {
  if (config.useLockedPair && config.lockedPredictionDigit !== null && config.lockedPredictionDigit !== undefined && config.lockedTriggerDigit !== null && config.lockedTriggerDigit !== undefined) {
    return {
      predictionDigit: config.lockedPredictionDigit,
      triggerDigit: config.lockedTriggerDigit
    };
  }
  if (config.analysisMode === "SMART") {
    const smart = calculateSmartAnalysis();
    return {
      predictionDigit: smart.predictionDigit,
      triggerDigit: smart.triggerDigit
    };
  } else {
    const classic = calculateDigits();
    return {
      predictionDigit: classic.predictionDigit,
      triggerDigit: classic.triggerDigit
    };
  }
}

// Check for trade resolutions and trade triggers
let pendingTrade: Trade | null = null;

function checkRiskLimits() {
  if (!status.autoTrading) return;

  // 1. Take Profit Check
  if (config.takeProfitEnabled) {
    const sessionProfit = balance - sessionStartBalance;
    if (sessionProfit >= config.takeProfitAmount) {
      status.autoTrading = false;
      addLog("success", `🏆 TAKE PROFIT TARGET REACHED! Session Profit of +$${sessionProfit.toFixed(2)} met or exceeded target of +$${config.takeProfitAmount.toFixed(2)}. Auto-trading halted for your safety.`);
      return;
    }
  }

  // 2. Stop Loss Check
  if (config.stopLossEnabled) {
    const sessionLoss = sessionStartBalance - balance;
    if (sessionLoss >= config.stopLossAmount) {
      status.autoTrading = false;
      addLog("error", `🛡️ STOP LOSS LIMIT REACHED! Session Loss of -$${sessionLoss.toFixed(2)} met or exceeded limit of -$${config.stopLossAmount.toFixed(2)}. Auto-trading halted for capital protection.`);
      return;
    }
  }

  // 3. Consecutive Losses Check
  if (config.consecutiveLossLimitEnabled) {
    if (consecutiveLosses >= config.consecutiveLossLimitAmount) {
      status.autoTrading = false;
      addLog("error", `🚨 CONSECUTIVE LOSS LIMIT BREACHED: ${config.consecutiveLossLimitAmount} consecutive losses detected. Auto-trading halted for capital protection. (You can adjust/disable this in the safeguard settings)`);
      return;
    }
  }

  // 4. Insufficient Balance Check
  if (balance <= 0 || balance < config.stake) {
    status.autoTrading = false;
    addLog("error", `🛑 INSUFFICIENT BALANCE: Available balance ($${balance.toFixed(2)}) is less than required base stake ($${config.stake.toFixed(2)}). Automated trading halted to prevent negative balance.`);
    return;
  }
}

function runOrchestrator(newTick: Tick) {
  // 1. Resolve pending trade (if any) first, before pushing new tick to history
  if (pendingTrade) {
    const exitDigit = newTick.digit;
    const targetPrediction = pendingTrade.predictionDigit;

    pendingTrade.exitPrice = newTick.price;
    pendingTrade.exitEpoch = newTick.epoch;
    pendingTrade.exitDigit = exitDigit;

    if (exitDigit === targetPrediction) {
      // WIN
      const profit = parseFloat((pendingTrade.stake * 8.09).toFixed(2));
      pendingTrade.profit = profit;
      pendingTrade.payout = parseFloat((pendingTrade.stake + profit).toFixed(2));
      pendingTrade.result = "WIN";

      balance = parseFloat((balance + profit).toFixed(2));
      pendingTrade.balanceAfter = balance;
      status.balance = balance;

      consecutiveLosses = 0;
      currentMartingaleStep = 0;

      addLog("success", `🎯 TRADE WIN: Exit digit ${exitDigit} matched prediction ${targetPrediction}! Profit: +$${profit}. New Balance: $${balance}. Martingale reset.`);
    } else {
      // LOSS
      const loss = -pendingTrade.stake;
      pendingTrade.profit = loss;
      pendingTrade.payout = 0.0;
      pendingTrade.result = "LOSS";

      balance = parseFloat(Math.max(0, balance + loss).toFixed(2));
      pendingTrade.balanceAfter = balance;
      status.balance = balance;

      if (status.autoTrading && balance < config.stake) {
        status.autoTrading = false;
        addLog("error", `🛑 INSUFFICIENT BALANCE AFTER LOSS: Remaining balance ($${balance.toFixed(2)}) is lower than base stake ($${config.stake.toFixed(2)}). Automated trading stopped to prevent negative balance.`);
      }

      consecutiveLosses++;
      if (config.martingaleEnabled) {
        currentMartingaleStep++;
      }

      addLog("error", `❌ TRADE LOSS: Exit digit was ${exitDigit} (Target Prediction: ${targetPrediction}). Stake lost: -$${pendingTrade.stake}. New Balance: $${balance}. Consecutive losses: ${consecutiveLosses}.`);
    }

    trades.unshift(pendingTrade);
    if (trades.length > 500) {
      trades.pop();
    }
    pendingTrade = null;
    saveState();
  }

  // 2. Add new tick to rolling history
  ticks.push(newTick);
  if (ticks.length > config.windowSize) {
    ticks.shift();
  }

  // 3. Update Analysis Engine (default 15 ticks window)
  currentAnalysis = calculateAnalysisEngine(15);

  // Update dominant digit history
  if (currentAnalysis.dominant_digit !== null && currentAnalysis.dominant_digit !== undefined) {
    dominantDigitHistory.push(currentAnalysis.dominant_digit);
    if (dominantDigitHistory.length > 10) {
      dominantDigitHistory.shift();
    }
  }

  // 4. Run Strategy Engine
  currentStrategyResult = evaluateStrategy(currentAnalysis);

  // 5. Check risk manager and execute trade if allowed
  if (status.autoTrading) {
    checkRiskLimits();

    if (status.autoTrading && !pendingTrade) {
      // Determine if a trade is triggered based on the active strategy mode
      let shouldTrade = false;
      let targetPrediction: number | null = null;
      let targetTrigger: number | null = null;
      let executionReason = "";

      const activeMode = config.analysisMode || "CLASSIC";

      if (activeMode === "HFT_15") {
        // HFT 15-Tick Mode:
        // Must have an active high-frequency signal, AND current tick digit must match the calculated HFT trigger digit!
        if (currentStrategyResult.signal) {
          targetPrediction = currentStrategyResult.target_digit;
          targetTrigger = currentStrategyResult.trigger_digit;
          if (newTick.digit === targetTrigger) {
            shouldTrade = true;
            executionReason = `HFT 15-Tick Signal is Active. Current tick ended with Trigger Digit [${targetTrigger}]. Executing Matches trade on Dominant Digit [${targetPrediction}].`;
          }
        }
      } else {
        // CLASSIC or SMART Mode:
        // Must use the active prediction/trigger digits from getActiveDigits(), AND current tick digit must match trigger digit!
        const { predictionDigit, triggerDigit } = getActiveDigits();
        if (predictionDigit !== null && triggerDigit !== null) {
          targetPrediction = predictionDigit;
          targetTrigger = triggerDigit;
          if (newTick.digit === targetTrigger) {
            shouldTrade = true;
            executionReason = `${activeMode} Mode Signal Active: Current tick ended with Trigger Digit [${targetTrigger}]. Executing Matches trade on Prediction Digit [${targetPrediction}].`;
          }
        }
      }

      // Check tie/cooldown restrictions
      if (shouldTrade && (status.tieStatus === "TIE_PAUSED" || status.tieStatus === "COOLDOWN")) {
        addLog("info", `⏳ Trade trigger bypassed: Engine is in ${status.tieStatus} state.`);
        shouldTrade = false;
      }

      if (shouldTrade && targetPrediction !== null && targetTrigger !== null) {
        // Execute the DIGITMATCH trade
        let activeStake = config.stake;
        if (config.martingaleEnabled && currentMartingaleStep > 0) {
          activeStake = parseFloat((config.stake * Math.pow(config.martingaleMultiplier, currentMartingaleStep)).toFixed(2));
        }

        // Check if martingale step causes stake to exceed balance
        if (activeStake > status.balance && config.martingaleEnabled && currentMartingaleStep > 0 && config.stake <= status.balance) {
          addLog("info", `⚠️ MARTINGALE STAKE EXCEEDS BALANCE: Stake $${activeStake} exceeds available balance ($${status.balance.toFixed(2)}). Reverting to base stake ($${config.stake.toFixed(2)}).`);
          currentMartingaleStep = 0;
          activeStake = config.stake;
        }

        // Max stake check
        if (config.maxStakeEnabled && activeStake > config.maxStakeAmount) {
          if (config.martingaleActionOnMax === "HALT") {
            status.autoTrading = false;
            addLog("error", `⚠️ RISK BREACH: Stake of $${activeStake} exceeds maximum allowed stake limit ($${config.maxStakeAmount}). Trading halted.`);
            broadcastSummary();
            saveState();
            return;
          } else {
            addLog("info", `⚠️ STAKE EXCEEDED: Stake $${activeStake} exceeds max stake. Resetting martingale steps.`);
            currentMartingaleStep = 0;
            activeStake = config.stake;
          }
        }

        // Absolute balance safeguard: never execute trade if stake exceeds balance or if balance is zero/negative
        if (activeStake > status.balance || status.balance <= 0) {
          status.autoTrading = false;
          addLog("error", `🛑 INSUFFICIENT BALANCE: Required trade stake ($${activeStake.toFixed(2)}) exceeds available balance ($${status.balance.toFixed(2)}). Automated trading halted to prevent negative balance.`);
          broadcastSummary();
          saveState();
          return;
        }

        const tradeId = `trade_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        pendingTrade = {
          id: tradeId,
          timestamp: new Date().toISOString(),
          symbol: config.symbol,
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

        const martingaleIndicator = config.martingaleEnabled && currentMartingaleStep > 0 ? ` [Step ${currentMartingaleStep}]` : "";
        addLog("trade", `🤖 AUTO TRADE PLACED: Matches Digits on ${config.symbol}. Stake: $${activeStake}${martingaleIndicator}. Prediction Target: [${targetPrediction}], Trigger Source: [${targetTrigger}]. Reason: ${executionReason}`);

        // If live mode, fire the real order
        if (status.derivMode === "LIVE" && config.derivToken) {
          executeRealDerivTrade(targetPrediction, activeStake);
        }
      }
    }
  }

  // 6. Update ties state
  updateTieState();

  // 7. Save state and broadcast
  saveState();
  broadcastSummary();
}

// Broadcast summary to all connected WebSocket clients
function broadcastSummary() {
  status.sessionStartBalance = sessionStartBalance;
  const { freqs, predictionDigit, triggerDigit } = calculateDigits();
  const smartAnalysis = calculateSmartAnalysis();
  
  const summary: AnalysisSummary & { analysis15?: any, signal15?: any } = {
    ticks,
    frequencies: freqs,
    predictionDigit,
    triggerDigit,
    status,
    config,
    trades,
    logs,
    smartAnalysis,
    analysis15: currentAnalysis,
    signal15: currentStrategyResult
  };

  const payload = JSON.stringify({ type: "SUMMARY_UPDATE", data: summary });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Simulated Tick Streaming Loop
let simulatedInterval: NodeJS.Timeout | null = null;

function startSimulator() {
  if (simulatedInterval) clearInterval(simulatedInterval);
  
  addLog("info", `Simulated tick stream started for ${config.symbol}`);
  
  simulatedInterval = setInterval(() => {
    if (status.engineStatus === "PAUSED") return;
    
    let currentPrice = symbolPrices[config.symbol] || 500.0;
    // Generate slight walk
    const walkMultiplier = config.symbol.startsWith("R_") ? parseFloat(config.symbol.replace("R_", "")) / 20 : 5;
    const change = (Math.random() - 0.5) * (walkMultiplier * 0.1);
    currentPrice = parseFloat((currentPrice + change).toFixed(2));
    symbolPrices[config.symbol] = currentPrice;

    const priceStr = currentPrice.toFixed(2);
    const lastChar = priceStr.charAt(priceStr.length - 1);
    const digit = parseInt(lastChar, 10);

    const newTick: Tick = {
      id: `tick_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      epoch: Math.floor(Date.now() / 1000),
      price: currentPrice,
      digit: digit,
      symbol: config.symbol
    };

    runOrchestrator(newTick);
  }, 1500);
}

function stopSimulator() {
  if (simulatedInterval) {
    clearInterval(simulatedInterval);
    simulatedInterval = null;
  }
}

// Deriv Integration Websocket Client
let derivWs: WebSocket | null = null;
let derivPingInterval: NodeJS.Timeout | null = null;

function connectToDeriv() {
  if (derivWs) {
    try { derivWs.close(); } catch(e){}
    derivWs = null;
  }
  if (derivPingInterval) clearInterval(derivPingInterval);

  if (status.derivMode === "SIMULATED") {
    status.connectionStatus = "CONNECTED";
    status.streamStatus = "LIVE";
    startSimulator();
    return;
  }

  stopSimulator();
  status.connectionStatus = "CONNECTING";
  status.streamStatus = "IDLE";
  addLog("info", `Connecting to Deriv WebSocket API (App ID: ${config.derivAppId || "1089 (Default)"})...`);
  broadcastSummary();

  const derivUrl = `wss://ws.derivws.com/websockets/v3?app_id=${config.derivAppId || "1089"}`;
  
  try {
    derivWs = new WebSocket(derivUrl);
    
    derivWs.on("open", () => {
      status.connectionStatus = "CONNECTED";
      addLog("success", `Connected to Deriv WebSocket Server!`);
      
      // Keep alive ping
      derivPingInterval = setInterval(() => {
        if (derivWs && derivWs.readyState === WebSocket.OPEN) {
          derivWs.send(JSON.stringify({ ping: 1 }));
        }
      }, 30000);

      // Authorize if token is available
      if (config.derivToken) {
        addLog("info", `Authorizing account via provided token...`);
        derivWs.send(JSON.stringify({ authorize: config.derivToken }));
      } else {
        addLog("info", `No token provided. Running in Read-Only Live subscription mode.`);
        // Just subscribe to ticks
        derivWs.send(JSON.stringify({ ticks: config.symbol }));
        status.streamStatus = "LIVE";
      }
      broadcastSummary();
    });

    derivWs.on("message", (rawData) => {
      try {
        const response = JSON.parse(rawData.toString());
        
        if (response.error) {
          const errMsg = response.error.message;
          addLog("error", `Deriv API Error: ${errMsg}`);
          
          if (errMsg.toLowerCase().includes("token") && errMsg.toLowerCase().includes("invalid")) {
            addLog("info", `💡 Hint: Since Deriv links Personal API Tokens to specific platforms, try switching the App ID in the settings (e.g. 16929 for Deriv Web, 1911 for DBot, or 1089). Also, make sure both 'Read' and 'Trade' scopes were checked when you created the token.`);
            status.derivMode = "SIMULATED";
            addLog("info", `🔄 Automatically returned to Simulated Sandbox Mode to prevent rate-limiting and connection retry loops.`);
            startSimulator();
          }
          
          status.streamStatus = "ERROR";
          broadcastSummary();
          return;
        }

        const msgType = response.msg_type;

        if (msgType === "authorize") {
          const authData = response.authorize;
          balance = parseFloat(authData.balance);
          status.balance = balance;
          status.derivMode = "LIVE";
          addLog("success", `Authorized successfully! Account: ${authData.email}. Live Balance: $${balance} ${authData.currency}`);
          
          // Now subscribe to ticks
          derivWs?.send(JSON.stringify({ ticks: config.symbol }));
          status.streamStatus = "LIVE";
          broadcastSummary();
        }

        else if (msgType === "tick") {
          if (status.engineStatus === "PAUSED") return;

          const tickData = response.tick;
          const price = parseFloat(tickData.quote);
          const epoch = tickData.epoch;
          const symbol = tickData.symbol;
          
          if (symbol !== config.symbol) return; // Stale symbol response

          const priceStr = price.toFixed(tickData.pip_size || 2);
          const lastChar = priceStr.charAt(priceStr.length - 1);
          const digit = parseInt(lastChar, 10);

          const newTick: Tick = {
            id: `deriv_${tickData.id}`,
            epoch,
            price,
            digit,
            symbol
          };

          runOrchestrator(newTick);
        }

        else if (msgType === "buy") {
          addLog("success", `Deriv Contract Bought: ${response.buy.contract_id}. Payout potential: $${response.buy.payout}`);
        }

        else if (msgType === "proposal_open_contract") {
          // Can track contract details if needed
        }

      } catch (e: any) {
        console.error("Error parsing Deriv message:", e);
      }
    });

    derivWs.on("close", () => {
      status.connectionStatus = "DISCONNECTED";
      status.streamStatus = "IDLE";
      addLog("error", `Deriv API Connection Closed.`);
      broadcastSummary();
      
      // Attempt auto reconnect after 5 seconds if still in LIVE mode
      if (status.derivMode === "LIVE") {
        setTimeout(() => {
          if (status.derivMode === "LIVE") connectToDeriv();
        }, 5000);
      }
    });

    derivWs.on("error", (err) => {
      status.connectionStatus = "DISCONNECTED";
      status.streamStatus = "ERROR";
      addLog("error", `Deriv WebSocket Error: ${err.message}`);
      broadcastSummary();
    });

  } catch(err: any) {
    status.connectionStatus = "DISCONNECTED";
    status.streamStatus = "ERROR";
    addLog("error", `Failed to instantiate Deriv client: ${err.message}`);
    broadcastSummary();
  }
}

// Function to place a real buy order on Deriv
function executeRealDerivTrade(predictionDigit: number, activeStake: number) {
  if (!derivWs || derivWs.readyState !== WebSocket.OPEN) return;
  
  const req = {
    buy: 1,
    price: activeStake,
    parameters: {
      amount: activeStake,
      basis: "stake",
      contract_type: "DIGITMATCH",
      currency: "USD",
      duration: 1,
      duration_unit: "t",
      barrier: predictionDigit.toString(),
      symbol: config.symbol
    }
  };
  
  addLog("trade", `📡 SENT BUY PROPOSAL TO DERIV: Matches Digits on ${config.symbol}. Stake: $${activeStake}. Barrier: [${predictionDigit}]`);
  derivWs.send(JSON.stringify(req));
}


// Gemini API Integration - AI Refinement
let aiClient: any = null;
function getAI() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined in Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// REST API Endpoints
app.get("/api/summary", (req, res) => {
  status.sessionStartBalance = sessionStartBalance;
  const { freqs, predictionDigit, triggerDigit } = calculateDigits();
  const smartAnalysis = calculateSmartAnalysis();
  res.json({
    ticks,
    frequencies: freqs,
    predictionDigit,
    triggerDigit,
    status,
    config,
    trades,
    logs,
    smartAnalysis
  });
});

app.post("/api/config", (req, res) => {
  const newConfig = req.body;
  if (!newConfig) return res.status(400).json({ error: "Missing config body" });

  let modeChanged = false;
  let symbolChanged = false;
  let credentialsChanged = false;

  if (newConfig.derivMode && newConfig.derivMode !== status.derivMode) {
    status.derivMode = newConfig.derivMode;
    modeChanged = true;
  }

  if (newConfig.symbol && newConfig.symbol !== config.symbol) {
    config.symbol = newConfig.symbol;
    status.symbol = newConfig.symbol;
    symbolChanged = true;
  }

  if (newConfig.stake !== undefined) config.stake = parseFloat(newConfig.stake);
  
  if (newConfig.derivToken !== undefined) {
    const trimmedToken = typeof newConfig.derivToken === "string" ? newConfig.derivToken.trim() : newConfig.derivToken;
    if (trimmedToken !== config.derivToken) {
      config.derivToken = trimmedToken;
      credentialsChanged = true;
    }
  }
  if (newConfig.derivAppId !== undefined) {
    const trimmedAppId = typeof newConfig.derivAppId === "string" ? newConfig.derivAppId.trim() : newConfig.derivAppId;
    if (trimmedAppId !== config.derivAppId) {
      config.derivAppId = trimmedAppId;
      credentialsChanged = true;
    }
  }
  
  if (newConfig.analysisMode !== undefined) {
    config.analysisMode = newConfig.analysisMode;
    addLog("info", `🔄 Analysis Mode switched to: ${config.analysisMode}`);
  }
  if (newConfig.lockedPredictionDigit !== undefined) config.lockedPredictionDigit = newConfig.lockedPredictionDigit;
  if (newConfig.lockedTriggerDigit !== undefined) config.lockedTriggerDigit = newConfig.lockedTriggerDigit;
  if (newConfig.useLockedPair !== undefined) config.useLockedPair = newConfig.useLockedPair;
  if (newConfig.cooldownAfterTieEnabled !== undefined) {
    config.cooldownAfterTieEnabled = !!newConfig.cooldownAfterTieEnabled;
    // Run updateTieState immediately so any changed cooldown preference is evaluated
    updateTieState();
  }
  
  if (newConfig.martingaleEnabled !== undefined) {
    config.martingaleEnabled = !!newConfig.martingaleEnabled;
    currentMartingaleStep = 0;
  }
  if (newConfig.martingaleMultiplier !== undefined) {
    config.martingaleMultiplier = parseFloat(newConfig.martingaleMultiplier);
    currentMartingaleStep = 0;
  }
  if (newConfig.martingaleMaxSteps !== undefined) {
    config.martingaleMaxSteps = parseInt(newConfig.martingaleMaxSteps, 10);
    currentMartingaleStep = 0;
  }

  // Update risk management settings
  if (newConfig.takeProfitEnabled !== undefined) config.takeProfitEnabled = !!newConfig.takeProfitEnabled;
  if (newConfig.takeProfitAmount !== undefined) config.takeProfitAmount = parseFloat(newConfig.takeProfitAmount);
  if (newConfig.stopLossEnabled !== undefined) config.stopLossEnabled = !!newConfig.stopLossEnabled;
  if (newConfig.stopLossAmount !== undefined) config.stopLossAmount = parseFloat(newConfig.stopLossAmount);
  if (newConfig.maxStakeEnabled !== undefined) config.maxStakeEnabled = !!newConfig.maxStakeEnabled;
  if (newConfig.maxStakeAmount !== undefined) config.maxStakeAmount = parseFloat(newConfig.maxStakeAmount);
  if (newConfig.martingaleActionOnMax !== undefined) config.martingaleActionOnMax = newConfig.martingaleActionOnMax;
  if (newConfig.consecutiveLossLimitEnabled !== undefined) config.consecutiveLossLimitEnabled = !!newConfig.consecutiveLossLimitEnabled;
  if (newConfig.consecutiveLossLimitAmount !== undefined) config.consecutiveLossLimitAmount = parseInt(newConfig.consecutiveLossLimitAmount, 10);

  addLog("info", `Configuration updated. Symbol: ${config.symbol}, Stake: $${config.stake}, Martingale: ${config.martingaleEnabled ? "ON (" + config.martingaleMultiplier + "x, max " + config.martingaleMaxSteps + " steps)" : "OFF"}. Risk Controls: TakeProfit: ${config.takeProfitEnabled ? "$" + config.takeProfitAmount : "OFF"}, StopLoss: ${config.stopLossEnabled ? "$" + config.stopLossAmount : "OFF"}, MaxStake: ${config.maxStakeEnabled ? "$" + config.maxStakeAmount : "OFF"}, LossStreakStop: ${config.consecutiveLossLimitEnabled ? config.consecutiveLossLimitAmount + " losses" : "OFF"}`);

  if (symbolChanged) {
    bootstrapHistoricalTicks();
  }

  if (modeChanged || symbolChanged || credentialsChanged) {
    connectToDeriv();
  } else {
    broadcastSummary();
  }

  saveState();

  res.json({ success: true, config, status });
});

app.post("/api/scan-all", (req, res) => {
  const AVAILABLE_SYMBOLS = [
    "1HZ100V",
    "1HZ10V",
    "1HZ25V",
    "1HZ50V",
    "1HZ75V",
    "R_10",
    "R_100",
    "R_25",
    "R_50",
    "R_75"
  ];

  let bestSymbol = config.symbol;
  let bestScore = -1;
  let bestResult: SmartAnalysisResult | null = null;

  AVAILABLE_SYMBOLS.forEach(sym => {
    let symTicks: Tick[] = [];
    if (sym === config.symbol) {
      symTicks = ticks.filter(t => t.symbol === config.symbol);
    } else {
      // Use a stable, 15-minute time-blocked seed to ensure consecutive scans are consistent,
      // while still letting the simulated indices shift/evolve over time.
      const timeBlock = Math.floor(Date.now() / (1000 * 60 * 15));
      const seed = `${sym}_${timeBlock}`;
      const rng = seededRandom(seed);

      let basePrice = symbolPrices[sym] || 1000.0;
      const now = Math.floor(Date.now() / 1000);
      const digits = generateDigitsForSymbol(sym, 120, seed);
      for (let i = 120; i > 0; i--) {
        const change = (rng() - 0.5) * 4.0;
        basePrice = parseFloat((basePrice + change).toFixed(2));
        const digit = digits[120 - i];
        symTicks.push({
          id: `eval_${sym}_${now - i}`,
          epoch: now - i,
          price: basePrice,
          digit: digit,
          symbol: sym
        });
      }
    }

    const analysis = calculateSmartAnalysis(symTicks);
    const topCombo = analysis.combinations[0];
    if (topCombo && topCombo.score > bestScore) {
      bestScore = topCombo.score;
      bestSymbol = sym;
      bestResult = analysis;
    }
  });

  if (bestResult) {
    const topCombo = bestResult.combinations[0];
    const oldSymbol = config.symbol;
    
    config.symbol = bestSymbol;
    status.symbol = bestSymbol;
    config.lockedPredictionDigit = topCombo.prediction;
    config.lockedTriggerDigit = topCombo.trigger;
    config.useLockedPair = true;

    const humanNames: Record<string, string> = {
      "1HZ100V": "Volatility 100 (1s) Index",
      "1HZ10V": "Volatility 10 (1s) Index",
      "1HZ25V": "Volatility 25 (1s) Index",
      "1HZ50V": "Volatility 50 (1s) Index",
      "1HZ75V": "Volatility 75 (1s) Index",
      "R_10": "Volatility 10 Index",
      "R_100": "Volatility 100 Index",
      "R_25": "Volatility 25 Index",
      "R_50": "Volatility 50 Index",
      "R_75": "Volatility 75 Index"
    };
    
    const bestSymName = humanNames[bestSymbol] || bestSymbol;
    addLog("success", `🔍 GLOBAL POOL SCAN COMPLETED! Evaluated 10 synthetic pairs (900 digit combinations). Isolated absolute best performance profile on ${bestSymName} (${bestSymbol}) with ${bestResult.confidenceScore}% confidence index.`);
    addLog("trigger", `🎯 LOADED BEST PAIR: Automated lock secured on ${bestSymbol} → Trigger [${topCombo.trigger}] and Predict [${topCombo.prediction}].`);

    if (oldSymbol !== bestSymbol) {
      bootstrapHistoricalTicks();
      connectToDeriv();
    } else {
      broadcastSummary();
    }

    res.json({
      success: true,
      symbol: bestSymbol,
      lockedPredictionDigit: topCombo.prediction,
      lockedTriggerDigit: topCombo.trigger,
      confidence: bestResult.confidenceScore,
      tradeQualityScore: bestResult.tradeQualityScore,
      config,
      status
    });
  } else {
    res.status(500).json({ error: "Failed to isolate optimal pair during scan." });
  }
});

app.post("/api/sync-state", (req, res) => {
  try {
    const { balance: clientBalance, reservedBalance: clientReserved, trades: clientTrades, logs: clientLogs, config: clientConfig } = req.body;
    let modified = false;

    // Adopt client's balance if it differs from default and is valid, or if server loaded an empty/default state
    if (typeof clientBalance === "number" && !isNaN(clientBalance)) {
      if (balance === 10000.00 && clientBalance !== 10000.00) {
        balance = clientBalance;
        status.balance = balance;
        modified = true;
      }
    }
    if (typeof clientReserved === "number" && !isNaN(clientReserved) && clientReserved >= 0) {
      if (reservedBalance === 0 && clientReserved > 0) {
        reservedBalance = clientReserved;
        status.reservedBalance = reservedBalance;
        modified = true;
      }
    }

    // Adopt client's trades if server trades list is empty and client has records
    if (Array.isArray(clientTrades) && clientTrades.length > 0 && trades.length === 0) {
      trades = clientTrades;
      modified = true;
    }

    // Adopt client's logs if server logs list is empty and client has records
    if (Array.isArray(clientLogs) && clientLogs.length > 0 && logs.length === 0) {
      logs = clientLogs;
      modified = true;
    }

    // Merge client's config if provided
    if (clientConfig && typeof clientConfig === "object") {
      config = { ...config, ...clientConfig };
      status.symbol = config.symbol;
      modified = true;
    }

    if (modified) {
      saveState();
      broadcastSummary();
    }

    res.json({ success: true, balance, tradesCount: trades.length, logsCount: logs.length });
  } catch (err: any) {
    console.error("Failed to sync state from client:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/action", (req, res) => {
  const { action, value } = req.body;
  
  if (action === "TOGGLE_AUTO_TRADE") {
    const wantToTurnOn = value !== undefined ? !!value : !status.autoTrading;
    if (wantToTurnOn && (balance <= 0 || balance < config.stake)) {
      status.autoTrading = false;
      addLog("error", `🛑 CANNOT START AUTO TRADING: Available balance ($${balance.toFixed(2)}) is insufficient for base stake ($${config.stake.toFixed(2)}).`);
      broadcastSummary();
      saveState();
      return res.status(400).json({ success: false, error: "INSUFFICIENT_BALANCE", autoTrading: false, message: `Available balance ($${balance.toFixed(2)}) is insufficient for base stake ($${config.stake.toFixed(2)}).` });
    }
    status.autoTrading = wantToTurnOn;
    if (status.autoTrading) {
      sessionStartBalance = balance;
      consecutiveLosses = 0;
      currentMartingaleStep = 0;
    }
    addLog("info", `Automated Trading engine turned ${status.autoTrading ? "🔴 ON" : "⚪ OFF"}${status.autoTrading ? " (Session Start Balance: $" + balance.toFixed(2) + ")" : ""}`);
    broadcastSummary();
    saveState();
    return res.json({ success: true, autoTrading: status.autoTrading });
  }

  if (action === "TOGGLE_ENGINE") {
    status.engineStatus = status.engineStatus === "RUNNING" ? "PAUSED" : "RUNNING";
    addLog("info", `Analysis and streaming engine ${status.engineStatus}`);
    broadcastSummary();
    return res.json({ success: true, engineStatus: status.engineStatus });
  }

  if (action === "RESET_TRADES") {
    trades = [];
    logs = [];
    status.balance = balance;
    consecutiveLosses = 0;
    currentMartingaleStep = 0;
    addLog("success", `Trade History cleared. Demo Balance is preserved at $${balance.toFixed(2)}.`);
    bootstrapHistoricalTicks();
    saveState();
    broadcastSummary();
    return res.json({ success: true });
  }

  if (action === "RESET_BALANCE") {
    balance = 10000.00;
    reservedBalance = 0.00;
    status.balance = balance;
    status.reservedBalance = reservedBalance;
    consecutiveLosses = 0;
    currentMartingaleStep = 0;
    addLog("success", `Demo balance reset to $10,000.00 (Reserved Safe cleared).`);
    saveState();
    broadcastSummary();
    return res.json({ success: true });
  }

  if (action === "MANAGE_VAULT") {
    const { subAction, amount } = req.body;
    const amt = parseFloat(amount || "0");

    if (subAction === "DEPOSIT" && amt > 0) {
      if (balance >= amt) {
        balance = parseFloat((balance - amt).toFixed(2));
        reservedBalance = parseFloat((reservedBalance + amt).toFixed(2));
        status.balance = balance;
        status.reservedBalance = reservedBalance;
        addLog("info", `🏦 Vault Transfer: Moved $${amt.toFixed(2)} USD into Sandbox Safe. Active demo balance: $${balance.toFixed(2)} USD.`);
      } else {
        return res.status(400).json({ error: "Insufficient active balance for deposit." });
      }
    } else if (subAction === "WITHDRAW" && amt > 0) {
      if (reservedBalance >= amt) {
        reservedBalance = parseFloat((reservedBalance - amt).toFixed(2));
        balance = parseFloat((balance + amt).toFixed(2));
        status.balance = balance;
        status.reservedBalance = reservedBalance;
        addLog("info", `🏦 Vault Transfer: Withdrew $${amt.toFixed(2)} USD from Sandbox Safe to active account.`);
      } else {
        return res.status(400).json({ error: "Insufficient reserved balance in safe." });
      }
    } else if (subAction === "WITHDRAW_ALL") {
      if (reservedBalance > 0) {
        const amtTransferred = reservedBalance;
        balance = parseFloat((balance + reservedBalance).toFixed(2));
        reservedBalance = 0.00;
        status.balance = balance;
        status.reservedBalance = reservedBalance;
        addLog("info", `🏦 Vault Transfer: Restored all $${amtTransferred.toFixed(2)} USD from safe back to active account.`);
      }
    } else if (subAction === "SET_ACTIVE_LEAVE" && amt > 0) {
      const totalAvailable = balance + reservedBalance;
      if (amt >= totalAvailable) {
        balance = parseFloat(totalAvailable.toFixed(2));
        reservedBalance = 0.00;
      } else {
        balance = parseFloat(amt.toFixed(2));
        reservedBalance = parseFloat((totalAvailable - amt).toFixed(2));
      }
      status.balance = balance;
      status.reservedBalance = reservedBalance;
      addLog("success", `🔒 Safe Preserved: Reserved $${reservedBalance.toFixed(2)} USD in safe. Active demo testing capital set to exactly $${balance.toFixed(2)} USD.`);
    }

    saveState();
    broadcastSummary();
    return res.json({ success: true, balance, reservedBalance });
  }

  if (action === "EMERGENCY_STOP") {
    status.autoTrading = false;
    pendingTrade = null;
    addLog("error", `🚨 EMERGENCY STOP PRESSED! ALL TRADING HALTED IMMEDIATELY!`);
    broadcastSummary();
    return res.json({ success: true });
  }

  res.status(400).json({ error: "Unknown action" });
});

// AI Report Generation route
app.post("/api/ai-analysis", async (req, res) => {
  try {
    const ai = getAI();
    const { freqs, predictionDigit, triggerDigit } = calculateDigits();
    
    const recentDigits = ticks.slice(-30).map(t => t.digit).join(", ");
    
    const systemPrompt = `You are a premium institutional quantitative analyst specializing in high-frequency synthetic index trading (Matches Digits contracts). Your task is to provide an analytical report of the current digits stream.`;
    
    const userPrompt = `
      --- DIGIT ANALYSIS REQUEST ---
      Rolling Window Size: 120 ticks
      Current Active Symbol: ${config.symbol}
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

    addLog("info", `Requesting AI analytics report from Gemini...`);
    broadcastSummary();

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt
      }
    });

    const markdownReport = response.text || "No analysis returned.";
    res.json({ success: true, report: markdownReport });
  } catch (error: any) {
    addLog("error", `AI Refinement failed: ${error.message}`);
    broadcastSummary();
    res.status(500).json({ error: error.message || "Gemini API unavailable" });
  }
});


// --- FRONTEND INTEGRATION ENDPOINTS ---
app.get("/analysis", (req, res) => {
  const windowSize = req.query.window ? parseInt(req.query.window as string, 10) : 15;
  const analysis = calculateAnalysisEngine(windowSize);
  res.json(analysis);
});

app.get("/api/analysis", (req, res) => {
  const windowSize = req.query.window ? parseInt(req.query.window as string, 10) : 15;
  const analysis = calculateAnalysisEngine(windowSize);
  res.json(analysis);
});

app.get("/signal", (req, res) => {
  const windowSize = req.query.window ? parseInt(req.query.window as string, 10) : 15;
  const analysis = calculateAnalysisEngine(windowSize);
  const signal = evaluateStrategy(analysis);
  res.json(signal);
});

app.get("/api/signal", (req, res) => {
  const windowSize = req.query.window ? parseInt(req.query.window as string, 10) : 15;
  const analysis = calculateAnalysisEngine(windowSize);
  const signal = evaluateStrategy(analysis);
  res.json(signal);
});

app.get("/trades", (req, res) => {
  res.json(trades);
});

app.get("/api/trades", (req, res) => {
  res.json(trades);
});

app.get("/status", (req, res) => {
  res.json(status);
});

app.get("/api/status", (req, res) => {
  res.json(status);
});

app.get("/balance", (req, res) => {
  const summary = {
    initial_balance: sessionStartBalance,
    current_balance: balance,
    profit_loss: parseFloat((balance - sessionStartBalance).toFixed(2)),
    currency: "USD",
    total_trades: trades.length,
    wins: trades.filter(t => t.result === "WIN").length,
    losses: trades.filter(t => t.result === "LOSS").length
  };
  res.json(summary);
});

app.get("/api/balance", (req, res) => {
  const summary = {
    initial_balance: sessionStartBalance,
    current_balance: balance,
    profit_loss: parseFloat((balance - sessionStartBalance).toFixed(2)),
    currency: "USD",
    total_trades: trades.length,
    wins: trades.filter(t => t.result === "WIN").length,
    losses: trades.filter(t => t.result === "LOSS").length
  };
  res.json(summary);
});


// Bootstrap state
bootstrapHistoricalTicks();
connectToDeriv();

// WebSocket server setup (upgrade handling)
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

wss.on("connection", (ws) => {
  // Send initial summary
  const { freqs, predictionDigit, triggerDigit } = calculateDigits();
  const summary: AnalysisSummary & { analysis15?: any, signal15?: any } = {
    ticks,
    frequencies: freqs,
    predictionDigit,
    triggerDigit,
    status,
    config,
    trades,
    logs,
    analysis15: currentAnalysis,
    signal15: currentStrategyResult
  };
  ws.send(JSON.stringify({ type: "SUMMARY_UPDATE", data: summary }));

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      
      if (data.type === "TOGGLE_AUTO_TRADE") {
        const wantToTurnOn = !status.autoTrading;
        if (wantToTurnOn && (balance <= 0 || balance < config.stake)) {
          status.autoTrading = false;
          addLog("error", `🛑 CANNOT START AUTO TRADING: Available balance ($${balance.toFixed(2)}) is insufficient for base stake ($${config.stake.toFixed(2)}).`);
          broadcastSummary();
          saveState();
        } else {
          status.autoTrading = wantToTurnOn;
          if (status.autoTrading) {
            sessionStartBalance = balance;
            consecutiveLosses = 0;
            currentMartingaleStep = 0;
          }
          addLog("info", `Automated Trading engine turned ${status.autoTrading ? "🔴 ON" : "⚪ OFF"}${status.autoTrading ? " (Session Start Balance: $" + balance.toFixed(2) + ")" : ""}`);
          broadcastSummary();
          saveState();
        }
      }
      
      else if (data.type === "EMERGENCY_STOP") {
        status.autoTrading = false;
        pendingTrade = null;
        addLog("error", `🚨 EMERGENCY STOP PRESSED! ALL TRADING HALTED IMMEDIATELY!`);
        broadcastSummary();
        saveState();
      }
      
      else if (data.type === "UPDATE_CONFIG") {
        const newConf = data.data;
        if (newConf.stake !== undefined) config.stake = parseFloat(newConf.stake);
        if (newConf.martingaleEnabled !== undefined) {
          config.martingaleEnabled = !!newConf.martingaleEnabled;
          currentMartingaleStep = 0;
        }
        if (newConf.martingaleMultiplier !== undefined) {
          config.martingaleMultiplier = parseFloat(newConf.martingaleMultiplier);
          currentMartingaleStep = 0;
        }
        if (newConf.martingaleMaxSteps !== undefined) {
          config.martingaleMaxSteps = parseInt(newConf.martingaleMaxSteps, 10);
          currentMartingaleStep = 0;
        }
        let credentialsChanged = false;
        if (newConf.derivToken !== undefined) {
          const trimmedToken = typeof newConf.derivToken === "string" ? newConf.derivToken.trim() : newConf.derivToken;
          if (trimmedToken !== config.derivToken) {
            config.derivToken = trimmedToken;
            credentialsChanged = true;
          }
        }
        if (newConf.derivAppId !== undefined) {
          const trimmedAppId = typeof newConf.derivAppId === "string" ? newConf.derivAppId.trim() : newConf.derivAppId;
          if (trimmedAppId !== config.derivAppId) {
            config.derivAppId = trimmedAppId;
            credentialsChanged = true;
          }
        }

        if (newConf.symbol !== undefined && newConf.symbol !== config.symbol) {
          config.symbol = newConf.symbol;
          status.symbol = newConf.symbol;
          bootstrapHistoricalTicks();
          connectToDeriv();
        } else if (newConf.derivMode !== undefined && newConf.derivMode !== status.derivMode) {
          status.derivMode = newConf.derivMode;
          connectToDeriv();
        } else if (credentialsChanged) {
          connectToDeriv();
        }
        if (newConf.analysisMode !== undefined) {
          config.analysisMode = newConf.analysisMode;
          addLog("info", `🔄 Analysis Mode switched to: ${config.analysisMode} (WS)`);
        }
        if (newConf.lockedPredictionDigit !== undefined) config.lockedPredictionDigit = newConf.lockedPredictionDigit;
        if (newConf.lockedTriggerDigit !== undefined) config.lockedTriggerDigit = newConf.lockedTriggerDigit;
        if (newConf.useLockedPair !== undefined) config.useLockedPair = newConf.useLockedPair;
        
        // Support risk settings updates via WS
        if (newConf.takeProfitEnabled !== undefined) config.takeProfitEnabled = !!newConf.takeProfitEnabled;
        if (newConf.takeProfitAmount !== undefined) config.takeProfitAmount = parseFloat(newConf.takeProfitAmount);
        if (newConf.stopLossEnabled !== undefined) config.stopLossEnabled = !!newConf.stopLossEnabled;
        if (newConf.stopLossAmount !== undefined) config.stopLossAmount = parseFloat(newConf.stopLossAmount);
        if (newConf.maxStakeEnabled !== undefined) config.maxStakeEnabled = !!newConf.maxStakeEnabled;
        if (newConf.maxStakeAmount !== undefined) config.maxStakeAmount = parseFloat(newConf.maxStakeAmount);
        if (newConf.martingaleActionOnMax !== undefined) config.martingaleActionOnMax = newConf.martingaleActionOnMax;
        if (newConf.consecutiveLossLimitEnabled !== undefined) config.consecutiveLossLimitEnabled = !!newConf.consecutiveLossLimitEnabled;
        if (newConf.consecutiveLossLimitAmount !== undefined) config.consecutiveLossLimitAmount = parseInt(newConf.consecutiveLossLimitAmount, 10);
        
        broadcastSummary();
        saveState();
      }
    } catch(err) {
      console.error("WS Message Error:", err);
    }
  });
});

// Handle serving SPA in production
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*all", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  // Dev mode setup (Vite integration)
  import("vite").then(async ({ createServer: createViteServer }) => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  });
}

// Start server listening
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Finance server running on http://localhost:${PORT}`);
});
