import { reverseKeyValue } from '../utils';
import testnetJson from './deployments-testnet.json';
import mainnetJson from './deployments-mainnet.json';
import PriceIdToObjectIdTestnet from './price_id_to_object_id.testnet.json';
import PriceIdToObjectIdMainnet from './price_id_to_object_id.mainnet.json';

interface IVault {
  weight: string;
  reservingFeeModel: string;
}

interface IPrizePool {
  coin: string;
  prizePool: string;
}

interface ISymbol {
  supportedCollaterals: string[];
  fundingFeeModel: string;
  positionConfig: string;
}

interface ICoin {
  decimals: number;
  module: string;
  metadata: string;
  treasury: string | null;
}


export interface IStaked {
  credentials: ICredential[];
  amount: bigint;
  claimable: bigint;
}

export interface ICredential {
  id: string;
  lockUntil: number;
  accRewardPerShare: bigint;
  amount: bigint;
  claimable: bigint;
}

export interface IStakePool {
  id: string;
  enabled: boolean;
  lastUpdatedTime: number;
  stakedAmount: bigint;
  reward: bigint;
  startTime: number;
  endTime: number;
  accRewardPerShare: bigint;
  lockDuration: number;
}

type IVersionedContract = string;

interface IFeeder {
  [key: string]: IVersionedContract;
}

export interface IConsts {
  sudoCore: {
    package: string;
    upgradedPackage: string;
    upgradeCap: string;
    adminCap: string;
    market: IVersionedContract;
    slpMetadata: IVersionedContract;
    rebaseFeeModel: IVersionedContract;
    vaultsParent: string;
    symbolsParent: string;
    positionsParent: string;
    vaults: {
      [key: string]: IVault;
    };
    symbols: {
      [key: string]: ISymbol;
    };
    referralsParent: string;
    ordersParent: string;
  };
  sudoStaking: {
    package: string;
    upgradedPackage: string;
    upgradeCap: string;
    adminCap: string;
    pool: string;
  };
  sudoNft: {
    package: string;
    upgradedPackage: string;
    upgradeCap: string;
    adminCap: string;
    mintSettings: string;
    cardRegistry: string;
    displayCard: string;
    displayMintTicket: string;
    silverCardTracker: string;
    emeraldCardTracker: string;
    blackCardTracker: string;
    transferPolicy: string;
    transferPolicyCap: string;
  };
  sudoLootbox: {
    package: string;
    upgradedPackage: string;
    upgradeCap: string;
    adminCap: string;
    lootboxTreasury: string;
    lootboxSettings: string;
    prizePoolParent: string;
    prizePool: {
      [key: string]: IPrizePool;
    };
  };
  pythFeeder: {
    package: string;
    state: IVersionedContract;
    wormhole: {
      package: string;
      state: IVersionedContract;
    };
    feeder: IFeeder;
  };
  coins: {
    [key: string]: ICoin;
  };
}

export interface IStaked {
  credentials: ICredential[];
  amount: bigint;
  claimable: bigint;
}

export interface ICredential {
  id: string;
  lockUntil: number;
  accRewardPerShare: bigint;
  amount: bigint;
  claimable: bigint;
}

export interface IStakePool {
  id: string;
  enabled: boolean;
  lastUpdatedTime: number;
  stakedAmount: bigint;
  reward: bigint;
  startTime: number;
  endTime: number;
  accRewardPerShare: bigint;
  lockDuration: number;
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}

function parse(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(parse);
  }

  const newObj: any = {};

  for (const key in obj) {
    const camelCaseKey = toCamelCase(key);
    newObj[camelCaseKey] = parse(obj[key]);
  }

  return newObj;
}

export enum Network {
  MAINNET = 'mainnet',
  TESTNET = 'testnet',
  DEVNET = 'devnet',
}

export function getConsts(network: string): IConsts {
  let consts: IConsts;
  switch (network) {
    case 'testnet':
      consts = parse(testnetJson);
      break;
    case 'mainnet':
      consts = parse(mainnetJson);
      break;
    default:
      throw new Error(`Unknown network: ${network}`);
  }
  return consts;
}

export const SLP_TOKEN_DECIMALS = 6;
export function getPythFeederToPriceId(
  network: string,
): Record<string, string> {
  let feederToPriceId: Record<string, string> = {};
  switch (network) {
    case 'testnet':
      feederToPriceId = reverseKeyValue(PriceIdToObjectIdTestnet);
      break;
    case 'mainnet':
      feederToPriceId = reverseKeyValue(PriceIdToObjectIdMainnet);
      break;
    default:
      throw new Error(`Unknown network: ${network}`);
  }
  return feederToPriceId;
}

export function getPriceIdToPythFeeder(
  network: string,
): Record<string, string> {
  let priceIdToFeeder: Record<string, string> = {};
  switch (network) {
    case 'testnet':
      priceIdToFeeder = PriceIdToObjectIdTestnet;
      break;
    case 'mainnet':
      priceIdToFeeder = PriceIdToObjectIdMainnet;
      break;
    default:
      throw new Error(`Unknown network: ${network}`);
  }
  return priceIdToFeeder;
}

export function getPythFeederToId(network: string): Record<string, string> {
  let feederToId: Record<string, string> = {};
  const consts = getConsts(network);
  for (const key in consts.pythFeeder.feeder) {
    if (Object.prototype.hasOwnProperty.call(consts.pythFeeder.feeder, key)) {
      const contract = consts.pythFeeder.feeder[key];
      feederToId[contract] = key;
    }
  }
  return feederToId;
}

export const ALLOW_TRADE_NO_TRADE = 0;
export const ALLOW_TRADE_CAN_TRADE = 1;
export const ALLOW_TRADE_MUST_TRADE = 2;
