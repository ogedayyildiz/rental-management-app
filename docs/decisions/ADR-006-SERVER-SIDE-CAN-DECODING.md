# ADR-006: Keep Custom Machine CAN Decoding under Platform Control Where Raw/Configured CAN Is Available

## Status

Accepted

## Context

Many non-automotive machines use proprietary or manufacturer-specific CAN messages.

The platform may need signals such as:

```text
battery SOC
operating hours
machine active state
fault codes
charger status
controller state
```

The meaning of these values may be encoded in manufacturer-specific CAN IDs, PGNs, SPNs, bytes, bits, scaling factors, offsets, or signed values.

Ruptela has confirmed that its devices can capture configured custom CAN data and transmit it using Ruptela's proprietary protocol. The device does not indiscriminately stream the entire CAN bus; the required CAN data must be enabled in device configuration.

Xtellio currently appears to prefer provider-side CAN profiles and decoded values. Exact raw-CAN exposure through Xtellio APIs remains provider-dependent.

## Decision

When a provider makes configured/raw CAN values available to us, machine-specific CAN interpretation should be performed in our backend using versioned decoder profiles.

Keep these two layers separate:

```text
Provider Protocol Decoding
        ↓
CAN ID / configured CAN value
        ↓
Machine CAN Decoder
        ↓
Normalized Telemetry
```

For Ruptela:

```text
Ruptela Proprietary Protocol
        ↓
Ruptela Adapter
        ↓
Configured CAN Data
        ↓
Machine Decoder Profile
        ↓
Normalized Telemetry
```

Provider-side decoding may still be supported where the provider does not expose raw/configured CAN. In that case, the provider adapter maps the provider's decoded signals into the same normalized telemetry model.

The platform should therefore prefer server-side machine decoding where technically possible, without requiring every provider to operate that way.

## Decoder Profiles

Decoder definitions should be versioned and tied to appropriate machine models/protocol versions.

A decoder may define:

```text
CAN identifier / PGN / SPN
byte or bit position
length
endianness
signedness
scale
offset
unit
canonical signal
fault mapping
```

Machine assignments to decoder versions must preserve history.

Changing a decoder must not silently reinterpret historical data without an explicit reprocessing operation.

## Reasons

Server-side decoding gives us:

- control over machine intelligence;
- faster decoder updates;
- less provider dependency;
- version history;
- easier testing;
- consistent normalization across providers;
- the ability to improve decoders without replacing devices.

## Consequences

Positive:

- custom machinery is easier to support;
- decoder knowledge becomes our reusable platform asset;
- provider migration is easier when raw/configured data is available.

Negative:

- we must build and maintain decoders;
- device configuration and decoder expectations must stay aligned;
- incorrect decoder versions can produce incorrect data;
- not every provider will expose raw/configured CAN.

## Rules

1. Provider transport decoding and machine CAN decoding are separate responsibilities.
2. Ruptela device configuration must capture every CAN signal required by the selected decoder.
3. Missing telemetry must never be interpreted as zero unless the protocol explicitly defines it so.
4. Decoder versions must be traceable.
5. Machine protocol documentation should be version controlled under project documentation where appropriate.
6. Provider-decoded values must still enter the same normalized telemetry layer.

## Reconsideration

If a provider offers a fully transparent, documented raw-CAN streaming mechanism, transport may change but server-side decoder ownership remains desirable.

## Related Documents

- `ADR-002-PROVIDER-INDEPENDENT-TELEMETRY.md`
- `06-TELEMETRY-IOT.md`
- `11-CODING-STANDARDS.md`
