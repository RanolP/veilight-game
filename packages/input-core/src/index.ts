import type { MonotonicTimestamp, SpatialPoint } from "@internal/foundation";

export type KeyId = string;

export type KeyModifiers = Readonly<{
  ctl: boolean;
  sft: boolean;
  alt: boolean;
  gui: boolean;
}>;

export type KeyboardInputEvent = KeyDownInputEvent | KeyUpInputEvent;

export type KeyDownInputEvent = Readonly<{
  type: "keyboard/key-down";
  keyId: KeyId;
  repeat: boolean;
  modifiers: KeyModifiers;
  time: MonotonicTimestamp;
}>;

export type KeyUpInputEvent = Readonly<{
  type: "keyboard/key-up";
  keyId: KeyId;
  modifiers: KeyModifiers;
  time: MonotonicTimestamp;
}>;

export type PointerId = number;
export type PointerKind = "mouse" | "pen" | "touch" | "unknown";
export type PointerButtonId = string;

export type PointerInputEvent =
  | PointerMoveInputEvent
  | PointerButtonDownInputEvent
  | PointerButtonUpInputEvent
  | PointerCancelInputEvent
  | PointerWheelInputEvent;

export type PointerMoveInputEvent = Readonly<{
  type: "pointer/move";
  pointerId: PointerId;
  kind: PointerKind;
  position: SpatialPoint;
  pressure: number;
  time: MonotonicTimestamp;
}>;

export type PointerButtonDownInputEvent = Readonly<{
  type: "pointer/button-down";
  pointerId: PointerId;
  kind: PointerKind;
  buttonId: PointerButtonId;
  position: SpatialPoint;
  pressure: number;
  time: MonotonicTimestamp;
}>;

export type PointerButtonUpInputEvent = Readonly<{
  type: "pointer/button-up";
  pointerId: PointerId;
  kind: PointerKind;
  buttonId: PointerButtonId;
  position: SpatialPoint;
  pressure: number;
  time: MonotonicTimestamp;
}>;

export type PointerCancelInputEvent = Readonly<{
  type: "pointer/cancel";
  pointerId: PointerId;
  kind: PointerKind;
  time: MonotonicTimestamp;
}>;

export type PointerWheelInputEvent = Readonly<{
  type: "pointer/wheel";
  position: SpatialPoint;
  delta: WheelDelta;
  time: MonotonicTimestamp;
}>;

export type WheelDelta = Readonly<{
  x: number;
  y: number;
  z: number;
  unit: WheelDeltaUnit;
}>;

export type WheelDeltaUnit = "pixel" | "line" | "page";

export const ZERO_WHEEL_DELTA: WheelDelta = Object.freeze({ x: 0, y: 0, z: 0, unit: "pixel" });

export type GamepadId = number;
export type GamepadMapping = "standard" | "unknown";
export type GamepadButtonId = string;
export type GamepadAxisId = string;

export type GamepadInputEvent =
  | GamepadConnectedInputEvent
  | GamepadDisconnectedInputEvent
  | GamepadSampleInputEvent;

export type GamepadConnectedInputEvent = Readonly<{
  type: "gamepad/connected";
  gamepadId: GamepadId;
  name: string;
  mapping: GamepadMapping;
  time: MonotonicTimestamp;
}>;

export type GamepadDisconnectedInputEvent = Readonly<{
  type: "gamepad/disconnected";
  gamepadId: GamepadId;
  time: MonotonicTimestamp;
}>;

export type GamepadSampleInputEvent = Readonly<{
  type: "gamepad/sample";
  gamepadId: GamepadId;
  buttons: readonly GamepadButtonSample[];
  axes: readonly GamepadAxisSample[];
  time: MonotonicTimestamp;
}>;

export type GamepadButtonSample = Readonly<{
  buttonId: GamepadButtonId;
  pressed: boolean;
  touched: boolean;
  value: number;
}>;

export type GamepadAxisSample = Readonly<{
  axisId: GamepadAxisId;
  value: number;
}>;

export type TextInputEvent = TextUpdateInputEvent | TextDismissInputEvent;

export type TextUpdateInputEvent = Readonly<{
  type: "text/update";
  text: string;
  time: MonotonicTimestamp;
}>;

export type TextDismissInputEvent = Readonly<{
  type: "text/dismiss";
  reason: "submit" | "cancel" | "blur";
  time: MonotonicTimestamp;
}>;

export type TextInputAnchor = Readonly<{
  position: SpatialPoint;
}>;

export type EnterAction = "submit" | "newline" | "ignore";

export type EnterBehavior = Readonly<{
  default: EnterAction;
  modKey?: EnterAction;
}>;

export type TextInputOptions = Readonly<{
  anchor: TextInputAnchor;
  initialText?: string;
  enterBehavior: EnterBehavior;
}>;

export type TextInputSession = {
  events: AsyncIterable<TextInputEvent>;
  setAnchor(anchor: TextInputAnchor): void;
  close(): void;
};

export type NativeTextInput = Readonly<{
  openTextInput(options: TextInputOptions): TextInputSession;
}>;

export type FocusInputEvent = FocusLostInputEvent | FocusGainedInputEvent;

export type FocusLostInputEvent = Readonly<{
  type: "focus/lost";
  reason: FocusLostReason;
  time: MonotonicTimestamp;
}>;

export type FocusGainedInputEvent = Readonly<{
  type: "focus/gained";
  time: MonotonicTimestamp;
}>;

export type FocusLostReason = "blur" | "hidden" | "suspend" | "unknown";

export type InputEvent =
  | KeyboardInputEvent
  | PointerInputEvent
  | GamepadInputEvent
  | TextInputEvent
  | FocusInputEvent;

export function isHostFallbackId(id: string): boolean {
  return id.startsWith("HOST:");
}
