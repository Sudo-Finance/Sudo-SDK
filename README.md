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
  relayerFee: bigint = BigInt(1)
): Promise<TransactionBlock>
```

### Parameters

- `collateralToken`: The token used as collateral (e.g., "USDC")
- `indexToken`: The token used as the market index (e.g., "BTC")
- `size`: The size of the position in base units (bigint)
- `collateralAmount`: The amount of collateral to deposit (bigint)
- `coinObjects`: Array of coin object IDs to use for the transaction
- `long`: Boolean indicating if this is a long (true) or short (false) position
- `reserveAmount`: The amount to reserve for the position (bigint)
- `indexPrice`: The current price of the index token
- `collateralPrice`: The current price of the collateral token
- `pricesSlippage`: Maximum allowed slippage for prices (default: 0.003 or 0.3%)
- `collateralSlippage`: Maximum allowed slippage for collateral (default: 0.5 or 50%)
- `isLimitOrder`: Boolean indicating if this is a limit order (default: false)
- `isIocOrder`: Boolean indicating if this is an IOC (Immediate-or-Cancel) order (default: false)
- `relayerFee`: Fee paid to the relayer (default: 1)

### Return Value

Returns a `Promise` that resolves to a `TransactionBlock` object. This object represents the transaction that will open the position when executed.

### Usage Example

```typescript
import { SudoAPI } from 'sudo-sdk';

const provider = getProvider(network);
const sudoAPI = new SudoAPI(network, provider);

const tx = await sudoAPI.openPosition(
  'USDC',           // collateralToken
  'BTC',            // indexToken
  BigInt(1000000),  // size (1 BTC if BTC has 6 decimals)
  BigInt(50000000), // collateralAmount (50,000 USDC if USDC has 6 decimals)
  ['0x123...', '0x456...'], // coinObjects
  true,             // long position
  BigInt(100000),   // reserveAmount
  50000,            // indexPrice (BTC price in USD)
  1,                // collateralPrice (USDC price in USD)
  0.001,            // pricesSlippage (0.1%)
  0.1,              // collateralSlippage (10%)
  false,            // not a limit order
  false,            // not an IOC order
  BigInt(2)         // relayerFee
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