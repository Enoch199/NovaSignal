
export enum TradeSignal {
  CALL = 'CALL',
  PUT = 'PUT',
  NEUTRAL = 'NEUTRE',
  WAITING = 'EN ATTENTE'
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface HeikinAshiCandle extends Candle {
  color: 'green' | 'red';
  hasUpperWick: boolean;
  hasLowerWick: boolean;
  bodySize: number;
  upperWickSize: number;
  lowerWickSize: number;
}

export interface AnalysisResult {
  signal: TradeSignal;
  confidence: number; // 0-100
  rsi: number;
  ema20: number;
  ema50: number;
  trend: 'UP' | 'DOWN' | 'SIDEWAYS';
  macd: {
    value: number;
    signal: number;
    histogram: number;
  };
  supertrend: {
    direction: 'UP' | 'DOWN';
    value: number;
  };
}

export interface TraderProfile {
  id: string;
  name: string;
  rank: string;
  avatar: string;
  winRate: number;
  currentSignal: TradeSignal;
  pair: string;
  timeframe: string;
}

export type Timeframe = '5s' | '15s' | '30s' | '1m' | '2m';

export const PAIRS = [
  { id: 'BTCUSDT', name: 'Bitcoin (BTC/USDT)', streamId: 'btcusdt' },
  { id: 'ETHUSDT', name: 'Ethereum (ETH/USDT)', streamId: 'ethusdt' },
  // OTC/Forex pairs mapped to active crypto streams for simulation purposes
  { id: 'GOLDOTC', name: 'Gold OTC', streamId: 'btcusdt' }, 
  { id: 'EURCHFOTC', name: 'EUR/CHF OTC', streamId: 'ethusdt' },
  { id: 'EURUSD', name: 'EUR/USD OTC', streamId: 'eurusdt' }, 
  { id: 'AUDUSD', name: 'AUD/USD OTC', streamId: 'bnbusdt' }, 
];
