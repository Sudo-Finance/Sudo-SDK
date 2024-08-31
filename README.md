# sudo-sdk

# Sudo TypeScript SDK
This is the Sudo TypeScript SDK. It provides utility classes and functions for applications to call into Sudo Finance's Move smart contract to open or close perps positions.

# APIs
## openPosition Function

The `openPosition` function is part of our TypeScript SDK for interacting with our Move smart contract. This function allows users to open a position in a perpetual futures market.

## Function Signature

```typescript
openPosition(
  collateralToken: string,
  indexToken: string,
  leverage: number,
  collateral: number,
  positionConfig: IPositionConfig,
  coinObjects: string[],
  long: boolean,
  indexPrice: number,
  collateralPrice: number,
  pricesSlippage: number = 0.003,
  collateralSlippage: number = 0.5,
  isLimitOrder: boolean = false,
  isIocOrder: boolean = false,
  relayerFee: bigint = BigInt(1)
): Promise<Transaction>
```

### Parameters

- `collateralToken`: The token used as collateral (e.g., "USDC")
- `indexToken`: The token used as the market index (e.g., "SUI")
- `leverage`: The size of the position in base units (number)
- `collateral`: The amount of collateral to deposit (number)
- `positionConfig`: Configuration object for the position (IPositionConfig)
- `coinObjects`: Array of coin object IDs to use for the transaction
- `long`: Boolean indicating if this is a long (true) or short (false) position
- `indexPrice`: The current price of the index token
- `collateralPrice`: The current price of the collateral token
- `pricesSlippage`: Maximum allowed slippage for prices (default: 0.003 or 0.3%)
- `collateralSlippage`: Maximum allowed slippage for collateral (default: 0.5 or 50%)
- `isLimitOrder`: Boolean indicating if this is a limit order (default: false)
- `isIocOrder`: Boolean indicating if this is an IOC (Immediate-or-Cancel) order (default: false)
- `relayerFee`: Fee paid to the relayer (default: 1)

### Return Value

Returns a `Promise` that resolves to a `Transaction` object. This object represents the transaction that will open the position when executed.

### Usage Example

```typescript
import { SudoAPI } from 'sudo-sdk';

const provider = getProvider(network);
const sudoAPI = new SudoAPI(network, provider);

const tx = await sudoAPI.openPosition(
  'USDC',
  'SUI',
  5,                    // 5x leverage
  1000,                 // 1000 USDC as collateral
  myPositionConfig,
  ['coin1', 'coin2'],
  true,                 // long position
  2,                    // SUI price
  1,                    // USDC price
  0.005,                // 0.5% price slippage
  0.1,                  // 10% collateral slippage
  false,                // not a limit order
  false,                // not an IOC order
  BigInt(2)             // relayer fee
);

```

### Notes

- Ensure you have sufficient balance and have approved the necessary permissions before calling this function.
- The function uses the current oracle prices for the tokens. Ensure your frontend is updated with the latest prices before calling this function.
- The `pricesSlippage` and `collateralSlippage` parameters allow you to control the maximum allowed price movement. Adjust these based on market volatility and your risk tolerance.
- For limit orders, set `isLimitOrder` to `true`. For Immediate-or-Cancel orders, set both `isLimitOrder` and `isIocOrder` to `true`.
- The `relayerFee` is paid in SUI. Adjust this value based on the current network conditions and relayer requirements.

## Error Handling

This function may throw errors if:
- The input parameters are invalid
- There's insufficient balance
- The slippage tolerance is exceeded
- The position size is outside allowed limits

Always wrap the function call in a try-catch block and handle potential errors appropriately in your application.