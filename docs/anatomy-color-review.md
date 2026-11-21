# Form anatomy color review

The reviewed GLB preserves the original 16 exported ZBrush subtools and their 640,470 triangles. Form regenerated the smooth normals, applied a warm gray clay to the exterior, charcoal to the hips, and violet to the quadriceps and glutes. This is a static color-review asset. Joint rigging, exercise animation, and the mobile rendering budget have separate verification before app integration.

## Source and license

[Male Full Body Ecorche](https://sketchfab.com/3d-models/male-full-body-ecorche-ab11ebff89224f03bd75efede1164cf6) by [Diego Luján García](https://sketchfab.com/diegoluga), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The source archive SHA-256 is `4809f332eddccfcd57e042a16a89b1b30cb61262d6a8f151f88b05342b009864`.

## Reproduce

Extract the inner source archive so the 16 `SubTool-*.OBJ` files are all in one directory. The command writes the GLB plus two rendered PNGs to the specified output directory.

```sh
node scripts/recolor-anatomy-sculpt.mjs /path/to/source/objects /path/to/review
```

The color review GLB SHA-256 is `dca25519b09052b09209076ab30d253b0657b60774718dce2857b0fc27656798`.
