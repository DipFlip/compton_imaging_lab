# LaBr3 Compton geometry lab

Run `npm ci` once, then `npm start` and open http://127.0.0.1:8765. No build step is needed for local development. Three.js is pinned locally and the room model is bundled, so runtime rendering makes no external asset requests. `npm test` checks the physics calculations and reconstruction. Web workers keep calculations off the UI thread.

Eight independently layer-rotated 1.4 × 1.4 × 2.54 cm crystals form two square layers. Separation means center-to-center; gaps mean edge-to-edge. Both interaction orders contribute to an unordered A–B hit pair. Source coordinates and reconstruction use a sphere centered at the camera midpoint; selected source distance (25–300 cm from the camera midpoint) is known, not estimated.

## Explore

- Move the source with the azimuth/elevation/radius sliders, the three presets, or a click on the full-sky map. Drag the room to orbit and scroll to zoom. Use Detector close-up or Room view to reset the external camera.
- The default reconstruction view overlays intensity on a rendered room image from the detector midpoint. Drag to look around, scroll to change field of view, use Look front / Look back, or enable Follow source. Heat opacity controls only display. Choose Full sky map to inspect all directions.
- Set source activity from 0.1 µCi to 10 mCi and measurement time from 1 second to 5 hours. Logarithmic sliders span the range; numeric inputs allow exact values. One photon at the selected energy is emitted per decay. Expected emitted photons = activity in µCi × 37,000 × time in seconds. Expected accepted events then multiply by the detector model efficiency. The displayed acquisition is a Poisson realization, so short measurements may have zero events. Activity is assumed constant; no half-life or dead time is modeled. MLEM supports every integer from 1 to 100 iterations.
- The default **Sample crystal volumes** generator integrates random interaction positions and exact ray attenuation. **Match reconstruction model** is a useful control that generates data using the reconstruction response itself.
- **Sweep 4–80 cm** holds source position, radius, gaps and energy resolution fixed, and evaluates eight separations. Select a spacing in the result table to reconstruct it. Changing a held-fixed parameter invalidates the sweep.
- Record completed reconstructions and export comparisons. Sweeps have a separate CSV export. Both exports preserve the relevant geometry and model parameters.

## Room visualization and registration

`room-view.js` renders the stripped CC0 room from the Three.js inverse-kinematics example, with its existing brown coffee table, windows, walls and furniture. The original character and mirror sphere are removed from the model scene graph, meshes, skin and animation definitions. The ceiling is hidden at runtime for an open room view; walls receive a lighter finish; the tables retain their original brown materials. Attribution and reproduction instructions are in [assets/README.md](assets/README.md).

Crystals retain their real dimensions. Detector coordinates in cm are divided by 100 and translated to the table in meters. Each layer sits on its own 10 cm tall support block, extending the original small base down to the tabletop. There is no shared platform or surface between the layers; the blocks and small crystal frames are visual only. The external view opens zoomed out; detector and source labels stay at a fixed 12 CSS px with leader lines as the view zooms. Layer label screen offsets are 28 px and the source-label offset is 14 px. The source sphere has a 2 cm visual radius. When vertical crystal gaps increase, the camera midpoint and frames rise so the assembly remains above the table. The source and optical viewpoint use the same translation.

The detector image is a live render from the detector midpoint, not an actual photograph. The detector assembly is hidden only in this optical view to avoid blocking the virtual midpoint camera. The scene's table and other objects remain visible. The room does not affect the gamma transport: photons do not scatter in or attenuate through the room or supports. Sources can be placed beyond a wall or below the floor; those surfaces are just spatial references.

Each optical pixel defines a perspective ray in camera coordinates. Rotate it into world coordinates, compute azimuth = atan2(ray.x, −ray.z) and sin(elevation) = ray.y, and sample the equal-area sky texture at ((azimuth+π)/(2π), (1−ray.y)/2). Thus panning or changing field of view moves the room image and heat map together. The truth cross and peak circle are independently projected through the same camera. The camera's translation equals the reconstruction sphere center, avoiding a parallax mismatch. A real photograph would need intrinsics and an extrinsic pose registered to the detector system.

The overlay uses bilinear interpolation of the 72 × 36 intensity grid, with periodic wrapping at the azimuth seam. Intensity is normalized to the full-sky maximum; changing the visible field of view does not renormalize it. Alpha is opacity × intensity^0.6 for legibility, and the texture quantizes display intensity to 8 bits. These are presentation choices only; image statistics use the original reconstruction. The heat map is a direction distribution, not an estimate that activity lies on a visible wall or other surface. The full-sky view retains the native pixel grid.

## Material and energy model

Total attenuation is log interpolated from NIST La/Br data and mixed by formula mass. Free-electron Compton scattering is calculated analytically using 162 electrons per LaBr3 formula unit. The remaining attenuation is a direct photoelectric proxy that also contains coherent scattering. Density is 5.08 g/cm³. At 1 MeV, μ ≈ 0.294 cm⁻¹, giving about 53% probability of any interaction over a normal 2.54 cm path. That is not a usable coincidence or full-energy peak efficiency.

The channel is exactly one Compton interaction in one layer followed by direct absorption in the other. The scattered photon energy is E₀/[1+E₀(1−cos θ)/0.511] MeV. The differential angular probability follows the normalized Klein–Nishina distribution. Source energy E₀ is adjustable from 50 keV to 3 MeV. Pair production is not explicitly simulated; above its threshold, the total-minus-Compton absorption proxy also includes pair production and can overestimate full-energy absorption.

Deposited energy in A is binned in 100 bins from zero to the selected source energy. The adjustable per-hit threshold (0–200 keV, default 20 keV) clips the accepted interval to [threshold, source energy−threshold] keV, including partial bins. Both orders contribute to each pair's spectrum. Intrinsic energy sigma is (0.026/2.355)√(0.662 E) MeV by default. The known source total-energy constraint combines two measurements, giving variance (resolution_fraction/2.355)² × 0.662 × E_A × E_B / (E_A+E_B). Gaussian probabilities are integrated over bin edges, including threshold losses. The other constrained energy is the source energy minus the energy in A. This is not an independently smeared two-energy photopeak gate.

## Volume event generator

`transport.js` samples 1,024 pairs of uniform positions for each of 16 crystal pairs and both orders: 32,768 position pairs in total. For sampled scatter position a, absorption position b and source s, the importance weight is

    V² μ_Compton(1) P_KN(cos θ) μ_photo(E′)
    × exp[−μ(1)L(s,a)−μ(E′)L(a,b)] / [4π |a−s|² |b−a|²].

V is the volume of one crystal. P_KN is normalized per steradian. L is the total material length of a segment through all eight oriented crystal boxes. Ray/box intersections therefore account for attenuation to the first position, escape after scattering, attenuation before absorption, and shadowing by other crystals. Vacuum/air paths add no attenuation. Summing the averaged contributions of every pair/order integrates the restricted channel probability per isotropically emitted photon without explicitly launching the missed photons.

For each sampled position pair, integrate the energy noise over measurement-bin edges. Then draw the requested acquisition from the resulting spectrum. Activity/time acquisitions use independent Poisson bins with means from the expected emitted photons (normal approximation above mean 30). Legacy fixed-count/budget paths remain available to numerical tests but are not UI controls. A fixed integration seed keeps the numerical response stable when requesting a new random acquisition. The acquisition seed changes its counting noise. Sweeps use common random position samples across spacings to reduce comparative integration noise.

Rate sampling standard errors use independent uniform samples within each pair/order, summed in quadrature across strata. They quantify numerical integration uncertainty, not uncertainty in the material model, omitted physics, or the acquisition's Poisson noise.

## Reconstruction response

`physics.js` uses a faster approximation for each candidate source direction: projected area A/(4πr²), first Compton probability over a V/A mean chord, outgoing survival over half a mean chord, normalized Klein–Nishina probability, second-crystal solid angle and direct absorption probability. Independent unknown crystal coordinates have variance dimension²/12; finite differences propagate those variances into deposited-energy variance to first order. This positional variance is combined with energy resolution.

The response matrix A_ij is absolute probability per emitted photon for measurement bin i and sky pixel j. The equal-solid-angle 72 × 36 sky grid is uniform in azimuth and sin(elevation). Binned Poisson MLEM updates

    f_j ← f_j / (sum_i A_ij) × sum_i A_ij y_i / (Af)_i.

Normalizing f after each iteration changes only its arbitrary overall scale. All measurement bins enter sensitivity, including zero-count bins. The response has no access to the source truth, true interaction order, or sampled sub-crystal positions. The sensitivity map shows this approximate response, not the full-sky volume-integrated model.

The volume generator is separate from the reconstruction's geometry and transport approximation. It shares the material and energy-response assumptions. This is a useful model-mismatch check, not independent validation against Geant4 or measured data.

## Angular diagnostics

The spacing sweep shows two single-event angular resolution measure (ARM) RMS values: energy plus unknown position, and unknown position alone. ARM is the energy-inferred scattering angle minus the angle computed from detector centers and the known simulated source. Only the diagnostic uses the true order; MLEM always sums both orders.

For diagnostics, one independent Gaussian energy draw is used per weighted volume sample. Accepted events whose smeared energy implies an unphysical Compton angle cannot have an ARM value and are excluded from the ARM diagnostic. The table reports that physical-angle fraction. Such energy bins remain in the acquisition and reconstruction. The position-only statistic uses the same eligible events. The RMS values include bias; they are not Gaussian FWHM estimates or localization error. Near forward/backward scattering, non-Gaussian residuals and the physical-angle selection are significant.

Peak error is the angular distance between one reconstruction's maximum and the simulated source. The 68% image radius measures intensity concentration about that maximum, not a confidence interval, detector angular resolution, or two-source resolving power. Sky-grid scale, counts and iteration count all influence it. For a statistically supported resolution claim, repeat acquisitions, measure bias/variance and test two-source separation with an independently validated response.

## Limitations

Both generators estimate only a single-scatter/direct-absorption channel. They omit same-layer pairs, multiple Compton interactions, secondary-electron escape, fluorescence escape, packaging, Doppler broadening, intrinsic background, random coincidences and dead time. The photoelectric proxy contains coherent scattering and is not a measured photopeak efficiency. The reconstruction additionally omits inter-crystal shadowing and uses mean-chord/first-order approximations, which can be poor at close spacing or grazing angles. Model mismatch may therefore bias the reconstructed image. Front/back ambiguities can remain.

Single hits cannot define an individual Compton cone. They can support spectroscopy or a calibrated count-rate likelihood, which is not included here.

## Verification

Tests cover NIST mass mixing, Klein–Nishina normalization, front/back symmetry of the approximate response, narrow-bin and threshold probability integration, ray/box path lengths, volume-integration convergence, repeatability, fixed counts, zero counts, finite MLEM outputs and nondecreasing profiled Poisson likelihood. Worker tests include an oblique source, a back source, and short spacing with unequal crystal gaps.

Sources:
- https://pml.nist.gov/PhysRefData/XrayMassCoef/ElemTab/z57.html
- https://pml.nist.gov/PhysRefData/XrayMassCoef/ElemTab/z35.html
- https://luxiumsolutions.com/radiation-detection-scintillators/crystal-scintillators/lanthanum-bromide-labr3
- https://fismed.ciemat.es/GAMOS/GAMOS_doc/GAMOS.6.0.0/ComptonCamera/ComptonCamera.html

Activity conversion reference: https://physics.nist.gov/cuu/pdf/sp330.pdf (1 Ci = 3.7 × 10¹⁰ Bq).

Layer A and B yaw sliders rotate each complete layer about its own center and the vertical (up) axis, from −90° to +90°. Crystal positions, projected areas, position uncertainty and transport ray intersections use these orientations. Overlapping crystal configurations are rejected; separation sweeps skip overlapping points.

The Gamma paths scene toggle shows up to 16 strongest accepted crystal-pair/order routes. Plasma purple to yellow spans the minimum to maximum displayed integrated accepted probability; line thickness encodes probability relative to the strongest route for the current source, geometry and threshold; arrowheads point from the first interaction toward absorption. These center-to-center paths illustrate weighted routes rather than individual simulated photon tracks. They are hidden from the detector POV image.

## Deploy to Vercel

Import `DipFlip/compton_imaging_lab` into Vercel and deploy the `main` branch. The checked-in `vercel.json` selects the Other framework preset, installs with `npm ci`, builds with `npm run build`, and serves `dist`. No environment variables or backend services are required.

The build copies the browser app, module workers, room asset and locally installed Three.js modules into a standalone static directory, including third-party attribution. Preview the production build with `python3 -m http.server 8766 --directory dist` and open http://127.0.0.1:8766.

Vercel configuration reference: https://vercel.com/docs/project-configuration/vercel-json

The attenuation table covers 40 keV–3 MeV (including the minimum scattered energy for a 50 keV incident photon). NIST values are log-interpolated; the energy resolution still uses the toy square-root scintillation scaling. At low energies the uniform-volume integral can have substantial sampling uncertainty because attenuation confines interactions near surfaces.
