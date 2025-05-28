import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { IPositionConfig, SudoDataAPI } from './sudoData';
import { joinSymbol } from './utils';
import {
  ALLOW_TRADE_CAN_TRADE,
  ALLOW_TRADE_MUST_TRADE,
  ALLOW_TRADE_NO_TRADE,
} from './consts';

export class SudoAPI extends SudoDataAPI {
  constructor(network: string = 'testnet', provider: SuiClient | null = null) {
    super(network, provider);
  }

  #processCoins = (tx: Transaction, coin: string, coinObjects: string[]) => {
    if (coin === 'sui') {
      return tx.gas;
    } else {
      if (coinObjects.length > 1) {
        tx.mergeCoins(
          tx.object(coinObjects[0]),
          coinObjects.slice(1).map((coinObject) => tx.object(coinObject))
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

  openPosition = async (
    collateralToken: string,
    indexToken: string,
    leverage: number,
    collateral: number,
    positionConfig: IPositionConfig,
    coinObjects: string[],
    long: boolean,
    indexPrice: number, // This can be the market price or limit price
    collateralPrice: number,
    pricesSlippage: number = 0.003,
    collateralSlippage: number = 0.5,
    isLimitOrder: boolean = false,
    isIocOrder: boolean = false,
    relayerFee: bigint = BigInt(1)
  ) => {
    const tx = await this.initOracleTxb([collateralToken, indexToken]);
    const coinObject = this.#processCoins(tx, collateralToken, coinObjects);

    const symbol = joinSymbol(long ? 'long' : 'short', indexToken);

    let effectiveLeverage = leverage;
    if (positionConfig?.maxLeverage === leverage) {
      effectiveLeverage = leverage * 0.999;
    }

    const realLeverage = leverage / (1 + positionConfig?.openFeeBps * leverage);

    const leveragedAmount =
      (collateral * collateralPrice * realLeverage) / indexPrice;

    const reserveAmount = BigInt(
      (
        collateral *
        Math.min(
          effectiveLeverage,
          positionConfig?.maxReservedMultiplier || 0
        ) *
        10 ** this.consts.coins[collateralToken].decimals
      ).toFixed(0)
    );

    const size = BigInt(
      (leveragedAmount * 10 ** this.consts.coins[indexToken].decimals).toFixed(
        0
      )
    );
    const collateralAmount = BigInt(
      (collateral * 10 ** this.consts.coins[collateralToken].decimals).toFixed(0)
    );

    const [depositObject] = tx.splitCoins(coinObject, [
      tx.pure.u64(collateralAmount),
    ]);
    const feeObject = tx.splitCoins(tx.gas, [tx.pure.u64(relayerFee)]);

    const adjustPrice = this.#processSlippage(
      indexPrice,
      long,
      isLimitOrder ? 0 : pricesSlippage
    );
    const adjustCollateralPrice = this.#processSlippage(
      collateralPrice,
      false,
      collateralSlippage
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
          this.consts.sudoCore.vaults[collateralToken].reservingFeeModel
        ),
        tx.object(this.consts.sudoCore.symbols[symbol].fundingFeeModel),
        tx.object(this.consts.sudoCore.symbols[symbol].positionConfig),
        tx.object(this.consts.pythFeeder.feeder[collateralToken]),
        tx.object(this.consts.pythFeeder.feeder[indexToken]),
        depositObject,
        feeObject,
        tx.pure.u8(allowTrade),
        tx.pure.u64(size),
        tx.pure.u64(reserveAmount),
        tx.pure.u256(adjustCollateralPrice),
        tx.pure.u256(adjustPrice),
        tx.pure.bool(isLimitOrder),
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
    long: boolean
  ) => {
    const tx = await this.initOracleTxb([collateralToken, indexToken]);
    const coinObject = this.#processCoins(tx, collateralToken, coinObjects);
    const [depositObject] = tx.splitCoins(coinObject, [tx.pure.u64(amount)]);

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
    long: boolean
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
          this.consts.sudoCore.vaults[collateralToken].reservingFeeModel
        ),
        tx.object(this.consts.sudoCore.symbols[symbol].fundingFeeModel),
        tx.object(this.consts.pythFeeder.feeder[collateralToken]),
        tx.object(this.consts.pythFeeder.feeder[indexToken]),
        tx.pure.u64(amount),
      ],
    });

    return tx;
  };

  decreasePosition = async (
    pcpId: string,
    collateralToken: string,
    indexToken: string,
    positionAmount: number,
    amount: bigint,
    long: boolean,
    marketPrice: number,
    indexPrice: number,
    collateralPrice: number,
    isTriggerOrder: boolean = false,
    isIocOrder: boolean = false,
    pricesSlippage: number = 0.003,
    collateralSlippage: number = 0.5,
    relayerFee: bigint = BigInt(1)
  ) => {
    const tx = await this.initOracleTxb([collateralToken, indexToken]);
    const symbol = joinSymbol(long ? 'long' : 'short', indexToken);
    const feeObject = tx.splitCoins(tx.gas, [tx.pure.u64(relayerFee)]);

    let isTakeProfitOrder =
      (!long && (indexPrice || 0) < marketPrice) ||
      (long && (indexPrice || 0) > marketPrice);

    const adjustPrice = this.#processSlippage(
      indexPrice,
      !long,
      isTriggerOrder ? 0 : pricesSlippage
    );
    const adjustCollateralPrice = this.#processSlippage(
      collateralPrice,
      false,
      collateralSlippage
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
          this.consts.sudoCore.vaults[collateralToken].reservingFeeModel
        ),
        tx.object(this.consts.sudoCore.symbols[symbol].fundingFeeModel),
        tx.object(this.consts.pythFeeder.feeder[collateralToken]),
        tx.object(this.consts.pythFeeder.feeder[indexToken]),
        feeObject,
        tx.pure.u8(allowTrade),
        tx.pure.bool(isTakeProfitOrder),
        tx.pure.u64(amount),
        tx.pure.u256(adjustCollateralPrice),
        tx.pure.u256(adjustPrice),
        tx.pure.bool(isTriggerOrder),
      ],
    });

    if (amount === BigInt(positionAmount) && !isTriggerOrder) {
      this.clearClosedPosition(pcpId, collateralToken, indexToken, long, tx);
    }

    return tx;
  };

  cancelOrder = async (
    orderCapId: string,
    collateralToken: string,
    indexToken: string,
    long: boolean,
    type: string
  ) => {
    const tx = new Transaction();
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
    fromCoinObjects: string[]
  ) => {
    const tx = await this.initOracleTxb(
      Object.keys(this.consts.sudoCore.vaults)
    );
    const fromCoinObject = this.#processCoins(tx, fromToken, fromCoinObjects);
    const [fromDepositObject] = tx.splitCoins(fromCoinObject, [
      tx.pure.u64(fromAmount),
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
        tx.pure.u64(0),
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
    tx: Transaction
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
    tx: Transaction
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
    tx: Transaction
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

  // admin method
  adminEmptyVault = async (
    collateralToken: string,
    timestamp: number = Math.floor(Date.now() / 1000)
  ) => {
    const tx = await this.initOracleTxb([collateralToken]);

    tx.moveCall({
      target: `${this.consts.sudoCore.upgradedPackage}::market::admin_empty_vault`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.adminCap),
        tx.object(this.consts.sudoCore.market),
        tx.object(this.consts.pythFeeder.feeder[collateralToken]),
        tx.pure.u64(timestamp),
      ],
    });

    return tx;
  };

    // admin method to remove vault from bag
  adminRemoveVaultFromBag = async (collateralToken: string) => {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.consts.sudoCore.upgradedPackage}::market::admin_remove_vault_from_bag`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.adminCap),
        tx.object(this.consts.sudoCore.market),
      ],
    });

    return tx;
  };
}
