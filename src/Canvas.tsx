import { memo } from "preact/compat";
import { useEffect, useMemo, useReducer, useRef } from "preact/hooks";
import Pixels, { flatPoint } from "./pixels";
import {
  ArrowUpCircle,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Trash,
  HandIcon,
  PencilIcon,
  EraserIcon,
} from "./icons";
import { BASEPAINT_ADDRESS, BRUSH_ADDRESS } from "./constants";
import { Address, parseAbi } from "viem";
import { Client } from ".";
import Countdown, { getSecondsLeft } from "./Countdown";

function Canvas({
  client,
  day,
  epochDuration,
  startedAt,
  theme,
  palette,
  size,
  pixels,
  address,
  brushes,
}: {
  client: Client;
  day: number;
  epochDuration: bigint;
  startedAt: bigint;
  theme: string;
  palette: string[];
  size: number;
  pixels: string;
  address: Address;
  brushes: { id: bigint; strength: bigint }[];
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const PIXEL_SIZE = state.pixelSize;

  const background = useMemo(() => Pixels.fromString(pixels), [pixels]);

  async function save() {
    const cleanPixels = new Pixels();

    for (const { x, y, color } of state.pixels) {
      const bgColor = background.storage.get(flatPoint({ x, y }));

      if (color !== bgColor) {
        cleanPixels.storage.set(flatPoint({ x, y }), color);
      }
    }

    const chainId = await client.getChainId();
    if (chainId !== client.chain.id) {
      await client.switchChain(client.chain);
    }

    const agreedToRules = confirm(RULES);
    if (!agreedToRules) {
      return;
    }

    const response = prompt(
      "What brush token ID do you want to use?",
      brushes[0]?.id.toString() ?? "0"
    );
    if (!response) {
      return;
    }

    const brushId = BigInt(response);

    const owner = await client.readContract({
      account: address,
      abi: parseAbi(["function ownerOf(uint256) returns (address)"]),
      functionName: "ownerOf",
      address: BRUSH_ADDRESS,
      args: [brushId],
    });

    if (owner !== address) {
      alert("You do not own this brush, the owner is " + owner);
      return;
    }

    const strength = await client.readContract({
      account: address,
      abi: parseAbi(["function strengths(uint256) returns (uint256)"]),
      functionName: "strengths",
      address: BRUSH_ADDRESS,
      args: [brushId],
    });

    const secondsToFinalize = 30 * 60;
    const secondsLeft = getSecondsLeft({
      timestamp: BigInt(Date.now()) / 1000n,
      startedAt,
      epochDuration,
    });

    if (strength < 100_000n && secondsLeft < secondsToFinalize) {
      alert(`The last ${secondsToFinalize} seconds are for cleanup crew only.`);
      return;
    }

    await client.writeContract({
      account: address,
      abi: parseAbi([
        "function paint(uint256 day, uint256 tokenId, bytes calldata pixels)",
      ]),
      functionName: "paint",
      address: BASEPAINT_ADDRESS,
      args: [BigInt(day), brushId, `0x${cleanPixels.toString()}`],
    });
  }

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, size * PIXEL_SIZE, size * PIXEL_SIZE);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, size * PIXEL_SIZE, size * PIXEL_SIZE);

    for (const { x, y, color } of background) {
      if (palette[color]) {
        ctx.fillStyle = palette[color];
        ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
      }
    }

    ctx.beginPath();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1;

    for (let x = 0; x <= size; x++) {
      ctx.moveTo(x * PIXEL_SIZE, 0);
      ctx.lineTo(x * PIXEL_SIZE, size * PIXEL_SIZE);
    }
    for (let y = 0; y <= size; y++) {
      ctx.moveTo(0, y * PIXEL_SIZE);
      ctx.lineTo(size * PIXEL_SIZE, y * PIXEL_SIZE);
    }
    ctx.stroke();

    for (const { x, y, color } of state.pixels) {
      if (palette[color]) {
        ctx.fillStyle = palette[color];
        ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
      }
    }
  }, [background, palette, PIXEL_SIZE, size, state.pixels]);

  const locate = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const canvasSize = rect.width;

    // Determine coordinates based on event type
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    // Calculate the actual size of each pixel
    const actualPixelSize = canvasSize / size;

    // Calculate the position relative to the canvas
    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;

    // Convert to grid coordinates
    const x = Math.floor(relativeX / actualPixelSize);
    const y = Math.floor(relativeY / actualPixelSize);

    // Ensure the coordinates are within the canvas bounds
    const boundedX = Math.max(0, Math.min(x, size - 1));
    const boundedY = Math.max(0, Math.min(y, size - 1));

    return { x: boundedX, y: boundedY };
  };

  return (
    <div className="main">
      <Toolbar
        day={day}
        startedAt={startedAt}
        epochDuration={epochDuration}
        theme={theme}
        colorIndex={state.colorIndex}
        palette={palette}
        dispatch={dispatch}
        onSave={save}
        drawMode={state.drawMode}
        eraserMode={state.eraserMode}
      />
      <div className="container">
        <canvas
          ref={canvasRef}
          onTouchStart={(e) => {
            if (state.drawMode) {
              e.preventDefault();
              dispatch({ type: "down", where: locate(e), erase: state.eraserMode });
            }
          }}
          onTouchMove={(e) => {
            if (state.drawMode) {
              e.preventDefault();
              dispatch({ type: "move", where: locate(e) });
            }
          }}
          onTouchEnd={(e) => {
            if (state.drawMode) {
              e.preventDefault();
              dispatch({ type: "up" });
            }
          }}
          onMouseDown={(e) =>
            dispatch({ type: "down", where: locate(e), erase: e.button === 2 })
          }
          onMouseMove={(e) => dispatch({ type: "move", where: locate(e) })}
          onMouseUp={() => dispatch({ type: "up" })}
          onMouseLeave={() => dispatch({ type: "leave" })}
          onContextMenu={(e) => e.preventDefault()}
          width={size * PIXEL_SIZE}
          height={size * PIXEL_SIZE}
          style={{
            touchAction: state.drawMode ? "none" : "auto"
          }}
        />
      </div>
    </div>
  );
}

function Toolbar({
  day,
  startedAt,
  epochDuration,
  theme,
  palette,
  colorIndex,
  dispatch,
  onSave,
  drawMode,
  eraserMode,
}: {
  day: number;
  startedAt: bigint;
  epochDuration: bigint;
  theme: string;
  palette: string[];
  colorIndex: number;
  dispatch: (action: Action) => void;
  onSave: () => void;
  drawMode: boolean;
  eraserMode: boolean;
}) {
  return (
    <div className="toolbar">
      <div className="theme-name">
        <div>
          Day {day}: {theme}
        </div>
        <div className="countdown">
          Canvas flips in{" "}
          <Countdown startedAt={startedAt} epochDuration={epochDuration} />
        </div>
      </div>
      <button onClick={() => onSave()}>
        <ArrowUpCircle />
      </button>
      <button onClick={() => dispatch({ type: "reset" })}>
        <Trash />
      </button>
      <button onClick={() => dispatch({ type: "zoom-in" })}>
        <MagnifyingGlassPlus />
      </button>
      <button onClick={() => dispatch({ type: "zoom-out" })}>
        <MagnifyingGlassMinus />
      </button>
      <button 
        onClick={() => dispatch({ type: "toggle-draw-mode" })}
        className="draw-mode-toggle"
      >
        {drawMode ? <PencilIcon /> : <HandIcon />}
      </button>
      <button 
        onClick={() => dispatch({ type: "toggle-eraser-mode" })}
        className={`eraser-mode-toggle ${eraserMode ? 'active' : ''}`}
        style={{ display: drawMode ? 'block' : 'none' }}
      >
        <EraserIcon />
      </button>
      <div>
        {palette.map((color, index) => (
          <button
            key={index}
            className="color-button"
            style={{
              backgroundColor: palette[index],
              borderColor: index === colorIndex ? "black" : "transparent",
            }}
            onClick={() => dispatch({ type: "pick", index })}
          ></button>
        ))}
      </div>
    </div>
  );
}

type Point2D = { x: number; y: number };

type State = {
  size: number;
  down: boolean;
  erasing: boolean;
  pixelSize: number;
  colorIndex: number;
  pixels: Pixels;
  drawMode: boolean;
  eraserMode: boolean;
};

const initialState: State = {
  size: 256,
  down: false,
  erasing: false,
  pixelSize: 3,
  colorIndex: 0,
  pixels: new Pixels(),
  drawMode: false,
  eraserMode: false,
};

type Action =
  | { type: "init"; size: number }
  | { type: "pick"; index: number }
  | { type: "down"; where: Point2D; erase: boolean }
  | { type: "move"; where: Point2D }
  | { type: "up" }
  | { type: "leave" }
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "reset" }
  | { type: "toggle-draw-mode" }
  | { type: "toggle-eraser-mode" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "pick":
      return {
        ...state,
        colorIndex: action.index,
      };

    case "down":
    case "move":
      if (
        action.where.x < 0 ||
        action.where.x >= state.size ||
        action.where.y < 0 ||
        action.where.y >= state.size
      ) {
        return state;
      }

      if (action.type === "move" && !state.down) {
        return state;
      }

      const erasing = action.type === "down" ? action.erase : state.erasing;

      return {
        ...state,
        erasing,
        down: true,
        pixels: state.pixels.set(
          action.where.x,
          action.where.y,
          erasing ? null : state.colorIndex
        ),
      };

    case "up":
    case "leave":
      return { ...state, down: false, erasing: false };

    case "reset":
      return { ...state, pixels: new Pixels() };

    case "zoom-in":
      return { ...state, pixelSize: Math.min(20, state.pixelSize + 1) };

    case "zoom-out":
      return { ...state, pixelSize: Math.max(1, state.pixelSize - 1) };

    case "toggle-draw-mode":
      return { ...state, drawMode: !state.drawMode };

    case "toggle-eraser-mode":
      return { ...state, eraserMode: !state.eraserMode };

    default:
      return state;
  }
}

const RULES = `\
BasePaint Rules:

😊 Be Kind: Be patient with each other. We're all here to learn and create together.
🖌️ Be Original: Don't copy another artist's pixel artwork.
🥸 Be Yourself: One brush per painter. Use your brush invites on new artists!
🧠 Be Creative: Help others but don't trace or spam unnecessary pixels (blobs, checkers or borders).
⚠️ Keep It Clean: No QR Codes, project names, logos, offensive symbols, etc.
🎨 CC0: Your artwork on this canvas will be released under a CC0 license in the public domain.
`;

export default memo(Canvas);
