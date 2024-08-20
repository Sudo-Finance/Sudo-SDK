import { PriceServiceConnection } from '@pythnetwork/price-service-client';
import { IConsts } from './consts';
import { SuiClient } from '@mysten/sui/client';
export function getProvider(network: string = 'testnet') {
  // Construct your connection:
  let url = 'https://explorer-rpc.devnet.sui.io/';
  switch (network) {
    case 'devnet':
      url = 'https://explorer-rpc.devnet.sui.io/';
      break;
    case 'testnet':
      url =
        'https://rpc-testnet-sui.forbole.com?apikey=J4pq6DizX2qTks6c2LkgiXyR';
      break;
    case 'mainnet':
      url =
        'https://rpc-mainnet-sui.forbole.com?apikey=J4pq6DizX2qTks6c2LkgiXyR';
      break;
    default:
      url = 'https://explorer-rpc.devnet.sui.io/';
  }
  // connect to a custom RPC server
  return new SuiClient({
    url,
  });
}

export function getPythConnection(network: string) {
  let priceConnectionUrl;
  switch (network) {
    case 'testnet':
      priceConnectionUrl = 'https://xc-testnet.pyth.network';
      break;
    case 'mainnet':
      priceConnectionUrl = 'https://xc-mainnet.pyth.network';
      break;
    default:
      priceConnectionUrl = 'https://xc-testnet.pyth.network';
  }
  return new PriceServiceConnection(priceConnectionUrl, {
    priceFeedRequestConfig: {
      binary: true,
    },
  });
}

export const decimalToObject = (decimal: { value: string }) => {
  return Number(BigInt(decimal.value)) / 1e18;
};

export const rateToObject = (rate: { value: string }) => {
  return Number(BigInt(rate.value)) / 1e18;
};

export const srateToObject = (srate: any) => {
  const sign = srate.fields.is_positive ? 1 : -1;
  return (Number(BigInt(srate.fields.value.fields.value)) / 1e18) * sign;
};

export const sdecimalToObject = (sdecimal: any) => {
  const sign = sdecimal.fields.is_positive ? 1 : -1;
  return (Number(BigInt(sdecimal.fields.value.fields.value)) / 1e18) * sign;
};

export const parseValue = (field: any): number => {
  if (field.type && field.type.endsWith('::decimal::Decimal')) {
    return decimalToObject({ value: field.fields.value });
  } else if (field.type && field.type.endsWith('::rate::Rate')) {
    return rateToObject({ value: field.fields.value });
  } else if (field.type && field.type.endsWith('::srate::SRate')) {
    return srateToObject(field);
  } else if (field.type && field.type.endsWith('::sdecimal::SDecimal')) {
    return sdecimalToObject(field);
  } else {
    return parseInt(field, 10);
  }
};

export type ReversedKeyValue<T extends object> = {
  [K in keyof T]: T[K] extends keyof T
    ? keyof T
    : T[K] extends keyof T | infer V
      ? V
      : never;
};

export function reverseKeyValue<T extends object>(obj: T): ReversedKeyValue<T> {
  const reversed: any = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      reversed[value] = key;
    }
  }

  return reversed;
}

export function parseSymbolKey(input: string): string[] {
  // This regex will match uppercase letters
  const regex = /[A-Z]/;
  let result: string[] = [];
  let wordStart = 0;

  for (let i = 1; i < input.length; i++) {
    if (regex.test(input[i])) {
      // Found an uppercase letter, so we split the string here
      result.push(input.slice(wordStart, i));
      wordStart = i;
    }
  }

  // Add the last word to the result array
  result.push(input.slice(wordStart));

  // Convert the words to lowercase
  result = result.map(word => word.toLowerCase());

  return result;
}

export function upperFirstCharacter(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function joinSymbol(direction: string, token: string): string {
  return `${direction}${upperFirstCharacter(token)}`;
}

export function suiSymbolToSymbol(symbol: string, consts: IConsts): string {
  if (symbol === '0x2::sui::SUI') {
    return 'sui';
  }
  const ret: { [key: string]: string } = {};
  for (const key of Object.keys(consts.coins)) {
    ret[consts.coins[key].module] = key;
  }
  return ret[symbol];
}

export function base64ToUint8Array(base64: string) {
  // Decode Base64 to binary
  const binary = atob(base64);

  // Create a Uint8Array from the binary data
  const uint8Array = new Uint8Array(binary.length);

  // Populate the Uint8Array with the binary data
  for (let i = 0; i < binary.length; i++) {
    uint8Array[i] = binary.charCodeAt(i);
  }

  return uint8Array;
}
