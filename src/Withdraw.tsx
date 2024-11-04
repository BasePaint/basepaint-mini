import { useEffect, useRef, useState } from "preact/hooks";
import { BASEPAINT_ADDRESS, client } from "./chain";
import { Address, formatEther, parseAbi } from "viem";
import { keccak256, toHex } from "viem";
import Button from "./Button";
import { base } from "viem/chains";

async function getEarningsForDay(address: Address, day: number) {
  const slot = getSlot(day, address);
  const result = await client.getStorageAt({
    address: BASEPAINT_ADDRESS,
    slot,
  });
  return BigInt(result ?? 0);
}

function getSlot(day: number, address: Address) {
  const canvasesSlot = 5; // forge inspect BasePaint storage-layout --pretty
  const canvasesHex = toHex(canvasesSlot, { size: 32 });
  const dayHex = toHex(day, { size: 32 });
  const canvasesDaySlot = keccak256(
    `0x${dayHex.slice(2) + canvasesHex.slice(2)}`
  );
  const contributionsSlot = toHex(BigInt(canvasesDaySlot) + 2n);
  const addressContributionsSlot = keccak256(
    `0x${address.slice(2).padStart(64, "0") + contributionsSlot.slice(2)}`
  );
  return addressContributionsSlot;
}

export default function Withdraw({
  today,
  address,
}: {
  today: number;
  address: Address;
}) {
  const stop = useRef(false);
  const [progress, setProgress] = useState(0);
  const [unclaimedDays, setUnclaimedDays] = useState<number[]>([]);

  useEffect(() => {
    async function findDays() {
      for (let day = today - 2; day > 0; day--) {
        if (stop.current) return;
        const earnings = await getEarningsForDay(address, day);

        if (earnings > 0n) {
          setUnclaimedDays((days) => [...days, day]);
          console.log(
            `Day ${day} has unclaimed earnings: ${formatEther(earnings)}`
          );
        }

        setProgress(Math.round((100 * (today - day)) / today));
      }
    }

    setProgress(0);
    setUnclaimedDays([]);
    findDays();

    return () => (stop.current = true);
  }, []);

  async function withdraw() {
    stop.current = true;

    if (!unclaimedDays.length) {
      alert("No unclaimed days found");
      return;
    }

    await client.writeContract({
      account: address,
      chain: base,
      address: BASEPAINT_ADDRESS,
      functionName: "authorWithdraw",
      abi: parseAbi(["function authorWithdraw(uint256[] calldata indexes)"]),
      args: [unclaimedDays.map((day) => BigInt(day))],
    });

    setUnclaimedDays([]);
  }

  return (
    <div className="fullscreen">
      {!stop.current && <div>Looking for unclaimed days: {progress}%</div>}
      <div>
        {unclaimedDays.length
          ? "Unclaimed earnings from: " + unclaimedDays.join(", ")
          : "No unclaimed days found yet"}
      </div>
      <div className="menu">
        <Button onClick={withdraw}>Withdraw</Button>
      </div>
    </div>
  );
}