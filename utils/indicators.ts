
import { Candle, HeikinAshiCandle, AnalysisResult, TradeSignal } from '../types';

/**
 * Transforms standard candles to Heikin Ashi candles
 * Formulas:
 * HA_Close = (Open + High + Low + Close) / 4
 * HA_Open = (Prev_HA_Open + Prev_HA_Close) / 2
 * HA_High = Max(High, HA_Open, HA_Close)
 * HA_Low = Min(Low, HA_Open, HA_Close)
 */
export const calculateHeikinAshi = (candles: Candle[]): HeikinAshiCandle[] => {
  if (candles.length === 0) return [];

  const haCandles: HeikinAshiCandle[] = [];

  // First HA candle is same as standard
  const first = candles[0];
  const firstHaClose = (first.open + first.high + first.low + first.close) / 4;
  
  haCandles.push({
    ...first,
    close: firstHaClose,
    color: firstHaClose >= first.open ? 'green' : 'red',
    hasUpperWick: first.high > Math.max(first.open, firstHaClose),
    hasLowerWick: first.low < Math.min(first.open, firstHaClose),
    bodySize: Math.abs(firstHaClose - first.open),
    upperWickSize: first.high - Math.max(first.open, firstHaClose),
    lowerWickSize: Math.min(first.open, firstHaClose) - first.low
  });

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prevHa = haCandles[i - 1];

    // HA Formulas
    const haClose = (curr.open + curr.high + curr.low + curr.close) / 4;
    const haOpen = (prevHa.open + prevHa.close) / 2;
    const haHigh = Math.max(curr.high, haOpen, haClose);
    const haLow = Math.min(curr.low, haOpen, haClose);

    const bodySize = Math.abs(haClose - haOpen);
    const upperWickSize = haHigh - Math.max(haOpen, haClose);
    const lowerWickSize = Math.min(haOpen, haClose) - haLow;

    haCandles.push({
      time: curr.time,
      open: haOpen,
      close: haClose,
      high: haHigh,
      low: haLow,
      color: haClose >= haOpen ? 'green' : 'red',
      hasUpperWick: upperWickSize > 0.00001, // Epsilon for float comparison
      hasLowerWick: lowerWickSize > 0.00001,
      bodySize,
      upperWickSize,
      lowerWickSize
    });
  }

  return haCandles;
};

/**
 * Exponential Moving Average (EMA)
 */
export const calculateEMA = (data: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  
  if (data.length === 0) return [];

  // Start with SMA for first point if possible, or just first data point
  let prevEma = data[0]; 
  emaArray.push(prevEma);

  for (let i = 1; i < data.length; i++) {
    const currentPrice = data[i];
    const newEma = (currentPrice - prevEma) * k + prevEma;
    emaArray.push(newEma);
    prevEma = newEma;
  }

  return emaArray;
};

/**
 * Relative Strength Index (RSI)
 */
export const calculateRSI = (closePrices: number[], period: number = 14): number => {
  if (closePrices.length < 2) return 50;

  let gains = 0;
  let losses = 0;

  const effectivePeriod = Math.min(closePrices.length - 1, period);

  for (let i = closePrices.length - effectivePeriod; i < closePrices.length; i++) {
    const change = closePrices[i] - closePrices[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / effectivePeriod;
  const avgLoss = losses / effectivePeriod;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

/**
 * Moving Average Convergence Divergence (MACD)
 */
export const calculateMACD = (data: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) => {
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  
  const macdLine: number[] = [];
  // Calculate MACD line
  for(let i = 0; i < data.length; i++) {
    macdLine.push(fastEMA[i] - slowEMA[i]);
  }

  const signalLine = calculateEMA(macdLine, signalPeriod);
  
  const currentMACD = macdLine[macdLine.length - 1];
  const currentSignal = signalLine[signalLine.length - 1];
  const histogram = currentMACD - currentSignal;

  return { value: currentMACD, signal: currentSignal, histogram };
};

/**
 * Supertrend Indicator
 * 1. TR = Max(H-L, |H-Cp|, |L-Cp|)
 * 2. ATR = SMA(TR, period)
 * 3. Bands calculation
 */
export const calculateSupertrend = (candles: Candle[], period: number = 10, multiplier: number = 3): { direction: 'UP' | 'DOWN', value: number } => {
  if (candles.length < period + 1) return { direction: 'UP', value: 0 };

  // Calculate True Range (TR)
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const closePrev = candles[i-1].close;
    
    tr.push(Math.max(high - low, Math.abs(high - closePrev), Math.abs(low - closePrev)));
  }

  // Calculate ATR (Simple Average of TR)
  // Simplified for this context: usually ATR is smoothed, but SMA is acceptable for short volatile periods
  let atr = 0;
  if (tr.length >= period) {
     const slice = tr.slice(-period);
     atr = slice.reduce((a, b) => a + b, 0) / period;
  } else {
     atr = tr.reduce((a, b) => a + b, 0) / tr.length;
  }

  // Calculate Supertrend for the last candle (simplified recursive logic)
  const curr = candles[candles.length - 1];
  const hl2 = (curr.high + curr.low) / 2;
  const basicUpper = hl2 + (multiplier * atr);
  const basicLower = hl2 - (multiplier * atr);

  // Determine trend based on Price vs Bands
  // If Close > Previous Supertrend (or just using Basic Lower as proxy for uptrend start), it's UP
  // Ideally this requires previous supertrend value, here we approximate with latest close
  
  if (curr.close > basicLower) {
      return { direction: 'UP', value: basicLower };
  } else {
      return { direction: 'DOWN', value: basicUpper };
  }
};


/**
 * Main Analysis Logic
 * Adheres to Steps 1-4 provided in prompt.
 */
export const analyzeMarket = (candles: Candle[]): AnalysisResult => {
  // Step 1: Identifier les valeurs (handled by input)
  
  // Step 2: Calculer Heikin Ashi
  const haCandles = calculateHeikinAshi(candles);
  const closes = candles.map(c => c.close);
  
  // Need at least a few candles for valid analysis
  if (haCandles.length < 2) {
    // Fallback safe defaults
    return {
      signal: TradeSignal.CALL,
      confidence: 50,
      rsi: 50,
      ema20: 0,
      ema50: 0,
      trend: 'SIDEWAYS',
      macd: { value: 0, signal: 0, histogram: 0 },
      supertrend: { direction: 'UP', value: 0 }
    };
  }

  const currentHa = haCandles[haCandles.length - 1];
  const prevHa = haCandles[haCandles.length - 2];
  const price = currentHa.close;

  // Indicators Calculation
  const rsi = calculateRSI(closes, 14);
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const macd = calculateMACD(closes);
  const supertrend = calculateSupertrend(candles, 10, 3);

  const ema20 = ema20Arr.length > 0 ? ema20Arr[ema20Arr.length - 1] : price;
  const ema50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : price;

  // --- Step 3: Lire la couleur et la force (Candle Analysis) ---
  let candleSignal: TradeSignal;
  const isGreen = currentHa.color === 'green';
  const isRed = currentHa.color === 'red';
  
  // Check for weak candles (Doji / Reversal potential)
  // Body size relative to total range (High - Low)
  const totalRange = currentHa.high - currentHa.low;
  const isSmallBody = currentHa.bodySize < (totalRange * 0.3); // Body is less than 30% of candle
  
  // Primary signal based on candle color
  if (isGreen) {
      candleSignal = TradeSignal.CALL;
  } else {
      candleSignal = TradeSignal.PUT;
  }

  // --- Step 4: Confluence avec Indicateurs ---
  let confidence = 0;
  let signal = candleSignal;

  // Base score for correct candle color
  confidence += 30;

  if (signal === TradeSignal.CALL) {
      // 1. EMA Filter
      if (price > ema20) confidence += 10;
      if (ema20 > ema50) confidence += 10;

      // 2. RSI Filter (Momentum)
      if (rsi > 50 && rsi < 80) confidence += 10; // Healthy uptrend
      if (rsi < 30) confidence += 15; // Oversold bounce potential

      // 3. MACD Filter (Crossover/Direction)
      if (macd.histogram > 0) confidence += 10; // Histogram positive
      if (macd.value > macd.signal) confidence += 5; // MACD line above signal

      // 4. Supertrend Filter
      if (supertrend.direction === 'UP') confidence += 10;

      // 5. Candle Shape (Step 3 detail)
      if (!isSmallBody && !currentHa.hasLowerWick) confidence += 10; // Strong green candle
      if (isSmallBody && prevHa.color === 'red') confidence -= 10; // Caution: potential fakeout
  } 
  else { // PUT
      // 1. EMA Filter
      if (price < ema20) confidence += 10;
      if (ema20 < ema50) confidence += 10;

      // 2. RSI Filter
      if (rsi < 50 && rsi > 20) confidence += 10; // Healthy downtrend
      if (rsi > 70) confidence += 15; // Overbought reversal potential

      // 3. MACD Filter
      if (macd.histogram < 0) confidence += 10;
      if (macd.value < macd.signal) confidence += 5;

      // 4. Supertrend Filter
      if (supertrend.direction === 'DOWN') confidence += 10;

      // 5. Candle Shape
      if (!isSmallBody && !currentHa.hasUpperWick) confidence += 10; // Strong red candle
      if (isSmallBody && prevHa.color === 'green') confidence -= 10;
  }

  // --- Final Decision Logic (No Neutral) ---
  
  // Determine Trend Label
  let trend: 'UP' | 'DOWN' | 'SIDEWAYS' = 'SIDEWAYS';
  if (ema20 > ema50) trend = 'UP';
  else if (ema20 < ema50) trend = 'DOWN';

  // Force Binary Signal even if confidence is low, based on Price vs EMA20 as tiebreaker
  if (confidence < 40) {
      if (price > ema20) signal = TradeSignal.CALL;
      else signal = TradeSignal.PUT;
      confidence = 45; // Minimum confidence for UI display
  }

  // Cap confidence
  confidence = Math.min(confidence, 99);

  return {
    signal,
    confidence,
    rsi,
    ema20,
    ema50,
    trend,
    macd,
    supertrend
  };
};
