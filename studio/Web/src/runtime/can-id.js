// Avlos CAN id packing (must match firmware/Python client) and heartbeat
// constants. Both halves of the addressing scheme live here so the parts
// of the runtime that have to filter or build arbitration ids share one
// source of truth.
//
//   id = (node_id << 21) | (hash_low8 << 12) | ep_id
//
// Constants come from studio/Python/tinymovr/constants.py.

const CAN_EP_SIZE   = 12;
const CAN_HASH_SIZE = 9;
const CAN_DEV_SIZE  = 8;
const CAN_EP_MASK   = (1 << CAN_EP_SIZE) - 1;
const CAN_HASH_MASK = ((1 << CAN_HASH_SIZE) - 1) << CAN_EP_SIZE;
const CAN_DEV_MASK  = ((1 << CAN_DEV_SIZE)  - 1) << (CAN_EP_SIZE + CAN_HASH_SIZE);

export function arbitrationFromIds(epId, hashLow, nodeId) {
  return ((nodeId << (CAN_EP_SIZE + CAN_HASH_SIZE)) & CAN_DEV_MASK)
       | ((hashLow << CAN_EP_SIZE) & CAN_HASH_MASK)
       | (epId & CAN_EP_MASK);
}

export function idsFromArbitration(arb) {
  return {
    epId:   arb & CAN_EP_MASK,
    hash:  (arb & CAN_HASH_MASK) >> CAN_EP_SIZE,
    nodeId:(arb & CAN_DEV_MASK)  >> (CAN_EP_SIZE + CAN_HASH_SIZE),
  };
}

export const HEARTBEAT_BASE = 0x700;
// Mask everything except the 6 node-id bits. This matches the firmware's
// `0x700 | config.id` heartbeat ID for both extended (Tinymovr 2.x; see
// `can_transmit_extended` in firmware/src/can/can.c) and standard (older
// or other CANopen-style devices) frames, while rejecting avlos response
// frames which always have higher-order bits set.
export const HEARTBEAT_NODE_ID_MASK = 0x3f;
export const HEARTBEAT_MASK = ~HEARTBEAT_NODE_ID_MASK;  // = -0x40 in JS bitwise
export const HEARTBEAT_TIMEOUT_MS = 5000;
