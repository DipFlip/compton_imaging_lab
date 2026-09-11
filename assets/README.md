# Room asset attribution

`room.glb` is derived from `examples/models/gltf/kira.glb` in mrdoob/three.js, retrieved September 11, 2026.

Source: https://github.com/mrdoob/three.js/blob/master/examples/models/gltf/kira.glb
Example and credits: https://github.com/mrdoob/three.js/blob/master/examples/webgl_animation_skinning_ik.html

The example credits the scene to **abernier**, furniture from **poly.pizza**, and identifies the scene as **CC0**. The example's character credit is Aki; the character is not used here.

Modifications: remove all character/bone/skin scene nodes and the `boule` mirror sphere node; remove their mesh entries, animation and skin definitions. Unreferenced source buffer bytes remain in the GLB but no character or mirror sphere is instantiated. The ceiling is hidden at runtime, and the walls receive lighter materials; the original table finishes are retained. Detectors, supports, labels and source marker are newly constructed geometry.

Reproduce the model extraction with `python3 scripts/prepare-room.py /path/to/kira.glb`. The model is bundled locally and does not require a remote asset request at runtime.

Three.js itself is MIT licensed; its license is installed at `node_modules/three/LICENSE`.
