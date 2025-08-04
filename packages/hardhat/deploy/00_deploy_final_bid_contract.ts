import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploys a contract named "YourContract" using the deployer account and
 * constructor arguments set to the deployer address
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployYourContract: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
    On localhost, the deployer account is the one that comes with Hardhat, which is already funded.

    When deploying to live networks (e.g `yarn deploy --network sepolia`), the deployer account
    should have sufficient balance to pay for the gas fees for contract creation.

    You can generate a random account with `yarn generate` or `yarn account:import` to import your
    existing PK which will fill DEPLOYER_PRIVATE_KEY_ENCRYPTED in the .env file (then used on hardhat.config.ts)
    You can run the `yarn account` command to check your balance in every network.
  */
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // USDC addresses for each network
  // You can get some testnet USDC from the faucet here: https://faucet.circle.com/
  const usdcAddressMap = {
    mainnet: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    arbitrumSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    optimismSepolia: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
  };

  const networkName = await hre.network.name;
  // if network is not in the map, deploy a dummy usdc erc20 contract

  let usdcAddress = usdcAddressMap[networkName as keyof typeof usdcAddressMap];
  console.log("👋 USDC Address:", usdcAddress);

  // if network is undefined we should deploy a dummy usdc erc20 contract
  if (!usdcAddress) {
    console.log("👋 Deploying dummy USDC ERC20 contract");
    // deploy a dummy usdc erc20 contract
    const usdcContract = await deploy("DummyUsdcContract", {
      from: deployer,
      args: [deployer, 1000000000000], // 1,000,000 USDC (with 6 decimals)
      log: true,
      autoMine: true,
    });
    usdcAddress = usdcContract.address; // update the usdc address
  }

  await deploy("FinalBidContract", {
    from: deployer,
    // Contract constructor arguments
    args: [deployer, usdcAddress],
    log: true,
    // autoMine: can be passed to the deploy function to make the deployment process faster on local networks by
    // automatically mining the contract deployment transaction. There is no effect on live networks.
    autoMine: true,
  });

  // Get the deployed contract to interact with it after deploying.
  // const yourContract = await hre.ethers.getContract<Contract>("FinalBidContract", deployer);
};

export default deployYourContract;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags YourContract
deployYourContract.tags = ["FinalBidContract"];
