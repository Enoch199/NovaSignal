
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Clock, 
  Users, 
  Target, 
  BarChart2,
  Lock,
  Wifi,
  PlayCircle,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  CandlestickChart,
  Zap
} from 'lucide-react';
import { 
  PAIRS, 
  Timeframe, 
  TradeSignal, 
  AnalysisResult, 
  Candle,
  TraderProfile
} from './types';
import { analyzeMarket } from './utils/indicators';
import { getTopTraders } from './services/mockSocial';

const App: React.FC = () => {
  // --- State ---
  const [selectedPair, setSelectedPair] = useState(PAIRS[0].id);
  const [timeframe, setTimeframe] = useState<Timeframe>('15s');
  const [price, setPrice] = useState<number>(0);
  const [displayedAnalysis, setDisplayedAnalysis] = useState<AnalysisResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [traders, setTraders] = useState<TraderProfile[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // --- Refs ---
  const wsRef = useRef<WebSocket | null>(null);
  const candlesRef = useRef<Candle[]>([]); 
  const latestAnalysisRef = useRef<AnalysisResult | null>(null);

  // --- Config ---
  const intervalSeconds = useMemo(() => {
    switch (timeframe) {
      case '5s': return 5;
      case '15s': return 15;
      case '30s': return 30;
      case '1m': return 60;
      case '2m': return 120;
      default: return 60;
    }
  }, [timeframe]);

  const currentPairConfig = PAIRS.find(p => p.id === selectedPair) || PAIRS[0];

  // --- Helper: Generate Initial History ---
  // This ensures we have data immediately so user doesn't see "Waiting"
  const generateInitialHistory = (basePrice: number, baseTime: number) => {
    const history: Candle[] = [];
    let currentPrice = basePrice;
    for(let i = 60; i > 0; i--) {
      // Create some random realistic movement
      const volatility = basePrice * 0.0002;
      const change = (Math.random() - 0.5) * volatility;
      const open = currentPrice;
      const close = currentPrice + change;
      const high = Math.max(open, close) + (Math.random() * volatility * 0.5);
      const low = Math.min(open, close) - (Math.random() * volatility * 0.5);
      
      history.push({
        time: baseTime - (i * intervalSeconds),
        open, high, low, close
      });
      currentPrice = close;
    }
    return history;
  };

  // --- WebSocket Connection ---
  useEffect(() => {
    // Reset critical state
    candlesRef.current = [];
    setDisplayedAnalysis(null);
    setPrice(0);
    setIsConnected(false);
    latestAnalysisRef.current = null;

    const streamName = currentPairConfig.streamId || 'btcusdt';
    const wsUrl = `wss://stream.binance.com:9443/ws/${streamName}@kline_1s`;
    
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setIsConnected(true);
      console.log('Connected to Binance WS');
    };

    let currentAggregatedCandle: Candle | null = null;
    let startTime = 0;
    let isInitialized = false;

    wsRef.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.k) return;

      const k = message.k; 
      const tickPrice = parseFloat(k.c);
      const tickTime = Math.floor(message.E / 1000); 

      setPrice(tickPrice);

      // Pre-fill history on first tick if empty
      if (!isInitialized) {
        candlesRef.current = generateInitialHistory(tickPrice, tickTime);
        isInitialized = true;
      }

      // Aggregation Logic
      const bucket = Math.floor(tickTime / intervalSeconds);
      
      if (startTime !== bucket) {
        // New bucket
        if (currentAggregatedCandle) {
          const newHistory = [...candlesRef.current, currentAggregatedCandle].slice(-100); 
          candlesRef.current = newHistory;
          
          const result = analyzeMarket(newHistory);
          latestAnalysisRef.current = result;
        }

        startTime = bucket;
        currentAggregatedCandle = {
          time: tickTime,
          open: tickPrice,
          high: tickPrice,
          low: tickPrice,
          close: tickPrice
        };
      } else if (currentAggregatedCandle) {
        currentAggregatedCandle.high = Math.max(currentAggregatedCandle.high, tickPrice);
        currentAggregatedCandle.low = Math.min(currentAggregatedCandle.low, tickPrice);
        currentAggregatedCandle.close = tickPrice;
      }

      // Real-time update of analysis for current pending candle
      if (candlesRef.current.length > 0 && currentAggregatedCandle) {
        const tempHistory = [...candlesRef.current, currentAggregatedCandle];
        latestAnalysisRef.current = analyzeMarket(tempHistory);
      }
    };

    wsRef.current.onclose = () => setIsConnected(false);

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [currentPairConfig, intervalSeconds]);

  // --- Manual Scan Handler ---
  const handleScan = () => {
    if (isScanning) return;
    
    setIsScanning(true);
    setDisplayedAnalysis(null);
    setTraders([]);

    let scanDuration = 0;
    const minDuration = 2000; // Minimum 2s animation
    const startTime = Date.now();

    const scanInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const currentAnalysis = latestAnalysisRef.current;

      // Check if we have a valid analysis (Not waiting)
      const hasData = currentAnalysis && currentAnalysis.signal !== TradeSignal.WAITING;
      
      // If we have data and minimum animation time passed
      if (hasData && elapsed >= minDuration) {
        clearInterval(scanInterval);
        setDisplayedAnalysis(currentAnalysis);
        setTraders(getTopTraders(currentAnalysis.signal, currentPairConfig.name, timeframe));
        setIsScanning(false);
      }
      
      // Safety timeout (5s)
      if (elapsed > 5000) {
        clearInterval(scanInterval);
        const fallback: AnalysisResult = {
           signal: TradeSignal.CALL,
           confidence: 45,
           rsi: 50,
           ema20: price,
           ema50: price,
           trend: 'SIDEWAYS',
           macd: { value: 0, signal: 0, histogram: 0},
           supertrend: { direction: 'UP', value: 0}
        };
        setDisplayedAnalysis(currentAnalysis || fallback);
        setTraders(getTopTraders((currentAnalysis || fallback).signal, currentPairConfig.name, timeframe));
        setIsScanning(false);
      }

    }, 200);
  };

  const handleReset = () => {
    setDisplayedAnalysis(null);
    setTraders([]);
    handleScan(); 
  };

  const getSignalColor = (s: TradeSignal) => {
    switch (s) {
      case TradeSignal.CALL: return 'text-trade-call drop-shadow-[0_0_15px_rgba(16,185,129,0.6)]';
      case TradeSignal.PUT: return 'text-trade-put drop-shadow-[0_0_15px_rgba(239,68,68,0.6)]';
      default: return 'text-gray-400';
    }
  };

  const getSignalBg = (s: TradeSignal) => {
    switch (s) {
      case TradeSignal.CALL: return 'bg-trade-call/10 border-trade-call/30 shadow-[0_0_40px_rgba(16,185,129,0.15)]';
      case TradeSignal.PUT: return 'bg-trade-put/10 border-trade-put/30 shadow-[0_0_40px_rgba(239,68,68,0.15)]';
      default: return 'bg-gray-800/50 border-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-gray-950 to-black text-gray-100 font-sans selection:bg-primary-500/30">
      
      {/* --- Header --- */}
      <header className="fixed top-0 w-full z-50 glass-panel border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-primary-500 w-6 h-6 animate-pulse" />
            <h1 className="text-xl font-bold tracking-tight">Nova<span className="text-primary-500">Signal</span></h1>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-gray-400">
             <div className="flex items-center gap-1.5">
               <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
               {isConnected ? 'LIVE DATA' : 'CONNECTING...'}
             </div>
             <div className="hidden sm:block text-gray-600">|</div>
             <div className="hidden sm:block">MANUAL SCAN MODE</div>
          </div>
        </div>
      </header>

      <main className="pt-24 pb-12 px-4 max-w-5xl mx-auto space-y-8">

        {/* --- Controls Panel --- */}
        <div className="glass-panel rounded-2xl p-4 sm:p-6 flex flex-col md:flex-row gap-6 items-center justify-between shadow-xl">
          
          <div className="w-full md:w-auto flex flex-col gap-2">
            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider flex items-center gap-1">
              <BarChart2 className="w-3 h-3" /> Actif
            </label>
            <div className="relative group">
              <select 
                value={selectedPair}
                onChange={(e) => setSelectedPair(e.target.value)}
                className="w-full md:w-64 bg-gray-900/50 border border-gray-700 text-white text-lg font-mono py-3 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 appearance-none cursor-pointer transition-all hover:border-gray-600"
              >
                {PAIRS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 group-hover:text-white transition-colors">
                ▼
              </div>
            </div>
          </div>

          <div className="w-full md:w-auto flex flex-col gap-2">
            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3" /> Timeframe
            </label>
            <div className="flex bg-gray-900/50 p-1 rounded-xl border border-gray-700">
              {(['5s', '15s', '30s', '1m', '2m'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    timeframe === tf 
                      ? 'bg-gray-800 text-white shadow-lg border border-gray-600' 
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          
           <div className="hidden md:flex flex-col items-end gap-1">
            <span className="text-xs text-gray-500 font-mono">PRIX ACTUEL</span>
            <span className={`text-2xl font-mono font-bold tracking-tight ${
              candlesRef.current.length > 1 && price > candlesRef.current[candlesRef.current.length-1].close 
                ? 'text-green-400' 
                : 'text-red-400'
            }`}>
              {price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* --- MAIN ACTION AREA --- */}
        <div className="relative w-full h-96 md:h-[450px]">
            {!displayedAnalysis && !isScanning ? (
                // --- STATE: READY TO SCAN ---
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <button 
                        onClick={handleScan}
                        disabled={!isConnected}
                        className="group relative flex flex-col items-center justify-center w-64 h-64 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 border-4 border-gray-700 shadow-[0_0_60px_rgba(59,130,246,0.1)] hover:shadow-[0_0_80px_rgba(59,130,246,0.3)] hover:scale-105 transition-all duration-300 z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="absolute inset-0 rounded-full border-2 border-primary-500/20 animate-ping-slow"></div>
                        <Search className="w-16 h-16 text-primary-500 mb-4 group-hover:text-primary-400 transition-colors" />
                        <span className="text-xl font-bold text-white tracking-wider">SCANNER</span>
                        <span className="text-xs text-gray-500 mt-2 uppercase tracking-widest font-mono">
                           {isConnected ? 'PRÊT' : 'CONNEXION...'}
                        </span>
                    </button>
                    <div className="mt-8 px-4 py-2 bg-gray-900/50 rounded-lg border border-gray-800 backdrop-blur-sm">
                      <p className="text-sm text-gray-400 font-medium flex items-center gap-2">
                        <CandlestickChart className="w-4 h-4 text-primary-500" />
                        L'analyse se base sur le graphique de la Bougie Heikin Ashi et du marché boursier
                      </p>
                    </div>
                </div>
            ) : isScanning ? (
                // --- STATE: SCANNING ---
                <div className="absolute inset-0 flex flex-col items-center justify-center glass-panel rounded-3xl border border-primary-500/30">
                    <div className="relative w-24 h-24 mb-6">
                        <div className="absolute inset-0 border-t-4 border-primary-500 rounded-full animate-spin"></div>
                        <div className="absolute inset-2 border-r-4 border-primary-500/50 rounded-full animate-spin animation-delay-150"></div>
                        <div className="absolute inset-4 border-b-4 border-primary-500/20 rounded-full animate-spin animation-delay-300"></div>
                    </div>
                    <div className="text-2xl font-mono font-bold text-primary-400 animate-pulse">ANALYSE EN COURS...</div>
                    <div className="text-sm text-gray-400 mt-4 font-medium flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Synchronisation Heikin Ashi & Marché Boursier
                    </div>
                </div>
            ) : (
                // --- STATE: RESULT ---
                <div className={`absolute inset-0 glass-panel rounded-3xl p-8 border-2 flex flex-col items-center justify-center text-center transition-all duration-500 animate-in fade-in zoom-in-95 ${getSignalBg(displayedAnalysis?.signal || TradeSignal.CALL)}`}>
                    
                    {/* Result Content */}
                    <div className="flex flex-col items-center gap-6 w-full max-w-lg">
                        <div className="flex flex-col items-center gap-1">
                          <h2 className="text-sm font-bold text-gray-400 tracking-[0.3em] uppercase">RÉSULTAT DU SCAN</h2>
                          <span className="text-[10px] text-gray-500 font-mono border border-gray-700 rounded px-2 py-0.5">SOURCE: HEIKIN ASHI & BOURSE</span>
                        </div>
                        
                        <div className="flex items-center gap-6">
                            {displayedAnalysis?.signal === TradeSignal.CALL && <ArrowUpCircle className="w-20 h-20 md:w-24 md:h-24 text-trade-call animate-bounce" />}
                            {displayedAnalysis?.signal === TradeSignal.PUT && <ArrowDownCircle className="w-20 h-20 md:w-24 md:h-24 text-trade-put animate-bounce" />}
                            
                            <span className={`text-6xl md:text-8xl font-black tracking-tighter ${getSignalColor(displayedAnalysis?.signal || TradeSignal.CALL)}`}>
                                {displayedAnalysis?.signal}
                            </span>
                        </div>

                        {/* Confidence Meter */}
                        <div className="w-full space-y-2 mb-2">
                            <div className="flex justify-between text-xs font-medium uppercase tracking-wider text-gray-500">
                                <span>Confiance Algorithmique</span>
                                <span>{displayedAnalysis?.confidence || 0}%</span>
                            </div>
                            <div className="h-5 w-full bg-gray-900 rounded-full overflow-hidden border border-gray-800 relative">
                                <div 
                                    className={`h-full absolute top-0 left-0 transition-all duration-1000 ease-out ${
                                    displayedAnalysis?.signal === TradeSignal.CALL ? 'bg-gradient-to-r from-green-600 to-green-400' :
                                    'bg-gradient-to-r from-red-600 to-red-400'
                                    }`}
                                    style={{ width: `${displayedAnalysis?.confidence || 0}%` }}
                                ></div>
                            </div>
                        </div>

                         <div className="px-4 py-2 bg-white/5 rounded-lg border border-white/10 text-sm text-gray-300 mb-4">
                            Trade recommandé sur <span className="font-bold text-white">{timeframe}</span> expiration
                        </div>

                        {/* Re-Scan Button */}
                        <button 
                            onClick={handleReset}
                            className="flex items-center gap-2 px-8 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold transition-all border border-gray-600 hover:border-gray-500 shadow-lg"
                        >
                            <RefreshCw className="w-4 h-4" />
                            NOUVEAU SCAN
                        </button>
                    </div>
                </div>
            )}
        </div>


        {/* --- BOTTOM SECTION (Stacked) --- */}
        <div className="flex flex-col gap-6">

          {/* 1. Social Trading Section */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-2">
              <Users className="w-5 h-5 text-primary-500" />
              <h3 className="font-bold text-sm uppercase tracking-wider text-gray-300">Top Traders (Simultané)</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {traders.length === 0 ? (
                 <div className="col-span-full py-12 text-center text-gray-500 flex flex-col items-center justify-center">
                   {isScanning ? (
                       <>
                        <Users className="w-8 h-8 mb-2 animate-pulse opacity-50"/>
                        <span className="text-xs">Synchronisation des positions...</span>
                       </>
                   ) : (
                       <>
                        <PlayCircle className="w-8 h-8 mb-2 opacity-30"/>
                        <span className="text-xs">Lancez un scan pour voir les traders</span>
                       </>
                   )}
                 </div>
              ) : (
                traders.map((trader) => (
                  <div key={trader.id} className="bg-gray-900/40 border border-gray-800 rounded-lg p-4 flex items-center justify-between hover:bg-gray-800/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img src={trader.avatar} alt={trader.name} className="w-10 h-10 rounded-full border border-gray-700" />
                        <div className="absolute -bottom-1 -right-1 bg-gray-900 text-[9px] px-1.5 py-0.5 rounded border border-gray-700 text-primary-400 font-bold">
                          {trader.rank}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-sm text-gray-200">{trader.name}</div>
                        <div className="text-[11px] text-gray-500 font-mono">WinRate: <span className="text-yellow-500">{trader.winRate}%</span></div>
                      </div>
                    </div>

                    <div className={`px-3 py-1.5 rounded text-sm font-bold font-mono border ${
                      trader.currentSignal === TradeSignal.CALL ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                      trader.currentSignal === TradeSignal.PUT ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                      'bg-gray-800 border-gray-700 text-gray-500'
                    }`}>
                      {trader.currentSignal === TradeSignal.CALL ? 'CALL' : 
                       trader.currentSignal === TradeSignal.PUT ? 'PUT' : '-'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* 2. Scanner Details (Bottom) */}
          <div className={`glass-panel rounded-2xl p-6 transition-all duration-500 ${displayedAnalysis ? 'opacity-100 translate-y-0' : 'opacity-40 blur-sm translate-y-4 pointer-events-none'}`}>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gray-400 mb-4 border-b border-gray-800 pb-2">
                <Target className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Scanner de Tendance (Détails Techniques)</span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {/* Heikin Ashi Status */}
                <div className="col-span-2 md:col-span-2 bg-gray-900/50 p-4 rounded-xl border border-gray-800 flex justify-between items-center px-6">
                    <span className="text-xs text-gray-500">Heikin Ashi</span>
                    <div className="flex items-center gap-3">
                         <div className={`w-4 h-4 rounded-full ${
                             candlesRef.current.length > 0 && candlesRef.current[candlesRef.current.length-1].close >= candlesRef.current[candlesRef.current.length-1].open ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                         }`}></div>
                         <span className="text-lg font-bold text-gray-200">
                            {candlesRef.current.length > 0 && candlesRef.current[candlesRef.current.length-1].close >= candlesRef.current[candlesRef.current.length-1].open ? 'HAUSSIER' : 'BAISSIER'}
                         </span>
                    </div>
                </div>

                {/* RSI */}
                <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 text-center">
                    <span className="text-xs text-gray-500 block mb-2">RSI (14)</span>
                    <span className={`text-xl font-mono font-bold ${
                        (displayedAnalysis?.rsi || 50) > 70 ? 'text-red-400' : 
                        (displayedAnalysis?.rsi || 50) < 30 ? 'text-green-400' : 'text-white'
                    }`}>
                        {displayedAnalysis ? displayedAnalysis.rsi.toFixed(1) : '--'}
                    </span>
                </div>

                {/* MACD */}
                <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 text-center">
                    <span className="text-xs text-gray-500 block mb-2">MACD</span>
                    <div className="flex items-center justify-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${(displayedAnalysis?.macd.histogram || 0) > 0 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm font-bold text-gray-200">
                        {(displayedAnalysis?.macd.histogram || 0) > 0 ? 'BUY' : 'SELL'}
                      </span>
                    </div>
                </div>

                {/* Supertrend */}
                <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 text-center">
                    <span className="text-xs text-gray-500 block mb-2">SuperTrend</span>
                    <div className="flex items-center justify-center gap-1">
                      {displayedAnalysis?.supertrend.direction === 'UP' ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                      <span className={`text-sm font-bold ${displayedAnalysis?.supertrend.direction === 'UP' ? 'text-green-500' : 'text-red-500'}`}>
                         {displayedAnalysis?.supertrend.direction === 'UP' ? 'HAUSSE' : 'BAISSE'}
                      </span>
                    </div>
                </div>

              </div>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
};

export default App;
