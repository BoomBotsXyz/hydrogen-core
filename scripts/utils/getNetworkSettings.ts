// chainlist
// 1: ethereum
// 5: goerli
// 137: polygon
// 80001: polygon mumbai
// 1313161554: aurora
// 1313161555: aurora testnet
// 31337: hardhat testnet

// given a chainID, returns some settings to use for the network
export function getNetworkSettings(chainID: number) {
  const KNOWN_CHAINS = [1, 5, 111555111, 137, 80001, 1313161554, 1313161555, 31337];
  if(!KNOWN_CHAINS.includes(chainID)) throw new Error(`chainID '${chainID}' unknown`);

  // number of blocks to wait to ensure finality
  const CONFIRMATIONS: any = {
    [1]: 1,
    [5]: 1,
    [111555111]: 1,
    [137]: 5,
    [80001]: 5,
    [1313161554]: 5,
    [1313161555]: 5,
    [31337]: 0
  };
  let confirmations = CONFIRMATIONS.hasOwnProperty(chainID) ? CONFIRMATIONS[chainID] : 1;

  // gas settings
  const ONE_GWEI = 1000000000;
  const OVERRIDES: any = {
    [1]: {maxFeePerGas: 40 * ONE_GWEI, maxPriorityFeePerGas: 2 * ONE_GWEI},
    [5]: {},
    [111555111]: {},
    [137]: {maxFeePerGas: 31 * ONE_GWEI, maxPriorityFeePerGas: 31 * ONE_GWEI},
    [80001]: {maxFeePerGas: 2 * ONE_GWEI + 1, maxPriorityFeePerGas: 1 * ONE_GWEI},
    [1313161554]: {},
    [1313161555]: {},
    [31337]: {},
  };
  let overrides = OVERRIDES.hasOwnProperty(chainID) ? OVERRIDES[chainID] : {};

  // testnets
  const TESTNETS: any = [5, 111555111, 80001, 1313161555, 31337];
  let isTestnet = TESTNETS.includes(chainID);

  // url of the provider
  const PROVIDER_URLS: any = {
    [1]: process.env.MAINNET_URL,
    [5]: process.env.GOERLI_URL,
    [111555111]: process.env.SEPOLIA_URL,
    [137]: process.env.POLYGON_URL,
    [80001]: process.env.MUMBAI_URL,
    [1313161554]: process.env.AURORA_URL,
    [1313161555]: process.env.AURORA_TESTNET_URL,
    [31337]: "" // technically this does have a url when forking. but we want this to fail if not listening to prod network
  }
  let providerURL = (PROVIDER_URLS.hasOwnProperty(chainID) ? PROVIDER_URLS[chainID] : "") || "";

  const ETHERSCAN_SETTINGS: any = {
    [1]: {url: "", apikey: process.env.ETHERSCAN_API_KEY},
    [5]: {url: "", apikey: process.env.ETHERSCAN_API_KEY},
    [137]: {url: "", apikey: process.env.POLYGONSCAN_API_KEY},
    [80001]: {url: "", apikey: process.env.POLYGONSCAN_API_KEY},
  }
  let etherscanSettings = ETHERSCAN_SETTINGS.hasOwnProperty(chainID) ? ETHERSCAN_SETTINGS[chainID] : undefined;

  let networkSettings = {confirmations, overrides, isTestnet, providerURL, etherscanSettings};
  return networkSettings;
}
