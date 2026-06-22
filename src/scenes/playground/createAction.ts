import * as BABYLON from "@babylonjs/core";
import type { PlaygroundAction, PlaygroundActionContext } from "./types";
import { BallChaos } from "./BallChaos";
import { BonkToys } from "./BonkToys";
import { Bowl } from "./Bowl";
import { DanceParty } from "./DanceParty";
import { FanBlast } from "./FanBlast";
import { LaunchBall } from "./LaunchBall";
import { MoonGravity } from "./MoonGravity";
import { PaintToys } from "./PaintToys";
import { SphereLight } from "./SphereLight";
import { SpinMerry } from "./SpinMerry";
import { SuperBounce } from "./SuperBounce";
import {Teleport} from "./Teleport";
import { ToggleDisco } from "./ToggleDisco";
import { ToggleLight } from "./ToggleLight";
import { ExplodeBalls } from "./ExplodeBalls";
import { TV } from "./TV";

export function createPlaygroundAction(id: string, mesh: BABYLON.AbstractMesh, context: PlaygroundActionContext, extras?: Record<string, unknown>): PlaygroundAction | undefined {
  if (id.startsWith("toggle-light-") && id.match(/^toggle-light-[0-9]+/)) {
    return new ToggleLight(context, id, mesh);
  }

  switch (id) {
    case "tv": return new TV(context, mesh, extras);
    case "ball-chaos": return new BallChaos(context);
    case "bowl": return new Bowl(context);
    case "toggle-disco": return new ToggleDisco(context);
    case "toggle-light-disco": return new ToggleDisco(context);
    case "launch-ball": return new LaunchBall(context);
    case "super-bounce": return new SuperBounce(context);
    case "fan-blast": return new FanBlast(context);
    case "moon-gravity": return new MoonGravity(context);
    case "paint-toys": return new PaintToys(context);
    case "spin-merry": return new SpinMerry(context);
    case "teleport": return new Teleport(context);
    case "dance-party": return new DanceParty(context);
    case "bonk-toys": return new BonkToys(context);
    case "sphere-light": return new SphereLight(context);
    case "explode-balls": return new ExplodeBalls(context);
    default: return undefined;
  }
}
