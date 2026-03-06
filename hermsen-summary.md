## Section 4: Stroke Rate Tracking — Implementation Summary

### The Signal to Detect
The rowing stroke produces a characteristic acceleration pattern. The key feature for detection is the **negative acceleration peak at the catch** (when oar blades enter the water). This peak is consistently the deepest trough in the signal and has the highest correlation with stroke rate. Interval between consecutive catch peaks → SPM.

---

### Stage 1: Orientation-Invariant Preprocessing

Because the device can be placed anywhere on the boat in any orientation, raw axis readings can't be used directly. The preprocessing pipeline runs at **50 Hz**:

**Step 1 — Remove gravity (low-pass filter per axis):**
```
d = a - ā
```
Where `a = (ax, ay, az)` are raw readings and `ā` is the long-term running average of each axis. This isolates the dynamic (propulsive) component `d`.

**Step 2 — Find dominant axis:**
Over a sampling window, find the axis with the highest amplitude swing `amax`. This is the axis most aligned with the boat's direction of travel.

**Step 3 — Compute acceleration magnitude (Pythagorean):**
```
|a| = sqrt(dx² + dy² + dz²)
```

**Step 4 — Apply direction sign:**
```
if amax >= 0: signal = |a|
else:         signal = -|a|
```

**Step 5 — Resolve forward/backward ambiguity:**
Over a longer sampling window, compare the magnitude of the maximum vs. minimum of the signed signal. Because the catch deceleration peak is always deeper than the drive acceleration peaks, if `|max| > |min|`, the signal is inverted (flip sign of all values).

The result is a signed scalar signal where **negative peaks correspond to the catch** regardless of how the device is mounted.

---

### Stage 2: Stroke Detection

Two algorithms are described; the second is strongly preferred:

#### Algorithm 1 — Simple Peak Detection (Static Threshold) ❌ Not recommended
- Detect when signal drops below a fixed threshold (e.g. `-0.25g`)
- Store time when signal rises back above zero
- Problem: threshold needs per-boat tuning; SPM output is erratic due to peak timing variance

#### Algorithm 2 — Averaged Peak Detection (Dynamic Threshold) ✅ Recommended
**Threshold update:**
- Maintain a rolling buffer of the last 5 minimum values seen in successive windows
- `threshold = lowest_of_5_minima × 0.6`
- Enforce a minimum threshold floor (e.g. `-0.25g`) to suppress false triggers during rest

**Peak timing (the key improvement over Algorithm 1):**
- The absolute minimum of the trough is time-variable; the **threshold-crossing points are stable**
- Record `t_cross_down` = time signal drops below threshold
- Record `t_cross_up` = time signal rises above threshold  
- `peak_time = (t_cross_down + t_cross_up) / 2`
- This averaged crossing time is more temporally consistent than the raw minimum

**SPM calculation:**
```
SPM = 60.0 / (peak_time_current - peak_time_previous)
```

---

### Stage 3: Output / Tracking Logic
- If interval between two peaks > 6 seconds → ignore (SPM < 10 is considered a rest state, output 0)
- On each detected stroke, transmit a timestamp to shore; server computes SPM from two consecutive timestamps
- Start a 6-second watchdog timer per node; if no new peak arrives, set SPM = 0 (prevents stale readings)

---

### Key Implementation Parameters
| Parameter | Value |
|---|---|
| Accelerometer ODR | 50 Hz |
| Initial threshold | −0.25g |
| Dynamic threshold multiplier | 0.6 |
| Min peak buffer size | 5 previous minima |
| Rest detection cutoff | > 6 s between peaks |
| Threshold floor | −0.25g (prevents noise triggers at rest) |

---

### Validated Accuracy
The dynamic threshold algorithm was validated against video-annotated ground truth. It tracks SPM to within **±1–2 SPM** of actual stroke rate, matching or exceeding the commercial NK StrokeCoach. The one failure mode: when transitioning from race pace to low tempo, the threshold takes a few strokes to adapt and may miss 1–2 strokes.