import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { IPositionConfig, SudoDataAPI } from './sudoData';
import { joinSymbol } from './utils';
import {
  ALLOW_TRADE_CAN_TRADE,
  ALLOW_TRADE_MUST_TRADE,
  ALLOW_TRADE_NO_TRADE,
  ICredential,
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
    const [depositObject] = tx.splitCoins(coinObject, [tx.pure.u64(amount)]);

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
        tx.pure.u64(minAmountOut),
        vaultsValuation,
        symbolsValuation,
      ],
    });
    return tx;
  };

  withdraw = async (
    coin: string,
    slpCoinObjects: string[],
    amount: number,
    minAmountOut: number = 0,
  ) => {
    const tx = await this.initOracleTxb(
      Object.keys(this.consts.pythFeeder.feeder),
    );
    const slpCoinObject = this.#processCoins(tx, 'slp', slpCoinObjects);
    const [withdrawObject] = tx.splitCoins(slpCoinObject, [
      tx.pure.u64(amount),
    ]);

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
        tx.pure.u64(minAmountOut),
        vaultsValuation,
        symbolsValuation,
      ],
    });
    return tx;
  };

  // staking
  stakeSlp = async (coinObjects: string[], amount: bigint, pool: string) => {
    const tx = new Transaction();
    const coinObject = this.#processCoins(tx, 'slp', coinObjects);
    const [depositObject] = tx.splitCoins(coinObject, [tx.pure.u64(amount)]);

    tx.moveCall({
      target: `${this.consts.sudoStaking.package}::pool::deposit`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        `${this.consts.sudoCore.package}::slp::SLP`,
      ],
      arguments: [
        tx.object(pool),
        tx.object(SUI_CLOCK_OBJECT_ID),
        depositObject,
      ],
    });
    return tx;
  };

  unstakeSlp = async (
    credentials: ICredential[],
    amount: bigint,
    pool: string,
  ) => {
    const tx = new Transaction();

    for (const credential of credentials) {
      // eslint-disable-next-line unicorn/prefer-math-min-max
      const withdrawAmount =
        amount < credential.amount ? amount : credential.amount;
      amount -= withdrawAmount;
      tx.moveCall({
        target: `${this.consts.sudoStaking.package}::pool::withdraw`,
        typeArguments: [
          `${this.consts.sudoCore.package}::slp::SLP`,
          `${this.consts.sudoCore.package}::slp::SLP`,
        ],
        arguments: [
          tx.object(pool),
          tx.object(SUI_CLOCK_OBJECT_ID),
          tx.object(credential.id),
          tx.pure.u64(withdrawAmount),
        ],
      });
      if (credential.amount === BigInt(0)) {
        tx.moveCall({
          target: `${this.consts.sudoStaking.package}::pool::clear_empty_credential`,
          typeArguments: [
            `${this.consts.sudoCore.package}::slp::SLP`,
            `${this.consts.sudoCore.package}::slp::SLP`,
          ],
          arguments: [tx.object(credential.id)],
        });
      }
    }

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
    isLimitOrder = false,
    isIocOrder = false,
    pricesSlippage: number = 0.003,
    collateralSlippage: number = 0.5,
    relayerFee = BigInt(0.5),
    referralAddress = '',
    sender = '',
  ) => {
    let tx = new Transaction();
    if (referralAddress && !(await this.hasReferral(sender || ''))) {
      tx = await this.addReferral(referralAddress, tx);
    }
    tx = await this.initOracleTxb([collateralToken, indexToken], tx);
    const coinObject = this.#processCoins(tx, collateralToken, coinObjects);
    const [depositObject] = tx.splitCoins(coinObject, [
      tx.pure.u64(collateralAmount),
    ]);
    const feeObject = tx.splitCoins(tx.gas, [tx.pure.u64(relayerFee)]); // Sudo contract requires SUI as fee

    const symbol = joinSymbol(long ? 'long' : 'short', indexToken);
    const adjustPrice = this.#processSlippage(indexPrice, long, isLimitOrder ? 0 : pricesSlippage);
    const adjustCollateralPrice = this.#processSlippage(collateralPrice, false, collateralSlippage);

    let allowTrade = ALLOW_TRADE_MUST_TRADE;
    if (isLimitOrder) {
      allowTrade = isIocOrder ? ALLOW_TRADE_NO_TRADE : ALLOW_TRADE_CAN_TRADE;
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
      target: `${this.consts.sudoCore.upgradedPackage}::market::pledge_in_position`,
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
      target: `${this.consts.sudoCore.upgradedPackage}::market::redeem_from_position_v1_1`,
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
    amount: bigint,
    long: boolean,
    indexPrice: number,
    collateralPrice: number,
    isTriggerOrder = false,
    isTakeProfitOrder = true,
    isIocOrder = false,
    pricesSlippage: number = 0.003,
    collateralSlippage: number = 0.5,
    relayerFee = BigInt(0.5)
  ) => {
    const tx = await this.initOracleTxb([collateralToken, indexToken]);
    const symbol = joinSymbol(long ? 'long' : 'short', indexToken);
    const feeObject = tx.splitCoins(tx.gas, [tx.pure.u64(relayerFee)]); // Sudo contract requires SUI as fee

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
      target: `${this.consts.sudoCore.upgradedPackage}::market::${functionName}`,
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
      target: `${this.consts.sudoCore.upgradedPackage}::market::swap`,
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

  clearClosedPosition = (
    pcpId: string,
    collateralToken: string,
    indexToken: string,
    long: boolean,
    tx: Transaction
  ) => {
    tx.moveCall({
      target: `${this.consts.sudoCore.upgradedPackage}::market::clear_closed_position`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
        this.consts.coins[indexToken].module,
        `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
      ],
      arguments: [tx.object(this.consts.sudoCore.market), tx.object(pcpId)],
    });
  };

  cancelMultiOrder = async (orders: Array<{
    orderCapId: string,
    collateralToken: string,
    indexToken: string,
    long: boolean,
    type: string,
    isV11Order: boolean,
  }>, tx?: Transaction) => {
    if (!tx) {
      tx = new Transaction();
    }

    for (const order of orders) {
      const { orderCapId, collateralToken, indexToken, long, type, isV11Order } = order;
      let functionName = '';
      switch (type) {
        case 'OPEN_POSITION': {
          functionName = isV11Order ? 'clear_open_position_order_v1_1' : 'clear_open_position_order_v1_1';
          break;
        }
        case 'DECREASE_POSITION': {
          functionName = isV11Order
            ? 'clear_decrease_position_order_v1_1'
            : 'clear_decrease_position_order_v1_1';
          break;
        }
        default: {
          throw new Error('invalid order type');
        }
      }

      tx.moveCall({
        target: `${this.consts.sudoCore.upgradedPackage}::market::${functionName}`,
        typeArguments: [
          `${this.consts.sudoCore.package}::slp::SLP`,
          this.consts.coins[collateralToken].module,
          this.consts.coins[indexToken].module,
          `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
          this.consts.coins[collateralToken].module,
        ],
        arguments: [tx.object(this.consts.sudoCore.market), tx.object(orderCapId)],
      });
    }
    return tx;
  }

  clearOpenPositionOrder = (
    orderCapId: string,
    collateralToken: string,
    indexToken: string,
    long: boolean,
    tx: Transaction
  ) => {
    tx.moveCall({
      target: `${this.consts.sudoCore.upgradedPackage}::market::clear_open_position_order_v1_1`,
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

  clearDecreasePositionOrder = (
    orderCapId: string,
    collateralToken: string,
    indexToken: string,
    long: boolean,
    tx: Transaction
  ) => {
    tx.moveCall({
      target: `${this.consts.sudoCore.upgradedPackage}::market::clear_decrease_position_order_v1_1`,
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

  decreaseMultiPositions = async (positions: Array<{
    pcpId: string,
    collateralToken: string,
    coinObjects: string[],
    indexToken: string,
    amount: bigint,
    long: boolean,
    indexPrice: number,
    collateralPrice: number,
    isTriggerOrder: boolean,
    isTakeProfitOrder: boolean,
    isIocOrder: boolean,
    slippage: number,
    relayerFee: bigint,
  }>) => {
    const tx = await this.initOracleTxb(positions.map(position => [position.collateralToken, position.indexToken]).flat());

    for (const position of positions) {
      const {
        pcpId,
        collateralToken,
        coinObjects, indexToken, amount, long, indexPrice, collateralPrice, isTriggerOrder, isTakeProfitOrder, isIocOrder, slippage, relayerFee
      } = position;
      let innerIsTakeProfitOrder = isTakeProfitOrder;
      const symbol = joinSymbol(long ? 'long' : 'short', indexToken);
      const coinObject = this.#processCoins(tx, collateralToken, coinObjects);
      const feeObject = tx.splitCoins(coinObject, [tx.pure.u64(relayerFee)]);

      const adjustPrice = this.#processSlippage(indexPrice, !long, isTriggerOrder ? 0 : slippage);
      const adjustCollateralPrice = this.#processSlippage(collateralPrice, false, 0.5);

      let allowTrade = ALLOW_TRADE_MUST_TRADE;
      if (isTriggerOrder) {
        allowTrade = isIocOrder || !innerIsTakeProfitOrder ? ALLOW_TRADE_NO_TRADE : ALLOW_TRADE_CAN_TRADE;
      } else {
        innerIsTakeProfitOrder = true;
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
    }
    return tx;
  }

  addReferral = (referrer: string, tx?: Transaction | undefined) => {
    if (!tx) {
      tx = new Transaction();
    }
    tx.moveCall({
      target: `${this.consts.sudoCore.upgradedPackage}::market::add_new_referral`,
      typeArguments: [`${this.consts.sudoCore.package}::slp::SLP`],
      arguments: [tx.object(this.consts.sudoCore.market), tx.object(referrer)],
    });

    return tx;
  }

  // admin methods
  adminUpdatePriceFeed = async (collateralToken: string, indexToken: string) => {
    const tx = await this.initOracleTxb([collateralToken, indexToken]);
    return tx;
  }

  // admin methods
  adminClearClosedPosition = async (
    positionId: string,
    owner: string,
    collateralToken: string,
    indexToken: string,
    long: boolean,
    tx: Transaction,
  ) => {
    tx.moveCall({
      target: `${this.consts.sudoCore.upgradedPackage}::market::admin_clear_closed_position_v1_1`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
        this.consts.coins[indexToken].module,
        `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.adminCap),
        tx.object(owner),
        tx.object(this.consts.sudoCore.market),
        tx.object(positionId),
      ],
    });
  };

  adminDecreasePosition = async (
    positionId: string,
    owner: string,
    collateralToken: string,
    indexToken: string,
    positionAmount: number,
    amount: bigint,
    long: boolean,
    collateralPrice: number,
    collateralSlippage: number = 0.5,
    relayerFee: bigint = BigInt(1),
  ) => {
    const tx = await this.initOracleTxb([collateralToken, indexToken]);
    const symbol = joinSymbol(long ? 'long' : 'short', indexToken);
    const feeObject = tx.splitCoins(tx.gas, [tx.pure.u64(relayerFee)]);

    const adjustCollateralPrice = this.#processSlippage(
      collateralPrice,
      false,
      collateralSlippage,
    );

    let allowTrade = ALLOW_TRADE_MUST_TRADE;

    tx.moveCall({
      target: `${this.consts.sudoCore.upgradedPackage}::market::admin_decrease_position_v1_3`,
      typeArguments: [
        `${this.consts.sudoCore.package}::slp::SLP`,
        this.consts.coins[collateralToken].module,
        this.consts.coins[indexToken].module,
        `${this.consts.sudoCore.package}::market::${long ? 'LONG' : 'SHORT'}`,
        this.consts.coins['sui'].module,
      ],
      arguments: [
        tx.object(this.consts.sudoCore.adminCap),
        tx.object(SUI_CLOCK_OBJECT_ID),
        tx.object(this.consts.sudoCore.market),
        tx.object(positionId),
        tx.object(
          this.consts.sudoCore.vaults[collateralToken].reservingFeeModel,
        ),
        tx.object(this.consts.sudoCore.symbols[symbol].fundingFeeModel),
        tx.object(this.consts.pythFeeder.feeder[collateralToken]),
        tx.object(this.consts.pythFeeder.feeder[indexToken]),
        feeObject,
        tx.pure.u8(allowTrade),
        tx.pure.u64(amount),
        tx.pure.u256(adjustCollateralPrice),
        tx.object(owner),
      ],
    });

    if (amount === BigInt(positionAmount)) {
      this.adminClearClosedPosition(
        positionId,
        owner,
        collateralToken,
        indexToken,
        long,
        tx,
      );
    }

    return tx;
  };
}
