import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui.js/utils';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import { DataAPI } from './data';
import { joinSymbol } from './utils';
import { BCS } from '@mysten/bcs';
import {
  ALLOW_TRADE_CAN_TRADE,
  ALLOW_TRADE_MUST_TRADE,
  ALLOW_TRADE_NO_TRADE,
} from './consts';

export class API extends DataAPI {
  constructor(network: string = 'testnet', provider: SuiClient | null = null) {
    super(network, provider);
  }

  #processCoins = (
    tx: TransactionBlock,
    coin: string,
    coinObjects: string[],
  ) => {
    if (coin === 'sui') {
      return tx.gas;
    } else {
      if (coinObjects.length > 1) {
        tx.mergeCoins(
          tx.object(coinObjects[0]),
          coinObjects.slice(1).map(coinObject => tx.object(coinObject)),
        );
      }
      return tx.object(coinObjects[0]);
    }
  };

  #processSlippage(indexPrice: number, long: boolean, slippage: number) {
    const raw = long
      ? indexPrice * (1 + slippage)
      : indexPrice * (1 - slippage);
    return BigInt(Math.round(raw * 1e18));
  }

  deposit = async (
    coin: string,
    coinObjects: string[],
    amount: number,
    minAmountOut: number = 0,
  ) => {
    const tx = await this.initOracleTxb(
      Object.keys(this.consts.pythFeeder.feeder),
    );
    const coinObject = this.#processCoins(tx, coin, coinObjects);
    const [depositObject] = tx.splitCoins(coinObject, [tx.pure(amount)]);

    const { vaultsValuation, symbolsValuation } = this.valuate(tx);

    tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::deposit`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[coin].module,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.market),
        tx.object(this.consts.sudoCore.rebaseFeeModel),
        depositObject,
        tx.pure(minAmountOut),
        vaultsValuation,
        symbolsValuation,
      ],
    });
    return tx;
  };

  withdraw = async (
    coin: string,
    alpCoinObjects: string[],
    amount: number,
    minAmountOut: number = 0,
  ) => {
    const tx = await this.initOracleTxb(
      Object.keys(this.consts.pythFeeder.feeder),
    );
    const alpCoinObject = this.#processCoins(tx, 'slp', alpCoinObjects);
    const [withdrawObject] = tx.splitCoins(alpCoinObject, [tx.pure(amount)]);

    const { vaultsValuation, symbolsValuation } = this.valuate(tx);

    tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::withdraw`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[coin].module,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.market),
        tx.object(this.consts.sudoCore.rebaseFeeModel),
        withdrawObject,
        tx.pure(minAmountOut),
        vaultsValuation,
        symbolsValuation,
      ],
    });
    return tx;
  };

  openPosition = async (
    collateralToken: string,
    indexToken: string,
    size: bigint,
    collateralAmount: bigint,
    coinObjects: string[],
    long: boolean,
    reserveAmount: bigint,
    indexPrice: number,
    collateralPrice: number,
    pricesSlippage: number = 0.003,
    collateralSlippage: number = 0.5,
    isLimitOrder: boolean = false,
    isIocOrder: boolean = false,
    relayerFee: bigint = BigInt(1),
  ) => {
    const tx = await this.initOracleTxb([collateralToken, indexToken]);
    const coinObject = this.#processCoins(tx, collateralToken, coinObjects);
    const [depositObject] = tx.splitCoins(coinObject, [
      tx.pure(collateralAmount),
    ]);
    const feeObject = tx.splitCoins(tx.gas, [tx.pure(relayerFee)]);

    const symbol = joinSymbol(long ? 'long' : 'short', indexToken);
    const adjustPrice = this.#processSlippage(
      indexPrice,
      long,
      isLimitOrder ? 0 : pricesSlippage,
    );
    const adjustCollateralPrice = this.#processSlippage(
      collateralPrice,
      false,
      collateralSlippage,
    );

    let allowTrade = ALLOW_TRADE_MUST_TRADE;
    if (isLimitOrder) {
      if (isIocOrder) {
        allowTrade = ALLOW_TRADE_NO_TRADE;
      } else {
        allowTrade = ALLOW_TRADE_CAN_TRADE;
      }
    }

    tx.moveCall({
      target: `${this.consts.sudoCore.upgradedPackage}::market::open_position_v1_2`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
        this.consts.coins[indexToken].module,
        `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
        this.consts.coins['sui'].module,
      ],
      arguments: [
        tx.object(SUI_CLOCK_OBJECT_ID),
        tx.object(this.consts.sudoCore.market),
        tx.object(
          this.consts.sudoCore.vaults[collateralToken].reservingFeeModel,
        ),
        tx.object(this.consts.sudoCore.symbols[symbol].fundingFeeModel),
        tx.object(this.consts.sudoCore.symbols[symbol].positionConfig),
        tx.object(this.consts.pythFeeder.feeder[collateralToken]),
        tx.object(this.consts.pythFeeder.feeder[indexToken]),
        depositObject,
        feeObject,
        tx.pure(allowTrade, BCS.U8),
        tx.pure(size),
        tx.pure(reserveAmount),
        tx.pure(adjustCollateralPrice, BCS.U256),
        tx.pure(adjustPrice, BCS.U256),
        tx.pure(isLimitOrder, BCS.BOOL),
      ],
    });
    return tx;
  };

  pledgeInPosition = async (
    pcpId: string,
    collateralToken: string,
    indexToken: string,
    amount: number,
    coinObjects: string[],
    long: boolean,
  ) => {
    const tx = await this.initOracleTxb([collateralToken, indexToken]);
    const coinObject = this.#processCoins(tx, collateralToken, coinObjects);
    const [depositObject] = tx.splitCoins(coinObject, [tx.pure(amount)]);

    tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::pledge_in_position`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
        this.consts.coins[indexToken].module,
        `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.market),
        tx.object(pcpId),
        depositObject,
      ],
    });
    return tx;
  };

  redeemFromPosition = async (
    pcpId: string,
    collateralToken: string,
    indexToken: string,
    amount: number,
    long: boolean,
  ) => {
    const tx = await this.initOracleTxb([collateralToken, indexToken]);
    const symbol = joinSymbol(long ? 'long' : 'short', indexToken);

    tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::redeem_from_position_v1_1`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
        this.consts.coins[indexToken].module,
        `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
      ],
      arguments: [
        tx.object(SUI_CLOCK_OBJECT_ID),
        tx.object(this.consts.sudoCore.market),
        tx.object(pcpId),
        tx.object(
          this.consts.sudoCore.vaults[collateralToken].reservingFeeModel,
        ),
        tx.object(this.consts.sudoCore.symbols[symbol].fundingFeeModel),
        tx.object(this.consts.pythFeeder.feeder[collateralToken]),
        tx.object(this.consts.pythFeeder.feeder[indexToken]),
        tx.pure(amount),
      ],
    });

    return tx;
  };

  decreasePosition = async (
    pcpId: string,
    collateralToken: string,
    indexToken: string,
    amount: bigint,
    long: boolean,
    indexPrice: number,
    collateralPrice: number,
    isTriggerOrder: boolean = false,
    isTakeProfitOrder: boolean = true,
    isIocOrder: boolean = false,
    pricesSlippage: number = 0.003,
    collateralSlippage: number = 0.5,
    relayerFee: bigint = BigInt(1),
  ) => {
    const tx = await this.initOracleTxb([collateralToken, indexToken]);
    const symbol = joinSymbol(long ? 'long' : 'short', indexToken);
    const feeObject = tx.splitCoins(tx.gas, [tx.pure(relayerFee)]);

    const adjustPrice = this.#processSlippage(
      indexPrice,
      !long,
      isTriggerOrder ? 0 : pricesSlippage,
    );
    const adjustCollateralPrice = this.#processSlippage(
      collateralPrice,
      false,
      collateralSlippage,
    );

    let allowTrade = ALLOW_TRADE_MUST_TRADE;
    if (isTriggerOrder) {
      if (isIocOrder || !isTakeProfitOrder) {
        allowTrade = ALLOW_TRADE_NO_TRADE;
      } else {
        allowTrade = ALLOW_TRADE_CAN_TRADE;
      }
    } else {
      isTakeProfitOrder = true;
    }

    tx.moveCall({
      target: `${this.consts.sudoCore.upgradedPackage}::market::decrease_position_v1_2`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
        this.consts.coins[indexToken].module,
        `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
        this.consts.coins['sui'].module,
      ],
      arguments: [
        tx.object(SUI_CLOCK_OBJECT_ID),
        tx.object(this.consts.sudoCore.market),
        tx.object(pcpId),
        tx.object(
          this.consts.sudoCore.vaults[collateralToken].reservingFeeModel,
        ),
        tx.object(this.consts.sudoCore.symbols[symbol].fundingFeeModel),
        tx.object(this.consts.pythFeeder.feeder[collateralToken]),
        tx.object(this.consts.pythFeeder.feeder[indexToken]),
        feeObject,
        tx.pure(allowTrade, BCS.U8),
        tx.pure(isTakeProfitOrder),
        tx.pure(amount),
        tx.pure(adjustCollateralPrice, BCS.U256),
        tx.pure(adjustPrice, BCS.U256),
        tx.pure(isTriggerOrder, BCS.BOOL),
      ],
    });

    return tx;
  };

  cancelOrder = async (
    orderCapId: string,
    collateralToken: string,
    indexToken: string,
    long: boolean,
    type: string,
  ) => {
    const tx = new TransactionBlock();
    let functionName = '';
    switch (type) {
      case 'OPEN_POSITION':
        functionName = 'clear_open_position_order_v1_1';
        break;
      case 'DECREASE_POSITION':
        functionName = 'clear_decrease_position_order_v1_1';
        break;
      default:
        throw new Error('invalid order type');
    }
    tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::${functionName}`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
        this.consts.coins[indexToken].module,
        `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
        this.consts.coins['sui'].module,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.market),
        tx.object(orderCapId),
      ],
    });
    return tx;
  };

  swap = async (
    fromToken: string,
    toToken: string,
    fromAmount: bigint,
    fromCoinObjects: string[],
  ) => {
    const tx = await this.initOracleTxb(
      Object.keys(this.consts.sudoCore.vaults),
    );
    const fromCoinObject = this.#processCoins(tx, fromToken, fromCoinObjects);
    const [fromDepositObject] = tx.splitCoins(fromCoinObject, [
      tx.pure(fromAmount),
    ]);
    const vaultsValuation = this.valuateVaults(tx);

    tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::swap`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[fromToken].module,
        this.consts.coins[toToken].module,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.market),
        tx.object(this.consts.sudoCore.rebaseFeeModel),
        fromDepositObject,
        // FIXME: minAmountOut
        tx.pure(0),
        vaultsValuation,
      ],
    });
    return tx;
  };

  clearClosedPosition = async (
    pcpId: string,
    collateralToken: string,
    indexToken: string,
    long: boolean,
    tx: TransactionBlock,
  ) => {
    tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::clear_closed_position`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
        this.consts.coins[indexToken].module,
        `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
      ],
      arguments: [tx.object(this.consts.sudoCore.market), tx.object(pcpId)],
    });
  };

  clearOpenPositionOrder = async (
    orderCapId: string,
    collateralToken: string,
    indexToken: string,
    long: boolean,
    tx: TransactionBlock,
  ) => {
    tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::clear_open_position_order_v1_1`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
        this.consts.coins[indexToken].module,
        `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
        this.consts.coins['sui'].module,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.market),
        tx.object(orderCapId),
      ],
    });
  };

  clearDecreasePositionOrder = async (
    orderCapId: string,
    collateralToken: string,
    indexToken: string,
    long: boolean,
    tx: TransactionBlock,
  ) => {
    tx.moveCall({
      target: `${this.consts.sudoCore.package}::market::clear_decrease_position_order_v1_1`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
        this.consts.coins[indexToken].module,
        `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
        this.consts.coins['sui'].module,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.market),
        tx.object(orderCapId),
      ],
    });
  };
}
