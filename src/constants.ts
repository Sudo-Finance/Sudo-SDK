export const TOKENS = [
  {
    name: 'Sui',
    symbol: 'sui',
    symbolDisplay: 'SUI',
    tradingViewSymbol: 'SUIUSD',
    isMarketHourRestricted: false,
  },
  {
    name: 'Cetus',
    symbol: 'cetus',
    symbolDisplay: 'CETUS',
    tradingViewSymbol: 'CETUSUSD',
    isMarketHourRestricted: false,
  },
  {
    name: 'Tether',
    symbol: 'usdt',
    symbolDisplay: 'USDT',
    tradingViewSymbol: 'USDTUSD',
    isMarketHourRestricted: false,
  },
  {
    name: 'Sudo Liquidity Token',
    symbol: 'slp',
    symbolDisplay: 'SLP',
    isMarketHourRestricted: true,
  },
  {
    name: 'AAPL',
    symbol: 'aapl',
    symbolDisplay: 'AAPL',
    tradingViewSymbol: 'AAPL',
    isMarketHourRestricted: true,
  },
  {
    name: 'TSLA',
    symbol: 'tsla',
    symbolDisplay: 'TSLA',
    tradingViewSymbol: 'TSLA',
    isMarketHourRestricted: true,
  },
  {
    name: 'META',
    symbol: 'meta',
    symbolDisplay: 'META',
    tradingViewSymbol: 'META',
    isMarketHourRestricted: true,
  },
  {
    name: 'USD',
    symbol: 'usd',
    symbolDisplay: 'USD',
    isMarketHourRestricted: true,
  },
  {
    name: 'USDC',
    symbol: 'usdc',
    symbolDisplay: 'USDC',
    tradingViewSymbol: 'USDCUSD',
    isMarketHourRestricted: false,
  },
];

export enum SudoEventType {
  // Position
  PositionClaimed = 'PositionClaimed',
  // Pool
  Deposited = 'Deposited',
  Withdrawn = 'Withdrawn',
  Swapped = 'Swapped',
  // Order
  OrderCreated = 'OrderCreated',
  OrderExecuted = 'OrderExecuted',
  OrderCleared = 'OrderCleared',
}

export enum PositionEventType {
  OpenPositionSuccessEvent = 'OpenPositionSuccessEvent',
  OpenPositionFailedEvent = 'OpenPositionFailedEvent',
  DecreasePositionSuccessEvent = 'DecreasePositionSuccessEvent',
  DecreasePositionFailedEvent = 'DecreasePositionFailedEvent',
  DecreaseReservedFromPositionEvent = 'DecreaseReservedFromPositionEvent',
  PledgeInPositionEvent = 'PledgeInPositionEvent',
  RedeemFromPositionEvent = 'RedeemFromPositionEvent',
  LiquidatePositionEvent = 'LiquidatePositionEvent',
}
