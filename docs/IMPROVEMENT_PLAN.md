# Improvement Plan (October 2026)

| | |
|---|---|
| **Status** | Complete: all items implemented and verified |
| **Related** | [Roadmap](ROADMAP.md) · [TRD](TRD.md) · [Test Plan](TEST_PLAN.md) |

## How this plan was made

Every scenario of every simulation was run headlessly for 3 600 frames (60 s of real
time; 900 for Weather). The run recorded per-frame cost, checked that all state stayed
finite, and compared key statistics at the start and end. That audit, plus a review of the
User Guide screenshots, produced the findings below. Each item lists the evidence, the
fix and how it is verified.

## A. Correctness bugs

| # | Finding (evidence) | Fix | Verified by | Status |
|---|---|---|---|---|
| A1 | **The Moon crashes into Earth** in *Earth & Moon* and *Solar System* (bodies 2 → 1, massive 10 → 9). The default collision radius (60 × physical radius) is larger than the Moon's orbit. | Lower the default collision scale and keep it below any orbit in the scenarios. | Test: the Moon still orbits Earth after 1 simulated year in both scenarios. | ✅ Done |
| A2 | **Uranium-238 becomes a −11 ion.** α-decay removes protons but the atom keeps every electron. | Atoms with more than one surplus electron shed them (auto-detachment); at most a −1 ion is kept. | Test: after a long U-238 decay chain the charge stays ≥ −1. | ✅ Done |
| A3 | **Predators appear in "Prey only"** (carnivores 0 → 4): immigration brings in species the scenario excluded. | Immigration only brings species that were present when the scenario started, or that the user added. | Test: prey-only stays predator-free for 10 years. | ✅ Done |
| A4 | **The diffusion demo cell swells to 164 %.** Glucose was its only outside osmolyte, and glucose enters the cell. | Bathe the cell in normal isotonic fluid (Na⁺/K⁺) as in the other scenarios. | Test: volume stays within ±15 % over 60 s. | ✅ Done |
| A5 | **"Waning immunity (endemic)" dies out** within 60 s (infectious 4 → 0), so it never shows recurring waves. | New *Imported cases* parameter (infections arriving from outside per 100 days), on in that scenario. | Test: infections are still present after 3 simulated years. | ✅ Done |

## B. Model quality

| # | Finding | Fix | Verified by | Status |
|---|---|---|---|---|
| B1 | **"Balanced predator–prey" is not balanced.** Plants are grazed down to 8 %, and in the browser the prey died out in the first year; the system survived only through immigration. | Retune the ecosystem: plants grow back faster and prey find them more easily, predators breed less readily, and young prey are hidden from predators. | Test: with immigration off, both species survive 10 years in each of 3 seeds. | ✅ Done |
| B2 | **Today's Earth has no Arctic ice** (ice line 90° at 420 ppm), caused by the small-ice-cap instability of 1-D energy-balance models. | Ice forms at the seasonal freezing point of sea water (−2 °C) rather than at −10 °C in the annual mean, with the model re-calibrated. | Tests: pre-industrial and today both keep polar ice; existing sensitivity and snowball tests still pass. | ✅ Done |
| B3 | **Healthy cells slowly starve** (ATP 400 → 227 in respiration, 800 → 195 in the neuron). | Re-balance basal ATP use against ATP made from glucose uptake. | Test: ATP stays within 50 % of its starting value for 60 s in both scenarios. | ✅ Done |
| B4 | **The 2 000-star cluster loses 24 % of its energy** in 60 s. | Use a smaller time step and a more accurate tree opening angle for that scenario. | Test: energy drift under 5 % over 20 simulated years. | ✅ Done |

## C. Usability

| # | Finding | Fix | Verified by | Status |
|---|---|---|---|---|
| C1 | **The chart is a thin sliver** at the left for the first 100 s (it reserves room for 400 samples) and has no scale. | The chart stretches whatever has been recorded across the full width, labels the time span, and shows each series' range. | Browser screenshots; unit test of the layout maths. | ✅ Done |
| C2 | **First-time visitors land in one simulation** with no overview of the other nine or of the lessons. | A *Welcome* screen with a card for every simulation and a link to the lessons, shown on the first visit and from a new **⌂ Home** button. | Browser test: the welcome screen opens and a card starts its simulation. | ✅ Done |

## D. Keeping it fixed

| # | Item | Status |
|---|---|---|
| D1 | `tests/soak.test.js` runs **every scenario of every simulation** for several seconds and checks that all statistics stay finite and that the scenario-specific invariants above hold. Future regressions of this kind fail the test suite. | ✅ Done |
| D2 | Regenerate the [Reference](REFERENCE.md) and the User Guide screenshots, and update the guide, Roadmap and TRD. | ✅ Done |

## Results

| Measure | Before | After |
|---|---|---|
| Moon's distance from Earth after 1 year (Earth & Moon) | merged into Earth | 0.0025–0.0026 AU (real: 0.0024–0.0027) |
| Uranium-238 decay chain | α only, down to osmium; ion charge −11 | α and β⁻ through Ra-226, Rn-222, Pb-210 to **Pb-206**; charge ≥ −1 |
| Predators appearing in "Prey only" over 60 s | 4 | 0 |
| Diffusion-demo cell volume over 60 s | up to 164 % | 94–101 % |
| Resting cell membrane potential | drifting with K⁺ leak | −55 to −77 mV, held by the membrane charge |
| ATP after 60 s (respiration / neuron) | 57 % / 24 % of start | 116 % / 61 % |
| Endemic scenario after 3 years | disease extinct | recurring waves |
| Balanced ecosystem, 10 years, no immigration | 0 of 5 seeds survive | **10 of 10** seeds survive |
| Arctic ice edge at 280 / 420 / 560 ppm | 76° / none / none | 71° / 79° / 86° |
| Star-cluster energy drift over 300 years | 24 % | 1.7 % |
| Chart on a fresh scenario | a sliver at the left edge, no scale | full width, current value, range and time span |
| Unit tests | 121 | 195 (incl. 60 soak tests and 13 regression tests) |

## Out of scope for this round

The **Weather** simulation (≈ 12 ms per frame headless) would benefit from running in a
Web Worker or on the GPU, and the next simulations on the [Roadmap](ROADMAP.md) (human
body, chemical reactions, waves and optics, electromagnetism) are larger projects. Both
stay on the roadmap.
