# P6 Vehicle Contact — QR Physical Device Acceptance Plan

**Date:** 2026-11-22 (Asia/Bangkok)
**Owner delegation:** the Owner asked the assistant to choose the device/browser matrix and acceptance protocol ("คุณเลือกให้เลย"). This document records that choice.
**Scope:** physical camera acceptance of the delivered QR journey (PR #112, Frontend 0.8.0). Offline engineering evidence is in [QR_CAMERA_RECOVERY_EVIDENCE_20261122.md](QR_CAMERA_RECOVERY_EVIDENCE_20261122.md); this plan is the **human device gate**, which offline tests cannot satisfy.

## 1. Honest execution boundary

The assistant cannot hold or emulate a physical Android/iOS camera. The in-app browser is a desktop surface, not a phone, and cannot prove real-camera permission, rear/front switching, autofocus or sticker/glare decoding. **Physical acceptance must be executed by a named human reviewer on a real device.** The assistant prepares this protocol, the sanitized evidence template and the pass/fail criteria; the reviewer runs it and records results. This is a human gate, not an assistant sign-off.

## 2. Chosen device/browser matrix (minimum coverage)

| # | Platform | Device class (choose one available) | Browser | Why |
|---|---|---|---|---|
| D1 | Android mid-range | Samsung Galaxy A-series (A15/A35/A55) or equivalent | Chrome (latest stable) | Highest-volume real-world Thai police field device; rear-camera `facingMode` quirks |
| D2 | Android alternate | Xiaomi/Redmi or OPPO/Realme mid-range | Chrome + Samsung Internet | Second OEM camera HAL; verifies `enumerateDevices` switching |
| D3 | iOS | iPhone 12/13/14/15 (any available) | Safari (latest iOS) | WebKit `getUserMedia` differs from Blink; iOS permission prompt + HTTPS requirement |
| D4 | iOS alternate | iPhone SE / older iOS (≥15) | Safari | Lower-end iOS decode performance + torch absence |
| D5 | Desktop fallback | Any laptop with webcam | Chrome | Image-fallback path (bounded JPEG/PNG/WebP) and no-camera graceful degradation |

Minimum to close the gate: **D1 + D3** (one Android Chrome, one iOS Safari). D2/D4/D5 strengthen coverage. Record exact model + OS version + browser version per run.

## 3. Pre-conditions

- Reviewed Pages publication of Frontend 0.8.0 (QR adapter from PR #112) over **HTTPS** (camera requires secure context).
- A synthetic DEV vehicle with an issued QR token (from the clean-init reset); a printed/on-screen QR sticker for glare/angle tests.
- Reviewer uses a synthetic DEV account; no real PII. Evidence sanitized (no tokens, plates of real vehicles, faces or credentials).

## 4. Acceptance checklist (per device)

| Step | Action | Pass criterion |
|---|---|---|
| A1 | Open QR scan page, tap "start camera" | Camera starts **only after explicit tap**; permission prompt appears |
| A2 | Grant permission | Rear camera preferred (`facingMode: environment`); live preview visible |
| A3 | Deny permission (separate run) | Graceful message; image-fallback offered; no crash, no console error leak |
| A4 | Scan a valid synthetic QR sticker | Strict 64-hex token forwarded to `qr.resolve`; correct vehicle shown |
| A5 | Switch facing mode / pick another camera | Switch works; previous stream tracks released (no frozen preview) |
| A6 | Scan glare / angle / low light | Decode succeeds or fails gracefully; retry works |
| A7 | Stop / navigate away / background tab | Camera/decoder cleanup on stop, page hide, visibility loss, teardown; camera indicator off |
| A8 | Re-enter scan page | Fresh start works; no disposed-scanner reactivation |
| A9 | Image fallback (no camera / D5) | Bounded JPEG/PNG/WebP upload decodes; oversize/invalid type rejected |
| A10 | Inspect storage | Decoded token NOT in URL, localStorage, sessionStorage or presentational state |

## 5. Evidence template (sanitized, per device)

```
Device: <model> / OS <version> / Browser <version>
Pages build: <frontend version + commit>
A1..A10: PASS/FAIL each (one line)
Camera permission: granted/denied behavior observed
Cleanup: camera indicator off after stop/teardown (yes/no)
Defects: <sanitized description, no PII/tokens>
Reviewer: <name>  Date: <ISO>  Result: PASS/FAIL
```

## 6. Gate closure rule

The QR physical-device gate closes only when **D1 and D3** (minimum) record all A1–A10 PASS with sanitized evidence reviewed by the Owner. Any FAIL opens a defect slice. Offline 16/16 QR tests and 192/192 Frontend tests remain necessary but **not sufficient** for this gate. Assistant cannot self-approve physical acceptance.