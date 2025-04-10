import { bcs } from '@mysten/bcs';

export const Rate = bcs.u128();
export const Decimal = bcs.u256();

export const SDecimal = bcs.struct('SDecimal', {
  is_positive: bcs.bool(),
  value: bcs.u256(),
});

export const SRate = bcs.struct('SRate', {
  is_positive: bcs.bool(),
  value: bcs.u128(),
});

// Agg price
export const AggPrice = bcs.struct('AggPrice', {
  price: bcs.u256(), // Decimal
  precision: bcs.u64(),
});

// Market
export const VaultInfo = bcs.struct('VaultInfo', {
  price: AggPrice,
  value: bcs.u256(), // Decimal
});

export const VaultsValuation = bcs.struct('VaultsValuation', {
  timestamp: bcs.u64(),
  num: bcs.u64(),
  handled: bcs.vector(bcs.struct('Entry', {
    key: bcs.string(), // TypeName
    value: VaultInfo,
  })),
  total_weight: bcs.u256(), // Decimal
  value: bcs.u256(), // Decimal
});

export const SymbolsValuation = bcs.struct('SymbolsValuation', {
  timestamp: bcs.u64(),
  num: bcs.u64(),
  lp_supply_amount: bcs.u256(), // Decimal
  handled: bcs.vector(bcs.string()), // vector<TypeName>
  value: SDecimal,
});
