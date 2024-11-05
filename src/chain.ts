import "./style.css";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  publicActions,
} from "viem";
import { base } from "viem/chains";

export const BASEPAINT_ADDRESS = "0xBa5e05cb26b78eDa3A2f8e3b3814726305dcAc83";
export const BRUSH_ADDRESS = "0xD68fe5b53e7E1AbeB5A4d0A6660667791f39263a";
export const METADATA_ADDRESS = "0x5104482a2Ef3a03b6270D3e931eac890b86FaD01";

export const client = createWalletClient({
  transport: custom((window as any).ethereum),
}).extend(publicActions);

export const publicClient = client;
