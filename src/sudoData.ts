import { BCS } from '@mysten/bcs';
import { bcs } from './bcs';
import {
  getProvider,
  joinSymbol,
  parseSymbolKey,
  parseValue,
  suiSymbolToSymbol,
} from './utils';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui.js/utils';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import { OracleAPI } from './oracle';

export interface IMarketInfo {
  lpSupply: string;
  positionId: string;
  vaultId: string;
  symbolId: string;
  lpSupplyWithDecimals: number;
  apr?: string;
}

export interface IVaultInfo {
  liquidity: number;
  reservedAmount: number;
  unrealisedReservingFeeAmount: number;
  accReservingRate: number;
  enabled: boolean;
  weight: number;
  lastUpdate: number;
}

export interface ISymbolInfo {
  openingSize: number;
  openingAmount: number;
  accFundingRate: number;
  realisedPnl: number;
  unrealisedFundingFeeValue: number;
  openEnabled: boolean;
  liquidateEnabled: boolean;
  decreaseEnabled: boolean;
  lastUpdate: number;
}

export interface IPositionInfo {
  id: string;
  long: boolean;
  owner: string;
  version: number;

  collateralToken: string;
  indexToken: string;

  collateralAmount: number;
  positionAmount: number;
  reservedAmount: number;

  positionSize: number;
  lastFundingRate: number;
  lastReservingRate: number;

  reservingFeeAmount: number;
  fundingFeeValue: number;

  closed: boolean;

  openTimestamp: number;

  protocol?: string;
}

export interface IPositionCapInfo {
  positionCapId: string;
  symbol0: string;
  symbol1: string;
  long: boolean;
}

export interface IOrderCapInfo {
  orderCapId: string;
  symbol0: string;
  symbol1: string;
  long: boolean;
  positionId: string | null;
}

export interface IOrderInfo {
  id: string;
  capId: string;
  executed: boolean;
  owner: string;
  collateralToken: string;
  indexToken: string;
  feeToken: string;
  collateralPriceThreshold: number;
  feeAmount: bigint;
  long: boolean;
  indexPrice: number;
  openOrder?: {
    reserveAmount: bigint;
    collateralAmount: bigint;
    openAmount: bigint;
  };
  decreaseOrder?: {
    decreaseAmount: bigint;
    takeProfit: boolean;
  };
  orderType: 'OPEN_POSITION' | 'DECREASE_POSITION';
  createdAt: number;
  protocol?: string;
  v11Order?: boolean; // used in ABEx
}

export interface IMarketValuationInfo {
  marketCap: number;
  slpPrice: number;
  slpSupply: number;
  apr?: number;
}

export interface IPositionConfig {
  decreaseFeeBps: number;
  liquidationBonus: number;
  liquidationThreshold: number;
  maxLeverage: number;
  minHoldingDuration: number;
  openFeeBps: number;
  maxReservedMultiplier: number;
  minCollateralValue: number;
}

export class SudoDataAPI extends OracleAPI {
  provider: SuiClient;

  constructor(network: string = 'testnet', provider: SuiClient | null = null) {
    super(network);
    if (provider) {
      this.provider = provider;
    } else {
      this.provider = getProvider(network);
    }
  }

  valuateVaults = (tx: TransactionBlock) => {
    const vaultsValuation = tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::create_vaults_valuation`,
      typeArguments: [`${this.consts.sudoCore.package}::slp::SLP`],
      arguments: [
        tx.object(SUI_CLOCK_OBJECT_ID),
        tx.object(this.consts.sudoCore.market),
      ],
    });
    for (const key of Object.keys(this.consts.sudoCore.vaults)) {
      const vault = this.consts.sudoCore.vaults[key];

      tx.moveCall({
        target: `${this.consts.sudoCore.package}::market::valuate_vault_v1_1`,
        typeArguments: [
          `${this.consts.sudoCore.package}::slp::SLP`,
          this.consts.coins[key].module,
        ],
        arguments: [
          tx.object(this.consts.sudoCore.market),
          tx.object(vault.reservingFeeModel),
          tx.object(this.consts.pythFeeder.feeder[key]),
          vaultsValuation,
        ],
      });
    }
    return vaultsValuation;
  };

  valuateSymbols = (tx: TransactionBlock) => {
    const symbolsValuation = tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::create_symbols_valuation`,
      typeArguments: [`${this.consts.sudoCore.package}::slp::SLP`],
      arguments: [
        tx.object(SUI_CLOCK_OBJECT_ID),
        tx.object(this.consts.sudoCore.market),
      ],
    });
    for (const key of Object.keys(this.consts.sudoCore.symbols)) {
      const [direction, token] = parseSymbolKey(key);
      const symbol = this.consts.sudoCore.symbols[key];
      tx.moveCall({
        target: `${this.consts.sudoCore.package}::market::valuate_symbol_v1_1`,
        typeArguments: [
          `${this.consts.sudoCore.package}::slp::SLP`,
          this.consts.coins[token].module,
          `${this.consts.sudoCore.package}::market::${direction.toUpperCase()}`,
        ],
        arguments: [
          tx.object(this.consts.sudoCore.market),
          tx.object(symbol.fundingFeeModel),
          tx.object(this.consts.pythFeeder.feeder[token]),
          symbolsValuation,
        ],
      });
    }
    return symbolsValuation;
  };

  valuate = (tx: TransactionBlock) => {
    const vaultsValuation = this.valuateVaults(tx);
    const symbolsValuation = this.valuateSymbols(tx);

    return {
      vaultsValuation,
      symbolsValuation,
    };
  };

  #parseVaultInfo(raw: any): IVaultInfo {
    const vaultFields = raw.data.content.fields.value.fields;

    return {
      liquidity: parseValue(vaultFields.liquidity),
      reservedAmount: parseValue(vaultFields.reserved_amount),
      unrealisedReservingFeeAmount: parseValue(
        vaultFields.unrealised_reserving_fee_amount,
      ),
      accReservingRate: parseValue(vaultFields.acc_reserving_rate),
      enabled: vaultFields.enabled,
      weight: parseValue(vaultFields.weight),
      lastUpdate: parseValue(vaultFields.last_update),
    };
  }

  #parseSymbolInfo(raw: any): ISymbolInfo {
    const fields = raw.data.content.fields.value.fields;

    return {
      openingSize: parseValue(fields.opening_size),
      openingAmount: parseValue(fields.opening_amount),
      accFundingRate: parseValue(fields.acc_funding_rate),
      realisedPnl: parseValue(fields.realised_pnl),
      unrealisedFundingFeeValue: parseValue(
        fields.unrealised_funding_fee_value,
      ),
      openEnabled: fields.open_enabled,
      liquidateEnabled: fields.liquidate_enabled,
      decreaseEnabled: fields.decrease_enabled,
      lastUpdate: parseValue(fields.last_update),
    };
  }

  #parsePositionConfig(raw: any): IPositionConfig {
    const positionConfigFields = raw.data.content.fields.inner.fields;

    return {
      decreaseFeeBps: parseValue(positionConfigFields.decrease_fee_bps),
      liquidationBonus: parseValue(positionConfigFields.liquidation_bonus),
      liquidationThreshold: parseValue(
        positionConfigFields.liquidation_threshold,
      ),
      maxLeverage: parseValue(positionConfigFields.max_leverage),
      minHoldingDuration: parseValue(positionConfigFields.min_holding_duration),
      openFeeBps: parseValue(positionConfigFields.open_fee_bps),
      maxReservedMultiplier: parseValue(
        positionConfigFields.max_reserved_multiplier,
      ),
      minCollateralValue: parseValue(positionConfigFields.min_collateral_value),
    };
  }

  async #parsePositionInfo(raw: any, id_: string): Promise<IPositionInfo> {
    const content = raw.data.content;
    const fields = content.fields;
    const positionFields = fields.value.fields;
    const dataType = fields.name.type;

    const positionInfo = {
      id: id_,
      long: dataType.includes('::market::LONG'),
      owner: fields.name.fields.owner,
      version: parseInt(raw.data.version, 10),
      collateralToken: suiSymbolToSymbol(
        dataType.split('<')[1].split(',')[0].trim(),
        this.consts,
      ),
      indexToken: suiSymbolToSymbol(dataType.split(',')[1].trim(), this.consts),
      collateralAmount: parseValue(positionFields.collateral),
      positionAmount: parseValue(positionFields.position_amount),
      reservedAmount: parseValue(positionFields.reserved),
      positionSize: parseValue(positionFields.position_size),
      lastFundingRate: parseValue(positionFields.last_funding_rate),
      lastReservingRate: parseValue(positionFields.last_reserving_rate),
      reservingFeeAmount: parseValue(positionFields.reserving_fee_amount),
      fundingFeeValue: parseValue(positionFields.funding_fee_value),
      closed: positionFields.closed,
      openTimestamp: parseValue(positionFields.open_timestamp),
      protocol: 'sudo',
    };

    if (!positionFields.closed) {
      try {
        positionInfo.reservingFeeAmount =
          await this.calcPositionReserveFeeAmount(positionInfo);
        positionInfo.fundingFeeValue =
          await this.calcPositionFundingFeeValue(positionInfo);
      } catch (e) {
        console.error(e);
        positionInfo.reservingFeeAmount = 0;
        positionInfo.fundingFeeValue = 0;
      }
    }

    return positionInfo;
  }

  #parseOrderInfo(raw: any, capId: string): IOrderInfo {
    let content = raw.data.content;
    let fields = content.fields.value.fields;

    // Extract tokens from dataType
    let dataType = content.type;

    const orderType = content.fields.value.type.includes('OpenPositionOrder')
      ? 'OPEN_POSITION'
      : 'DECREASE_POSITION';

    let ret: IOrderInfo = {
      id: content.fields.id.id,
      capId,
      executed: fields.executed,
      owner: content.fields.name.fields.owner,
      collateralToken: suiSymbolToSymbol(
        dataType.split('<')[2].split(',')[0].trim(),
        this.consts,
      ),
      indexToken: suiSymbolToSymbol(dataType.split(',')[1].trim(), this.consts),
      feeToken: suiSymbolToSymbol(
        dataType.split(',')[3].split('>')[0].trim(),
        this.consts,
      ),
      indexPrice: parseValue(fields.limited_index_price.fields.value / 1e18),
      collateralPriceThreshold: parseValue(fields.collateral_price_threshold),
      feeAmount: BigInt(fields.fee),
      long: dataType.includes('::market::LONG'),
      orderType,
      createdAt: parseValue(fields.created_at),
      protocol: 'sudo',
    };

    if (orderType === 'OPEN_POSITION') {
      ret.openOrder = {
        reserveAmount: BigInt(fields.reserve_amount),
        collateralAmount: BigInt(fields.collateral),
        openAmount: BigInt(fields.open_amount),
      };
    } else {
      ret.decreaseOrder = {
        decreaseAmount: BigInt(fields.decrease_amount),
        takeProfit: fields.take_profit,
      };
    }

    return ret;
  }

  public async getVaultInfo(vaultToken: string) {
    const rawData = await this.provider.getDynamicFieldObject({
      parentId: this.consts.sudoCore.vaultsParent,
      name: {
        type: `${this.consts.sudoCore.package}::market::VaultName<${this.consts.coins[vaultToken].module}>`,
        value: { dummy_field: false },
      },
    });
    const vaultInfo = this.#parseVaultInfo(rawData);
    return vaultInfo;
  }

  public async getSymbolInfo(indexToken: string, long: boolean) {
    const rawData = await this.provider.getDynamicFieldObject({
      parentId: this.consts.sudoCore.symbolsParent,
      name: {
        type: `${this.consts.sudoCore.package}::market::SymbolName<${
          this.consts.coins[indexToken].module
        }, ${this.consts.sudoCore.package}::market::${
          long ? 'LONG' : 'SHORT'
        }>`,
        value: { dummy_field: false },
      },
    });

    return this.#parseSymbolInfo(rawData);
  }

  public async getPositionConfig(indexToken: string, long: boolean) {
    const symbol = joinSymbol(long ? 'long' : 'short', indexToken);

    const rawData = await this.provider.getObject({
      id: this.consts.sudoCore.symbols[symbol].positionConfig,
      options: {
        showContent: true,
      },
    });
    return this.#parsePositionConfig(rawData);
  }

  public async getPositionCapInfoList(
    owner: string,
  ): Promise<IPositionCapInfo[]> {
    const positionCaps = await this.provider.getOwnedObjects({
      owner,
      filter: {
        StructType: `${this.consts.sudoCore.package}::market::PositionCap`,
      },
      options: {
        showType: true,
      },
    });
    const positionCapInfoList = [];

    for (const positionCap of positionCaps.data) {
      if (positionCap.data?.type?.includes('PositionCap')) {
        positionCapInfoList.push({
          positionCapId: positionCap.data.objectId,
          symbol0: positionCap.data.type.split('<')[1].split(',')[0].trim(),
          symbol1: positionCap.data.type
            .split('<')[1]
            .split(',')[1]
            .split(',')[0]
            .trim(),
          long: positionCap.data.type.includes('LONG'),
        });
      }
    }

    return positionCapInfoList;
  }

  public async getPositionInfoList(
    positionCapInfoList: IPositionCapInfo[],
    owner: string,
  ) {
    const positionInfoList: IPositionInfo[] = [];
    await Promise.all(
      positionCapInfoList.map(async positionCapInfo => {
        const positionRaw = await this.provider.getDynamicFieldObject({
          parentId: this.consts.sudoCore.positionsParent,
          name: {
            type: `${this.consts.sudoCore.package}::market::PositionName<${
              positionCapInfo.symbol0
            }, ${positionCapInfo.symbol1}, ${
              this.consts.sudoCore.package
            }::market::${positionCapInfo.long ? 'LONG' : 'SHORT'}>`,
            value: {
              owner,
              id: positionCapInfo.positionCapId,
            },
          },
        });
        positionInfoList.push(
          await this.#parsePositionInfo(
            positionRaw,
            positionCapInfo.positionCapId,
          ),
        );
      }),
    );

    return positionInfoList.sort((a, b) =>
      a.openTimestamp > b.openTimestamp ? 1 : -1,
    );
  }

  public async getOrderCapInfoList(owner: string) {
    const orderCaps = await this.provider.getOwnedObjects({
      owner,
      filter: {
        StructType: `${this.consts.sudoCore.package}::market::OrderCap`,
      },
      options: {
        showType: true,
        showContent: true,
      },
    });
    const orderCapInfoList = [];
    for (const orderCap of orderCaps.data) {
      if (orderCap.data?.type?.includes('OrderCap')) {
        orderCapInfoList.push({
          orderCapId: orderCap.data.objectId,
          symbol0: orderCap.data.type.split('<')[1].split(',')[0].trim(),
          symbol1: orderCap.data.type
            .split('<')[1]
            .split(',')[1]
            .split(',')[0]
            .trim(),
          long: orderCap.data.type.includes('LONG'),
          positionId: (orderCap.data.content as any)?.fields?.position_id,
        });
      }
    }
    return orderCapInfoList;
  }

  public async getOrderInfoList(
    orderCapInfoList: IOrderCapInfo[],
    owner: string,
  ) {
    const orderInfoList: IOrderInfo[] = [];
    await Promise.all(
      orderCapInfoList.map(async orderCapInfo => {
        const orderRaw = await this.provider.getDynamicFieldObject({
          parentId: this.consts.sudoCore.ordersParent,
          name: {
            type: `${this.consts.sudoCore.package}::market::OrderName<${
              orderCapInfo.symbol0
            }, ${orderCapInfo.symbol1}, ${
              this.consts.sudoCore.package
            }::market::${orderCapInfo.long ? 'LONG' : 'SHORT'}, ${
              this.consts.coins['sui'].module
            }>`,
            value: {
              owner,
              id: orderCapInfo.orderCapId,
              position_id: {
                vec: orderCapInfo.positionId ? [orderCapInfo.positionId] : [],
              },
            },
          },
        });
        orderInfoList.push(
          this.#parseOrderInfo(orderRaw, orderCapInfo.orderCapId),
        );
      }),
    );
    return orderInfoList.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  }

  simValuate = async (sender: string) => {
    const tx = await this.initOracleTxb(
      Object.keys(this.consts.pythFeeder.feeder),
    );
    this.valuate(tx);
    const res = await this.provider.devInspectTransactionBlock({
      transactionBlock: tx,
      sender,
    });

    const symbolsValuationOffset =
      Object.keys(this.consts.sudoCore.symbols).length + 1;

    const vaultsValuation = bcs.de(
      'VaultsValuation',
      new Uint8Array(
        (
          (res.results as any)[
            (res.results?.length || 0) - symbolsValuationOffset - 1
          ].mutableReferenceOutputs as any
        )[1][1],
      ),
    );

    const symbolsValuation = bcs.de(
      'SymbolsValuation',
      new Uint8Array(
        (
          (res.results as any)[(res.results?.length || 0) - 1]
            .mutableReferenceOutputs as any
        )[1][1],
      ),
    );

    const result =
      Number(
        BigInt(vaultsValuation.value) +
          BigInt(symbolsValuation.value.value) *
            BigInt(symbolsValuation.value.is_positive ? 1 : -1),
      ) / 1e18;
    return result;
  };

  simValuateVaults = async (sender: string) => {
    const tx = await this.initOracleTxb(
      Object.keys(this.consts.sudoCore.vaults),
    );
    this.valuateVaults(tx);

    const res = await this.provider.devInspectTransactionBlock({
      transactionBlock: tx,
      sender,
    });
    const vaultsValuation = bcs.de(
      'VaultsValuation',
      new Uint8Array(
        (
          (res.results as any)[(res.results?.length || 0) - 1]
            .mutableReferenceOutputs as any
        )[1][1],
      ),
    );

    const result = Number(BigInt(vaultsValuation.value)) / 1e18;
    return result;
  };

  fundingFeeRate = async (
    sender: string,
    indexToken: string,
    long: boolean,
  ) => {
    const tx = await this.initOracleTxb([indexToken]);
    const symbol_ = joinSymbol(long ? 'long' : 'short', indexToken);
    const currentTimestamp = parseInt((+new Date() / 1000).toFixed(0));
    const symbol = tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::symbol`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[indexToken].module,
        `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
      ],
      arguments: [tx.object(this.consts.sudoCore.market)],
    });
    const aggPriceConfig = tx.moveCall({
      target: `${this.consts.sudoCore.package}::pool::symbol_price_config`,
      typeArguments: [],
      arguments: [symbol],
    });
    const aggPrice = tx.moveCall({
      target: `${this.consts.sudoCore.package}::agg_price::parse_pyth_feeder_v1_1`,
      typeArguments: [],
      arguments: [
        aggPriceConfig,
        tx.object(this.consts.pythFeeder.feeder[indexToken]),
        tx.pure(currentTimestamp, BCS.U64),
      ],
    });
    const deltaSize = tx.moveCall({
      target: `${this.consts.sudoCore.package}::pool::symbol_delta_size`,
      typeArguments: [],
      arguments: [symbol, aggPrice, tx.pure(long)],
    });
    const LpSupplyAmount = tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::lp_supply_amount`,
      typeArguments: [`${this.consts.sudoCore.package}::slp::SLP`],
      arguments: [tx.object(this.consts.sudoCore.market)],
    });
    const PnlPerLp = tx.moveCall({
      target: `${this.consts.sudoCore.package}::pool::symbol_pnl_per_lp`,
      typeArguments: [],
      arguments: [symbol, deltaSize, LpSupplyAmount],
    });
    tx.moveCall({
      target: `${this.consts.sudoCore.package}::model::compute_funding_fee_rate`,
      arguments: [
        tx.object(this.consts.sudoCore.symbols[symbol_].fundingFeeModel),
        PnlPerLp,
        tx.pure(8 * 3600, BCS.U64),
      ],
    });

    const res: any = await this.provider.devInspectTransactionBlock({
      transactionBlock: tx,
      sender,
    });

    const de = bcs.de(
      'SRate',
      new Uint8Array(res.results[res.results.length - 1].returnValues[0][0]),
    );

    return (Number(BigInt(de.value)) / 1e18) * (de.is_positive ? 1 : -1);
  };

  rebaseFeeRate = async (
    sender: string,
    collateralToken: string,
    increase: boolean,
    amount: bigint = BigInt(0),
  ) => {
    const tx1 = await this.initOracleTxb(
      Object.keys(this.consts.pythFeeder.feeder),
    );
    this.valuateVaults(tx1);
    const res1 = await this.provider.devInspectTransactionBlock({
      transactionBlock: tx1,
      sender,
    });
    const vaultsValuation = bcs.de(
      'VaultsValuation',
      new Uint8Array(
        (
          (res1.results as any)[(res1.results?.length || 0) - 1]
            .mutableReferenceOutputs as any
        )[1][1],
      ),
    );
    const singleVaultValue =
      BigInt(
        vaultsValuation.handled.find((item: any) =>
          item.key.includes(this.consts.coins[collateralToken].module.slice(2)),
        )?.value.value,
      ) + amount;
    const allVaultValue = BigInt(vaultsValuation.value) + amount;
    const singleVaultWeight = BigInt(
      this.consts.sudoCore.vaults[collateralToken].weight,
    );
    const allVaultWeight = BigInt(vaultsValuation.total_weight);
    const tx2 = new TransactionBlock();
    tx2.moveCall({
      target: `${this.consts.sudoCore.package}::pool::compute_rebase_fee_rate`,
      arguments: [
        tx2.object(this.consts.sudoCore.rebaseFeeModel),
        tx2.pure(increase),
        tx2.pure(singleVaultValue, BCS.U256),
        tx2.pure(allVaultValue, BCS.U256),
        tx2.pure(singleVaultWeight, BCS.U256),
        tx2.pure(allVaultWeight, BCS.U256),
      ],
    });
    const res2: any = await this.provider.devInspectTransactionBlock({
      transactionBlock: tx2,
      sender,
    });
    const de = bcs.de(
      'Rate',
      new Uint8Array(res2.results[res2.results.length - 1].returnValues[0][0]),
    );
    return Number(BigInt(de)) / 1e18;
  };

  calcPositionReserveFeeAmount = async (position: IPositionInfo) => {
    const tx = await this.initOracleTxb([
      position.indexToken,
      position.collateralToken,
    ]);
    const vault = tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::vault`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[position.collateralToken].module,
      ],
      arguments: [tx.object(this.consts.sudoCore.market)],
    });
    const pos = tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::position`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[position.collateralToken].module,
        this.consts.coins[position.indexToken].module,
        `${this.consts.sudoCore.package}::market::${
          position.long ? 'LONG' : 'SHORT'
        }`,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.market),
        tx.object(position.id),
        tx.pure(position.owner),
      ],
    });
    const vaultDeltaReservingRate = tx.moveCall({
      target: `${this.consts.sudoCore.package}::pool::vault_delta_reserving_rate`,
      typeArguments: [this.consts.coins[position.collateralToken].module],
      arguments: [
        vault,
        tx.object(
          this.consts.sudoCore.vaults[position.collateralToken]
            .reservingFeeModel,
        ),
        tx.pure((+new Date() / 1000).toFixed(0), BCS.U64),
      ],
    });
    const vaultAccReservingRate = tx.moveCall({
      target: `${this.consts.sudoCore.package}::pool::vault_acc_reserving_rate`,
      typeArguments: [this.consts.coins[position.collateralToken].module],
      arguments: [vault, vaultDeltaReservingRate],
    });
    tx.moveCall({
      target: `${this.consts.sudoCore.package}::position::compute_reserving_fee_amount`,
      typeArguments: [this.consts.coins[position.collateralToken].module],
      arguments: [pos, vaultAccReservingRate],
    });
    const res: any = await this.provider.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: position.owner,
    });
    const de = bcs.de(
      BCS.U256,
      new Uint8Array(res.results[res.results.length - 1].returnValues[0][0]),
    );
    return parseInt((Number(BigInt(de)) / 1e18).toFixed(0));
  };

  calcPositionFundingFeeValue = async (position: IPositionInfo) => {
    const tx = await this.initOracleTxb([
      position.indexToken,
      position.collateralToken,
    ]);
    const symbol = tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::symbol`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[position.indexToken].module,
        `${this.consts.sudoCore.package}::market::${
          position.long ? 'LONG' : 'SHORT'
        }`,
      ],
      arguments: [tx.object(this.consts.sudoCore.market)],
    });
    const pos = tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::position`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[position.collateralToken].module,
        this.consts.coins[position.indexToken].module,
        `${this.consts.sudoCore.package}::market::${
          position.long ? 'LONG' : 'SHORT'
        }`,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.market),
        tx.object(position.id),
        tx.pure(position.owner),
      ],
    });
    const aggPriceConfig = tx.moveCall({
      target: `${this.consts.sudoCore.package}::pool::symbol_price_config`,
      typeArguments: [],
      arguments: [symbol],
    });
    const lpSupplyAmount = tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::lp_supply_amount`,
      typeArguments: [`${this.consts.sudoCore.package}::slp::SLP`],
      arguments: [tx.object(this.consts.sudoCore.market)],
    });
    const appPrice = tx.moveCall({
      target: `${this.consts.sudoCore.package}::agg_price::parse_pyth_feeder_v1_1`,
      typeArguments: [],
      arguments: [
        aggPriceConfig,
        tx.object(this.consts.pythFeeder.feeder[position.indexToken]),
        tx.pure((+new Date() / 1000).toFixed(0), BCS.U64),
      ],
    });
    const symbolDeltaSize = tx.moveCall({
      target: `${this.consts.sudoCore.package}::pool::symbol_delta_size`,
      typeArguments: [],
      arguments: [symbol, appPrice, tx.pure(position.long)],
    });
    const symbolDeltaFundingRate = tx.moveCall({
      target: `${this.consts.sudoCore.package}::pool::symbol_delta_funding_rate`,
      typeArguments: [],
      arguments: [
        symbol,
        tx.object(
          this.consts.sudoCore.symbols[
            joinSymbol(position.long ? 'long' : 'short', position.indexToken)
          ].fundingFeeModel,
        ),
        symbolDeltaSize,
        lpSupplyAmount,
        tx.pure((+new Date() / 1000).toFixed(0), BCS.U64),
      ],
    });
    const symbolAccFundingRate = tx.moveCall({
      target: `${this.consts.sudoCore.package}::pool::symbol_acc_funding_rate`,
      typeArguments: [],
      arguments: [symbol, symbolDeltaFundingRate],
    });
    tx.moveCall({
      target: `${this.consts.sudoCore.package}::position::compute_funding_fee_value`,
      typeArguments: [this.consts.coins[position.collateralToken].module],
      arguments: [pos, symbolAccFundingRate],
    });
    const res: any = await this.provider.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: position.owner,
    });

    if (res.error) {
      throw new Error(res.error);
    }
    const de = bcs.de(
      'SDecimal',
      new Uint8Array(res.results[res.results.length - 1].returnValues[0][0]),
    );
    return (Number(BigInt(de.value)) * (de.is_positive ? 1 : -1)) / 1e18;
  };
}
