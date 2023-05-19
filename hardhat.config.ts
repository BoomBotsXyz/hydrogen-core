import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-abi-exporter";
import "hardhat-contract-sizer";
import { config as dotenv_config } from "dotenv";
dotenv_config();
const USE_PROCESSED_FILES = process.env.USE_PROCESSED_FILES === "true";

const ethereum_fork = { url: process.env.ETHEREUM_URL || '' };
const goerli_fork = { url: process.env.GOERLI_URL || '' };
const sepolia_fork = { url: process.env.SEPOLIA_URL || '' };
const polygon_fork = { url: process.env.POLYGON_URL || '' };
const mumbai_fork = { url: process.env.MUMBAI_URL || '' };
const no_fork = undefined;
const forking = (
    process.env.FORK_NETWORK === "ethereum"       ? ethereum_fork
  : process.env.FORK_NETWORK === "goerli"         ? goerli_fork
  : process.env.FORK_NETWORK === "sepolia"        ? sepolia_fork
  : process.env.FORK_NETWORK === "polygon"        ? polygon_fork
  : process.env.FORK_NETWORK === "mumbai"         ? mumbai_fork
  : no_fork
);

const accounts = JSON.parse(process.env.PRIVATE_KEYS || '[]');

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: process.env.FORK_NETWORK ? forking : undefined,
      hardfork: "merge"
    },
    localhost: { url: "http://127.0.0.1:8545" },
    ethereum: {
      url: process.env.ETHEREUM_URL || '',
      chainId: 1,
      accounts: accounts
    },
    goerli: {
      url: process.env.GOERLI_URL || '',
      chainId: 5,
      accounts: accounts
    },
    sepolia: {
      url: process.env.SEPOLIA_URL || '',
      chainId: 111555111,
      accounts: accounts
    },
    polygon: {
      url: process.env.POLYGON_URL || '',
      chainId: 137,
      accounts: accounts
    },
    mumbai: {
      url: process.env.MUMBAI_URL || '',
      chainId: 80001,
      accounts: accounts,
      hardfork: "merge"
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
    ]
  },
  paths: {
    sources: USE_PROCESSED_FILES ? "./contracts_processed" : "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  abiExporter: {
    path: "./client/src/constants/abi",
    clear: true,
    flat: false,
    only: [],
    spacing: 2,
  },
  mocha: {
    timeout: 3600000, // one hour
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 100,
    coinmarketcap: process.env.CMC_API_KEY || "",
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      goerli:  process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
    }
  }
};

export default config;
