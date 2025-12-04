import { TraderProfile, TradeSignal, Timeframe } from '../types';

const NAMES = ['Alex T.', 'Sarah K.', 'Dmitri V.', 'Wei L.', 'John D.', 'Emma R.', 'Marco P.', 'Yuki S.'];
const AVATARS = [
    'https://picsum.photos/64/64?random=1',
    'https://picsum.photos/64/64?random=2',
    'https://picsum.photos/64/64?random=3',
    'https://picsum.photos/64/64?random=4',
    'https://picsum.photos/64/64?random=5',
    'https://picsum.photos/64/64?random=6',
    'https://picsum.photos/64/64?random=7',
    'https://picsum.photos/64/64?random=8',
];

export const getTopTraders = (currentSignal: TradeSignal, pair: string, timeframe: Timeframe): TraderProfile[] => {
  // Select 6 random traders
  const selectedIndices: number[] = [];
  while(selectedIndices.length < 6) {
    const r = Math.floor(Math.random() * NAMES.length);
    if(selectedIndices.indexOf(r) === -1) selectedIndices.push(r);
  }

  return selectedIndices.map(i => {
    // Bias the trader's signal towards the system signal to simulate "Best Traders" knowing what they are doing
    let traderSignal = TradeSignal.NEUTRAL;
    const rand = Math.random();

    if (currentSignal === TradeSignal.CALL) {
      // 70% chance to agree with CALL if they are a "top trader"
      traderSignal = rand > 0.3 ? TradeSignal.CALL : (rand > 0.15 ? TradeSignal.NEUTRAL : TradeSignal.PUT);
    } else if (currentSignal === TradeSignal.PUT) {
      traderSignal = rand > 0.3 ? TradeSignal.PUT : (rand > 0.15 ? TradeSignal.NEUTRAL : TradeSignal.CALL);
    } else {
      // If neutral, random distribution
      traderSignal = rand > 0.5 ? TradeSignal.CALL : TradeSignal.PUT;
    }

    return {
      id: `trader-${i}`,
      name: NAMES[i],
      rank: `#${Math.floor(Math.random() * 50) + 1}`,
      avatar: AVATARS[i],
      winRate: 75 + Math.floor(Math.random() * 20), // 75% - 95%
      currentSignal: traderSignal,
      pair: pair.split('USDT')[0] + '/USDT',
      timeframe: timeframe
    };
  });
};