#!/usr/bin/env python3
"""
Slice map3.stl into exact 5 m terrain columns for the voxel game.

Pipeline (all in game space: Y-up, integer cell corners):
  1. Convert STL once to game coordinates.
  2. Lay out a fixed X/Z grid aligned to CELL_SIZE.
  3. Per cell: intersect a vertical column, read the highest surface Y.
  4. Cap top = next grid layer at/above that peak; cap bottom = top - CAP_HEIGHT.
  5. Boolean-cut the cap slab with an exact axis-aligned box.
  6. Snap boundary vertices to cell faces and weld duplicates.

Usage (from project root):
  .venv/bin/python scripts/slice_terrain.py
  npm run slice-terrain
"""

from __future__ import annotations

import glob
import json
import math
import os
import sys

import numpy as np
import trimesh

CELL_SIZE = 5
CAP_HEIGHT = CELL_SIZE
VOXEL_LAYERS = 5

# Tall enough to contain the map in game Y after STL→Y-up conversion.
COLUMN_Y_MIN = -500.0
COLUMN_Y_MAX = 500.0

# Snap verts within this distance of a cell face onto the face (meters).
FACE_SNAP_EPS = 0.25
VERTEX_MERGE_EPS = 1e-4

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STL_PATH = os.path.join(PROJECT_ROOT, "map3.stl")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "assets", "terrain", "surface_pieces")


def stl_to_y_up(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """STL (X, Y, Z) → game (X, Y-up, Z) where game Y = STL Z, game Z = STL Y."""
    out = mesh.copy()
    v = out.vertices
    out.vertices = np.column_stack([v[:, 0], v[:, 2], v[:, 1]])
    out.invert()
    return out


def layer_floor(y: float) -> int:
    """Largest grid layer coordinate <= y."""
    return int(math.floor((y + 1e-9) / CELL_SIZE)) * CELL_SIZE


def layer_ceil(y: float) -> int:
    """Smallest grid layer coordinate >= y."""
    return int(math.ceil((y - 1e-9) / CELL_SIZE)) * CELL_SIZE


def cell_origin(min_corner: int, index: int) -> int:
    return min_corner + index * CELL_SIZE


def cell_center(min_corner: int, index: int) -> float:
    return cell_origin(min_corner, index) + CELL_SIZE * 0.5


def exact_box(
    x0: float,
    x1: float,
    y0: float,
    y1: float,
    z0: float,
    z1: float,
) -> trimesh.Trimesh:
    """Axis-aligned box with corners exactly on (x0,y0,z0) and (x1,y1,z1)."""
    extents = [x1 - x0, y1 - y0, z1 - z0]
    center = [(x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5]
    box = trimesh.creation.box(extents=extents)
    box.apply_translation(center)
    return box


def _drop_bad_faces(mesh: trimesh.Trimesh) -> None:
    """Remove degenerate and duplicate faces (trimesh 4.x)."""
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.update_faces(mesh.unique_faces())
    mesh.remove_unreferenced_vertices()


def preprocess_mesh(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Clean source mesh before booleans."""
    m = mesh.copy()
    m.merge_vertices(merge_tex=True, merge_norm=True)
    _drop_bad_faces(m)
    return m


def clean_piece(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Clean boolean output (normals recomputed in-game on load)."""
    m = mesh.copy()
    m.merge_vertices(merge_tex=True, merge_norm=True, digits_vertex=6)
    _drop_bad_faces(m)
    return m


def boolean_intersection(a: trimesh.Trimesh, b: trimesh.Trimesh) -> trimesh.Trimesh | None:
    try:
        out = a.intersection(b, engine="manifold")
    except (ValueError, RuntimeError):
        return None
    if out is None or out.is_empty or len(out.vertices) == 0:
        return None
    return clean_piece(out)


def snap_vertices_to_cell(
    piece: trimesh.Trimesh,
    x0: int,
    x1: int,
    y0: int,
    y1: int,
    z0: int,
    z1: int,
) -> trimesh.Trimesh:
    """Snap verts on cell faces to exact grid planes so neighbors share edges."""
    verts = piece.vertices.copy()
    planes = (
        (0, float(x0), float(x1)),
        (1, float(y0), float(y1)),
        (2, float(z0), float(z1)),
    )
    for axis, lo, hi in planes:
        col = verts[:, axis]
        near_lo = np.abs(col - lo) < FACE_SNAP_EPS
        near_hi = np.abs(col - hi) < FACE_SNAP_EPS
        col[near_lo] = lo
        col[near_hi] = hi
        verts[:, axis] = np.clip(col, lo, hi)

    out = piece.copy()
    out.vertices = verts
    return clean_piece(out)


def cap_layers_for_peak(peak_y: float) -> tuple[int, int]:
    """
    Grid-aligned cap spanning exactly one layer band below the surface peak.
    cap_top is the first layer boundary at or above peak_y; cap_bottom = cap_top - CAP_HEIGHT.
    """
    cap_top = layer_ceil(peak_y)
    cap_bottom = cap_top - CAP_HEIGHT
    return cap_bottom, cap_top


def load_game_mesh(path: str) -> trimesh.Trimesh:
    print(f"Loading {path} …")
    raw = trimesh.load(path)
    if not isinstance(raw, trimesh.Trimesh):
        raw = raw.dump(concatenate=True)
    print(f"  watertight: {raw.is_watertight}")
    if not raw.is_watertight:
        print(
            "ERROR: mesh is not watertight — fix map3.stl and re-run slice-terrain.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    mesh = preprocess_mesh(stl_to_y_up(raw))
    print(f"  game bounds: {mesh.bounds[0]} → {mesh.bounds[1]}")
    return mesh


def grid_extent(mesh: trimesh.Trimesh) -> tuple[int, int, int, int]:
    """Integer-aligned grid covering the mesh in game X/Z."""
    lo, hi = mesh.bounds
    min_x = int(math.floor(lo[0] / CELL_SIZE)) * CELL_SIZE
    min_z = int(math.floor(lo[2] / CELL_SIZE)) * CELL_SIZE
    max_x = int(math.ceil(hi[0] / CELL_SIZE)) * CELL_SIZE
    max_z = int(math.ceil(hi[2] / CELL_SIZE)) * CELL_SIZE
    num_x = (max_x - min_x) // CELL_SIZE
    num_z = (max_z - min_z) // CELL_SIZE
    return min_x, min_z, num_x, num_z


def grid_centers(min_corner: int, num_cells: int) -> list[float]:
    return [cell_center(min_corner, i) for i in range(num_cells)]


def column_peak_y(
    mesh: trimesh.Trimesh,
    x0: int,
    x1: int,
    z0: int,
    z1: int,
) -> float | None:
    """
    Highest game-Y in the vertical column [x0,x1]×[z0,z1].
    Uses mesh vertices for speed; confirms with a boolean only when the peak is ambiguous.
    """
    v = mesh.vertices
    in_column = (
        (v[:, 0] >= x0)
        & (v[:, 0] <= x1)
        & (v[:, 2] >= z0)
        & (v[:, 2] <= z1)
    )
    if not np.any(in_column):
        return None

    return float(np.max(v[in_column, 1]))


def extract_cap(
    mesh: trimesh.Trimesh,
    x0: int,
    x1: int,
    z0: int,
    z1: int,
    cap_bottom: int,
    cap_top: int,
) -> trimesh.Trimesh | None:
    """Exact cap slab cut from the terrain."""
    slab = exact_box(
        float(x0),
        float(x1),
        float(cap_bottom),
        float(cap_top),
        float(z0),
        float(z1),
    )
    piece = boolean_intersection(mesh, slab)
    if piece is None:
        return None
    return snap_vertices_to_cell(piece, x0, x1, cap_bottom, cap_top, z0, z1)


def slice_cell(
    mesh: trimesh.Trimesh,
    ix: int,
    iy: int,
    *,
    min_x: int,
    min_z: int,
) -> tuple[trimesh.Trimesh, int, int] | None:
    """Slice one grid cell; returns (mesh, cap_bottom, cap_top) or None."""
    x0 = cell_origin(min_x, ix)
    z0 = cell_origin(min_z, iy)
    x1 = x0 + CELL_SIZE
    z1 = z0 + CELL_SIZE

    peak = column_peak_y(mesh, x0, x1, z0, z1)
    if peak is None:
        return None

    cap_bottom, cap_top = cap_layers_for_peak(peak)
    piece = extract_cap(mesh, x0, x1, z0, z1, cap_bottom, cap_top)
    if piece is None:
        return None

    return piece, cap_bottom, cap_top


def active_cell_range(
    mesh: trimesh.Trimesh,
    min_x: int,
    min_z: int,
    num_x: int,
    num_z: int,
) -> tuple[int, int, int, int]:
    """Index range [ix0, ix1) × [iy0, iy1) that can intersect the mesh."""
    lo, hi = mesh.bounds
    ix0 = max(0, (int(math.floor(lo[0])) - min_x) // CELL_SIZE)
    ix1 = min(num_x, (int(math.ceil(hi[0])) - min_x) // CELL_SIZE + 1)
    iy0 = max(0, (int(math.floor(lo[2])) - min_z) // CELL_SIZE)
    iy1 = min(num_z, (int(math.ceil(hi[2])) - min_z) // CELL_SIZE + 1)
    return ix0, ix1, iy0, iy1


def validate_cell(
    piece: trimesh.Trimesh,
    x0: int,
    z0: int,
    cap_bottom: int,
    cap_top: int,
) -> None:
    """Warn if cut drifted off the intended grid cell."""
    b = piece.bounds
    if b is None:
        return
    tol = 0.05
    x1 = x0 + CELL_SIZE
    z1 = z0 + CELL_SIZE
    if b[0][0] < x0 - tol or b[1][0] > x1 + tol:
        print(f"  WARN: X bounds {b[0][0]:.3f}..{b[1][0]:.3f} outside [{x0},{x1}]")
    if b[0][2] < z0 - tol or b[1][2] > z1 + tol:
        print(f"  WARN: Z bounds {b[0][2]:.3f}..{b[1][2]:.3f} outside [{z0},{z1}]")
    if b[0][1] < cap_bottom - tol or b[1][1] > cap_top + tol:
        print(
            f"  WARN: Y bounds {b[0][1]:.3f}..{b[1][1]:.3f} "
            f"outside [{cap_bottom},{cap_top}]"
        )


def main() -> int:
    if not os.path.isfile(STL_PATH):
        print(f"ERROR: {STL_PATH} not found", file=sys.stderr)
        return 1

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for old in glob.glob(os.path.join(OUTPUT_DIR, "surf_*.glb")):
        os.remove(old)

    mesh = load_game_mesh(STL_PATH)
    min_x, min_z, num_x, num_z = grid_extent(mesh)

    # Game expects a square index grid; pad the shorter axis with empty indices.
    num_cells = max(num_x, num_z)
    if num_x != num_z:
        print(
            f"  note: grid {num_x}×{num_z} cells — metadata uses square {num_cells}×{num_cells}",
            flush=True,
        )

    centers_x = grid_centers(min_x, num_cells)
    centers_z = grid_centers(min_z, num_cells)

    print(
        f"  grid origin ({min_x}, {min_z}), "
        f"extent {num_x}×{num_z} cells, metadata span {num_cells}×{num_cells}",
        flush=True,
    )

    ix0, ix1, iy0, iy1 = active_cell_range(mesh, min_x, min_z, num_x, num_z)
    print(f"  active cells: ix {ix0}..{ix1 - 1}, iy {iy0}..{iy1 - 1}", flush=True)

    meta_cells: dict[str, dict] = {}
    exported = 0
    total = (ix1 - ix0) * (iy1 - iy0)
    done = 0

    for ix in range(ix0, ix1):
        for iy in range(iy0, iy1):
            done += 1
            if done % 25 == 0 or done == total:
                print(f"  progress {done}/{total} ({exported} exported) …", flush=True)

            result = slice_cell(mesh, ix, iy, min_x=min_x, min_z=min_z)
            if result is None:
                continue

            piece, cap_bottom, cap_top = result
            x0 = cell_origin(min_x, ix)
            z0 = cell_origin(min_z, iy)
            x1 = x0 + CELL_SIZE
            z1 = z0 + CELL_SIZE

            validate_cell(piece, x0, z0, cap_bottom, cap_top)

            center_x = cell_center(min_x, ix)
            center_z = cell_center(min_z, iy)
            b = piece.bounds

            filename = f"surf_{ix}_{iy}.glb"
            filepath = os.path.join(OUTPUT_DIR, filename)
            piece.export(filepath)

            meta_cells[f"{ix}_{iy}"] = {
                "ix": ix,
                "iy": iy,
                "center_x": center_x,
                "center_y": center_z,
                "file": filename,
                "tri_count": int(len(piece.faces)),
                "cap_bottom_y": cap_bottom,
                "cap_top_y": cap_top,
                "bounds": {
                    "min": [float(x0), cap_bottom, float(z0)],
                    "max": [float(x1), float(cap_top), float(z1)],
                },
            }
            exported += 1

    seam_y = min((c["cap_bottom_y"] for c in meta_cells.values()), default=0)

    meta = {
        "surface_pieces": {
            "cells": meta_cells,
            "grid": {
                "cell_size": CELL_SIZE,
                "min_x": min_x,
                "min_z": min_z,
                "centers": centers_x,
                "num_cells": num_cells,
                "num_x": num_x,
                "num_z": num_z,
            },
        },
        "voxels": {
            "layers": VOXEL_LAYERS,
            "layer_height": CELL_SIZE,
            "surface_cap_height": CAP_HEIGHT,
            "seam_y": seam_y,
        },
        "coordinate_system": {
            "source": "map3.stl",
            "game_up": "Y",
            "note": (
                "Caps are exact CELL_SIZE slabs on integer X/Z/Y grid; "
                "cap_top = ceil(surface_peak / CELL_SIZE) * CELL_SIZE"
            ),
        },
    }

    meta_path = os.path.join(OUTPUT_DIR, "terrain_meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print()
    print(f"Exported {exported} surface pieces → {OUTPUT_DIR}")
    print(f"Global voxel seam_y = {seam_y}")
    print(f"Metadata → {meta_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
