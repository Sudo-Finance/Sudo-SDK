import { BCS, getSuiMoveConfig } from '@mysten/bcs';
export const bcs = new BCS(getSuiMoveConfig());

//std
bcs.registerAlias('TypeName', BCS.STRING);

// VecMap
bcs.registerStructType(['Entry', 'K', 'V'], {
  key: 'K',
  value: 'V',
});

// Math
bcs.registerAlias('Decimal', BCS.U256);
bcs.registerAlias('Rate', BCS.U128);

bcs.registerStructType('SDecimal', {
  is_positive: BCS.BOOL,
  value: 'Decimal',
});

bcs.registerStructType('SRate', {
  is_positive: BCS.BOOL,
  value: 'Rate',
});

// Agg price
bcs.registerStructType('AggPrice', {
  price: 'Decimal',
  precision: BCS.U64,
});

// Market
bcs.registerStructType('VaultInfo', {
  price: 'AggPrice',
  value: 'Decimal',
});

bcs.registerStructType('VaultsValuation', {
  timestamp: BCS.U64,
  num: BCS.U64,
  handled: ['vector', 'Entry<TypeName,VaultInfo>'],
  total_weight: 'Decimal',
  value: 'Decimal',
});

bcs.registerStructType('SymbolsValuation', {
  timestamp: BCS.U64,
  num: BCS.U64,
  lp_supply_amount: 'Decimal',
  handled: 'vector<TypeName>',
  value: 'SDecimal',
});
