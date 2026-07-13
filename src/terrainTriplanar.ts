import * as THREE from 'three'

/**
 * Make a terrain MeshStandardMaterial sample its albedo (and roughness map, when
 * present) triplanar-ly from world position instead of from mesh UVs. This removes
 * the texture "stretching" that per-vertex planar UV projection produces on the
 * diagonal faces of surface caps, and gives seamless tiling on voxels too.
 *
 * `scale` is texture cycles per world unit (matches the old UV tiling frequency).
 */
export function applyTerrainTriplanar(
  material: THREE.MeshStandardMaterial,
  scale: number,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTriScale = { value: scale }

    shader.vertexShader =
      'varying vec3 vTriPos;\nvarying vec3 vTriNormal;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vTriPos = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
          vTriNormal = mat3( modelMatrix ) * ( mat3( instanceMatrix ) * objectNormal );
        #else
          vTriPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
          vTriNormal = mat3( modelMatrix ) * objectNormal;
        #endif`,
      )

    shader.fragmentShader =
      'varying vec3 vTriPos;\nvarying vec3 vTriNormal;\nuniform float uTriScale;\n' +
      shader.fragmentShader
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          // Soften lighting normals so cell-border creases don't read as voxel outlines.
          normal = normalize( mix( normal, normalize( vec3( normal.x, max( normal.y, 0.0 ) + 0.35, normal.z ) ), 0.42 ) );`,
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            // Soft triplanar blend (low power) — high power draws axis-flip lines on curves.
            vec3 nTri = normalize( vTriNormal );
            vec3 triW = pow( abs( nTri ), vec3( 2.5 ) );
            triW /= ( triW.x + triW.y + triW.z );
            vec4 triX = texture2D( map, vTriPos.zy * uTriScale );
            vec4 triY = texture2D( map, vTriPos.xz * uTriScale );
            vec4 triZ = texture2D( map, vTriPos.xy * uTriScale );
            vec4 sampledDiffuseColor = triX * triW.x + triY * triW.y + triZ * triW.z;
            diffuseColor *= sampledDiffuseColor;
          #endif`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = roughness;
          #ifdef USE_ROUGHNESSMAP
            vec3 nRough = normalize( vTriNormal );
            vec3 rW = pow( abs( nRough ), vec3( 2.5 ) );
            rW /= ( rW.x + rW.y + rW.z );
            float rX = texture2D( roughnessMap, vTriPos.zy * uTriScale ).g;
            float rY = texture2D( roughnessMap, vTriPos.xz * uTriScale ).g;
            float rZ = texture2D( roughnessMap, vTriPos.xy * uTriScale ).g;
            roughnessFactor *= rX * rW.x + rY * rW.y + rZ * rW.z;
          #endif`,
        )
  }

  // Keep textured/flat (and roughness) variants in separate program slots.
  material.customProgramCacheKey = () =>
    'terrain-triplanar-v2:' +
    (material.map ? 'm' : '') +
    (material.roughnessMap ? 'r' : '')
  material.needsUpdate = true
}
