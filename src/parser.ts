import { PositionEventType } from './constants';
import { getConsts } from './consts';
import { getProvider, suiSymbolToSymbol } from './utils';

export interface IToken {
  name: string;
  decimal: number;
}

const provider = getProvider();
const consts = getConsts('mainnet');

const parseSuiTypeToToken = async (coinType: string): Promise<IToken> => {
  const metaInfo = await provider.getCoinMetadata({ coinType });
  const name =
    metaInfo?.name.startsWith('Wrapped') &&
    metaInfo?.symbol.startsWith('W') &&
    metaInfo?.symbol.length >= 4
      ? metaInfo?.symbol.slice(1)
      : metaInfo?.symbol;
  const decimal = metaInfo?.decimals;
  return {
    name: name?.toLowerCase() || 'unknown',
    decimal: decimal === undefined ? 9 : decimal,
  };
};

const parseTokenType = async (coinType: string): Promise<IToken> => {
  return parseSuiTypeToToken(coinType);
};

const parsePositionType = (typeRaw: string) => {
  for (const positionEventType in PositionEventType) {
    if (typeRaw.includes(positionEventType)) {
      return positionEventType;
    }
  }
  return 'Unknown';
};

export const parsePosition = (typeRaw: string, content: any): any => {
  let result = {
    parsedDetail: {
      collateralToken: '',
      indexToken: '',
      direction: '',
      collateralPrice: 0,
      collateralAmount: 0,
      indexPrice: 0,
      pnl: 0,
      positionId:
        content?.position_name?.fields?.id ||
        content?.claim?.position_name?.fields?.id ||
        '',
    },
    volume: 0,
    eventName: '',
    fee: 0,
  };

  // Split the input on '<' and '>', to isolate the relevant section.
  let relevantPart = typeRaw.split('<')[2].split('>')[0];

  // Split the relevant part on ', ' to get the individual components.
  let components = relevantPart.split(', ');

  let cdec = 0;
  let idec = 0;

  // For each component, split on '::' to get the actual value.
  for (let i = 0; i < components.length; i++) {
    let componentParts = components[i].split('::');
    let value = componentParts[componentParts.length - 1];
    let tokenName = suiSymbolToSymbol(components[i], consts);

    switch (i) {
      case 0:
        result.parsedDetail.collateralToken = tokenName;
        cdec = consts.coins[tokenName].decimals;
        break;
      case 1:
        result.parsedDetail.indexToken = tokenName;
        idec = consts.coins[tokenName].decimals;
        break;
      case 2:
        result.parsedDetail.direction = value;
        break;
    }
  }

  result.eventName = parsePositionType(typeRaw);
  let event: any;
  switch (result.eventName) {
    case PositionEventType.OpenPositionSuccessEvent:
      if (content.event) {
        event = content.event;
      } else if (content.claim.event) {
        event = content.claim.event;
      } else {
        event = {};
      }
      result.volume =
        ((event.open_amount / 10 ** idec) * event.index_price.value) / 1e18;
      result.fee =
        ((event.open_fee_amount / 10 ** cdec) * event.collateral_price.value) /
        1e18;
      result.parsedDetail.collateralPrice = event.collateral_price.value / 1e18;
      result.parsedDetail.indexPrice = event.index_price.value / 1e18;
      result.parsedDetail.collateralAmount =
        event.collateral_amount / 10 ** cdec;
      break;
    case PositionEventType.DecreasePositionSuccessEvent:
      if (content.event) {
        event = content.event;
      } else if (content.claim.event) {
        event = content.claim.event;
      } else {
        event = {};
      }
      result.volume =
        ((event.decrease_amount / 10 ** idec) * event.index_price.value) / 1e18;
      result.fee =
        event.decrease_fee_value.value / 1e18 +
        event.reserving_fee_value.value / 1e18 +
        (event.funding_fee_value.is_positive
          ? event.funding_fee_value.value.value / 1e18
          : -event.funding_fee_value.value.value / 1e18);
      result.parsedDetail.collateralPrice = event.collateral_price.value / 1e18;
      result.parsedDetail.collateralAmount =
        event.collateral_amount / 10 ** cdec;
      result.parsedDetail.indexPrice = event.index_price.value / 1e18;
      result.parsedDetail.pnl = -(event.delta_realised_pnl.is_positive
        ? event.delta_realised_pnl.value.value / 1e18
        : -event.delta_realised_pnl.value.value / 1e18);

      break;
    case PositionEventType.DecreaseReservedFromPositionEvent:
      result.volume = 0;
      break;
    case PositionEventType.PledgeInPositionEvent:
      result.volume = 0;
      break;
    case PositionEventType.RedeemFromPositionEvent:
      result.volume = 0;
      break;
    case PositionEventType.LiquidatePositionEvent:
      event = content.event;
      const pnl = -(event.delta_realised_pnl.is_positive
        ? event.delta_realised_pnl.value.value / 1e18
        : -event.delta_realised_pnl.value.value / 1e18);
      if (event.position_size) {
        result.volume = event.position_size.value / 1e18 + pnl;
      } else {
        // Old version of event, cannot track the volume
        result.volume = 0;
      }
      result.parsedDetail.collateralPrice = event.collateral_price.value / 1e18;
      result.parsedDetail.collateralAmount =
        event.collateral_amount / 10 ** cdec;
      result.parsedDetail.indexPrice = event.index_price.value / 1e18;
      result.parsedDetail.pnl = pnl;
      result.fee =
        content.event.reserving_fee_value.value / 1e18 +
        (content.event.funding_fee_value.is_positive
          ? content.event.funding_fee_value.value.value / 1e18
          : -content.event.funding_fee_value.value.value / 1e18);
      break;
  }
  return result;
};
