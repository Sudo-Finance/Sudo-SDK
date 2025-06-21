import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { PriceFeed } from '@pythnetwork/price-service-client';
import {
  SuiPriceServiceConnection,
  SuiPythClient,
} from '@pythnetwork/pyth-sui-js';
import {
  IConsts,
  getConsts,
  getPriceIdToPythFeeder,
  getPythFeederToId,
  getPythFeederToPriceId,
} from './consts';
import { getProvider } from './utils';

export class OracleAPI {
  network: string;
  consts: IConsts;
  connectionURL: string;
  PythFeederToPriceId: Record<string, string>;
  PythFeederToId: Record<string, string>;
  provider: SuiClient;

  constructor(network: string, provider: SuiClient | null = null) {
    this.network = network;
    this.consts = getConsts(network);
    switch (network) {
      case 'testnet':
        this.connectionURL = 'https://hermes-beta.pyth.network';
        break;
      case 'mainnet':
        this.connectionURL = 'https://hermes.pyth.network';
        break;
      default:
        this.connectionURL = 'https://hermes-beta.pyth.network';
    }
    this.PythFeederToPriceId = getPythFeederToPriceId(network);
    this.PythFeederToId = getPythFeederToId(network);
    if (provider) {
      this.provider = provider;
    } else {
      this.provider = getProvider(network);
    }
  }

  async getOraclePrice(tokenId: string) {
    const res = await this.getOraclePrices([tokenId]);
    // return res[tokenId];
  }

  async getOraclePrices(tokens: string[]) {
    const connection = new SuiPriceServiceConnection(this.connectionURL);
    let pythObjectIds = tokens.map(
      token => this.consts.pythFeeder.feeder[token],
    );
    // remove dupe object ids
    pythObjectIds = [...new Set(pythObjectIds)].filter(Boolean);
    const priceFeedIds = pythObjectIds.map(
      pythObjectId => this.PythFeederToPriceId[pythObjectId],
    );
    const price = await connection.getLatestPriceFeeds(priceFeedIds);
    return price;
  }

  async subOraclePrices(
    tokens: string[],
    callback: (price: PriceFeed) => void,
  ) {
    const connection = new SuiPriceServiceConnection(this.connectionURL);

    let pythObjectIds = tokens.map(
      token => this.consts.pythFeeder.feeder[token],
    );
    // remove dupe object ids
    pythObjectIds = [...new Set(pythObjectIds)].filter(Boolean);
    const priceFeedIds = pythObjectIds
      .map(pythObjectId => this.PythFeederToPriceId[pythObjectId])
      .filter(p => p !== undefined);
    await connection.subscribePriceFeedUpdates(priceFeedIds, price => {
      price.id =
        this.PythFeederToId[getPriceIdToPythFeeder(this.network)[price.id]];
      callback(price);
    });
  }

  async initOracleTxb(tokens: string[], tx?: Transaction) {
    let tx_ = tx
    if (!tx_) {
      tx_ = new Transaction()
    }
    // Remove redundant tokens first
    tokens = [...new Set(tokens)];

    let pythObjectIds = tokens.map(
      token => this.consts.pythFeeder.feeder[token],
    );
    // remove dupe object ids
    pythObjectIds = [...new Set(pythObjectIds)].filter(Boolean);

    const needUpdateObjectIds = (
      await this.provider.multiGetObjects({
        ids: pythObjectIds,
        options: {
          showContent: true,
        },
      })
    )
      .map(pythObject => [
        parseInt(
          (pythObject.data?.content as any).fields.price_info.fields
            .arrival_time || 0,
        ) -
        new Date().getTime() / 1000,
        pythObject.data?.objectId,
      ])
      .filter((x: any) => Math.abs(x[0]) > 7)
      .map(x => x[1] as string);
    if (!needUpdateObjectIds.length) {
      return tx_;
    }
    const priceFeedIds = needUpdateObjectIds.map(
      pythObjectId => this.PythFeederToPriceId[pythObjectId],
    );

    const connection = new SuiPriceServiceConnection(this.connectionURL); // See Hermes endpoints section below for other endpoints

    const priceUpdateData = await connection.getPriceFeedsUpdateData(
      priceFeedIds,
    );

    const client = new SuiPythClient(
      this.provider,
      this.consts.pythFeeder.state,
      this.consts.pythFeeder.wormhole.state,
    );
    await client.updatePriceFeeds(tx_, priceUpdateData, priceFeedIds);
    return tx_;
  }
}
