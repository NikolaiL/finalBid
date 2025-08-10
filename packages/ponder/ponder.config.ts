// @ts-nocheck
import { createConfig } from "ponder";
import { http } from "viem";
import deployedContracts from "../nextjs/contracts/deployedContracts";
import scaffoldConfig from "../nextjs/scaffold.config";

const targetNetwork = scaffoldConfig.targetNetworks[0];

const fallbackRpcUrl =
  process.env[`PONDER_RPC_URL_${targetNetwork.id}`] ||
  process.env.PONDER_RPC_URL ||
  "http://localhost:8545";

const chains = {
  [targetNetwork.name]: {
    id: targetNetwork.id,
    rpc: fallbackRpcUrl,
  },
};

const deployedForChain = (deployedContracts as Record<number, any>)[targetNetwork.id];
const contractNames = deployedForChain ? Object.keys(deployedForChain) : [];

const contracts = Object.fromEntries(
  contractNames.map((contractName) => {
    const c = deployedForChain[contractName];
    return [
      contractName,
      {
        chain: targetNetwork.name as string,
        abi: c.abi,
        address: c.address,
        startBlock: c.deployedOnBlock || 0,
      },
    ];
  }),
);

export default createConfig({
  chains,
  contracts,
});


