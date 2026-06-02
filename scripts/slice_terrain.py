#!/usr/bin/env python3
"""
Slice map3.stl into exact 5 m terrain columns for the voxel game.

Each cell is a perfect axis-aligned box on the integer grid:
  X/Z: [min + ix*CELL, min + (ix+1)*CELL]
  Y cap: [cap_bottom, cap_top] with cap_top = ceil(peak / CELL) * CELL

Pipeline (game space: Y-up):
  1. STL → game coordinates once.
  2. Per cell: boolean ∩ vertical column → accurate peak Y.
  3. Boolean ∩ cap slab (column ∩ slab, not full mesh).
  4. Hard-clip vertices to the cell box; snap boundary verts to exact planes.
  5. Export in world space (no shift to cell corner — partial caps keep true position).

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

# Tall column used to find terrain inside each XZ cell.
COLUMN_Y_MIN = -500.0
COLUMN_Y_MAX = 500.0

# Vert within this distance of a cell face is snapped to that face (meters).
BOUNDARY_SNAP = 1e-3
# After snap, clip any overshoot (boolean tolerance).
CLIP_PAD = 1e-6
VERTEX_MERGE_DIGITS = 8

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STL_PATH = os.path.join(PROJECT_ROOT, "map3.stl")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "assets", "terrain", "surface_pieces")


def stl_to_y_up(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """STL (X, Y, Z) → game (X, Y-up, Z): game Y = STL Z, game Z = STL Y."""
    out = mesh.copy()
    v = out.vertices
    out.vertices = np.column_stack([v[:, 0], v[:, 2], v[:, 1]])
    out.invert()
    return out


def layer_ceil(y: float) -> int:
    """Smallest grid layer coordinate >= y (CELL_SIZE steps)."""
    if y <= 0:
        return int(math.ceil(y / CELL_SIZE - 1e-12)) * CELL_SIZE
    return int(math.ceil((y - 1e-12) / CELL_SIZE)) * CELL_SIZE


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
    extents = (x1 - x0, y1 - y0, z1 - z0)
    center = ((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5)
    box = trimesh.creation.box(extents=extents)
    box.apply_translation(center)
    return box


def _drop_bad_faces(mesh: trimesh.Trimesh) -> None:
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.update_faces(mesh.unique_faces())
    mesh.remove_unreferenced_vertices()


def preprocess_mesh(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    m = mesh.copy()
    m.merge_vertices(merge_tex=True, merge_norm=True)
    _drop_bad_faces(m)
    return m


def clean_piece(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    m = mesh.copy()
    m.merge_vertices(merge_tex=True, merge_norm=True, digits_vertex=VERTEX_MERGE_DIGITS)
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


def snap_and_clip_to_box(
    piece: trimesh.Trimesh,
    x0: int,
    x1: int,
    y0: int,
    y1: int,
    z0: int,
    z1: int,
) -> trimesh.Trimesh:
    """
    Force the piece inside the cell box and weld boundary verts to exact grid planes.
    """
    lo = (float(x0), float(y0), float(z0))
    hi = (float(x1), float(y1), float(z1))
    verts = piece.vertices.copy()

    for axis, (plane_lo, plane_hi) in enumerate(zip(lo, hi)):
        col = verts[:, axis]
        near_lo = np.abs(col - plane_lo) <= BOUNDARY_SNAP
        near_hi = np.abs(col - plane_hi) <= BOUNDARY_SNAP
        col[near_lo] = plane_lo
        col[near_hi] = plane_hi
        verts[:, axis] = np.clip(col, plane_lo - CLIP_PAD, plane_hi + CLIP_PAD)

    out = piece.copy()
    out.vertices = verts
    return clean_piece(out)


def cap_layers_for_peak(peak_y: float) -> tuple[int, int]:
    cap_top = layer_ceil(peak_y)
    cap_bottom = cap_top - CAP_HEIGHT
    return cap_bottom, cap_top


def load_game_mesh(path: str) -> trimesh.Trimesh:
    print(f"Loading {path} …", flush=True)
    raw = trimesh.load(path)
    if not isinstance(raw, trimesh.Trimesh):
        raw = raw.dump(concatenate=True)
    print(f"  watertight: {raw.is_watertight}", flush=True)
    if not raw.is_watertight:
        print(
            "ERROR: mesh is not watertight — fix map3.stl and re-run slice-terrain.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    mesh = preprocess_mesh(stl_to_y_up(raw))
    print(f"  game bounds: {mesh.bounds[0]} → {mesh.bounds[1]}", flush=True)
    return mesh


def grid_extent(mesh: trimesh.Trimesh) -> tuple[int, int, int, int]:
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


def intersect_column(
    mesh: trimesh.Trimesh,
    x0: int,
    x1: int,
    z0: int,
    z1: int,
) -> trimesh.Trimesh | None:
    column = exact_box(
        float(x0), float(x1), COLUMN_Y_MIN, COLUMN_Y_MAX, float(z0), float(z1)
    )
    return boolean_intersection(mesh, column)


def extract_cap_from_column(
    column: trimesh.Trimesh,
    x0: int,
    x1: int,
    z0: int,
    z1: int,
    cap_bottom: int,
    cap_top: int,
) -> trimesh.Trimesh | None:
    slab = exact_box(
        float(x0), float(x1), float(cap_bottom), float(cap_top), float(z0), float(z1)
    )
    piece = boolean_intersection(column, slab)
    if piece is None:
        return None
    return snap_and_clip_to_box(piece, x0, x1, cap_bottom, cap_top, z0, z1)


def slice_cell(
    mesh: trimesh.Trimesh,
    ix: int,
    iy: int,
    *,
    min_x: int,
    min_z: int,
) -> tuple[trimesh.Trimesh, int, int] | None:
    x0 = cell_origin(min_x, ix)
    z0 = cell_origin(min_z, iy)
    x1 = x0 + CELL_SIZE
    z1 = z0 + CELL_SIZE

    column = intersect_column(mesh, x0, x1, z0, z1)
    if column is None:
        return None

    peak = float(np.max(column.vertices[:, 1]))
    cap_bottom, cap_top = cap_layers_for_peak(peak)
    piece = extract_cap_from_column(column, x0, x1, z0, z1, cap_bottom, cap_top)
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
) -> bool:
    """Return False if geometry drifted outside the intended cell box."""
    b = piece.bounds
    if b is None:
        return False
    tol = 0.01
    x1 = x0 + CELL_SIZE
    z1 = z0 + CELL_SIZE
    ok = True
    checks = (
        (b[0][0] < x0 - tol, f"X min {b[0][0]:.4f} < {x0}"),
        (b[1][0] > x1 + tol, f"X max {b[1][0]:.4f} > {x1}"),
        (b[0][2] < z0 - tol, f"Z min {b[0][2]:.4f} < {z0}"),
        (b[1][2] > z1 + tol, f"Z max {b[1][2]:.4f} > {z1}"),
        (b[0][1] < cap_bottom - tol, f"Y min {b[0][1]:.4f} < {cap_bottom}"),
        (b[1][1] > cap_top + tol, f"Y max {b[1][1]:.4f} > {cap_top}"),
    )
    for bad, msg in checks:
        if bad:
            print(f"  WARN: {msg}")
            ok = False
    return ok


def mesh_bounds_dict(piece: trimesh.Trimesh) -> dict[str, list[float]]:
    b = piece.bounds
    return {
        "min": [float(b[0][0]), float(b[0][1]), float(b[0][2])],
        "max": [float(b[1][0]), float(b[1][1]), float(b[1][2])],
    }


def main() -> int:
    if not os.path.isfile(STL_PATH):
        print(f"ERROR: {STL_PATH} not found", file=sys.stderr)
        return 1

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for old in glob.glob(os.path.join(OUTPUT_DIR, "surf_*.glb")):
        os.remove(old)

    mesh = load_game_mesh(STL_PATH)
    min_x, min_z, num_x, num_z = grid_extent(mesh)

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
    warn_count = 0
    total = (ix1 - ix0) * (iy1 - iy0)
    done = 0

    for ix in range(ix0, ix1):
        for iy in range(iy0, iy1):
            done += 1
            if done % 10 == 0 or done == total:
                print(f"  progress {done}/{total} ({exported} exported) …", flush=True)

            result = slice_cell(mesh, ix, iy, min_x=min_x, min_z=min_z)
            if result is None:
                continue

            piece, cap_bottom, cap_top = result
            x0 = cell_origin(min_x, ix)
            z0 = cell_origin(min_z, iy)

            if not validate_cell(piece, x0, z0, cap_bottom, cap_top):
                warn_count += 1

            center_x = cell_center(min_x, ix)
            center_z = cell_center(min_z, iy)

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
                "bounds": mesh_bounds_dict(piece),
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
                "Each cap is mesh ∩ exact CELL_SIZE slab on integer grid; "
                "pieces keep world position (partial caps are not shifted to cell corner); "
                "cap_top = ceil(peak_y / CELL_SIZE) * CELL_SIZE"
            ),
        },
    }

    meta_path = os.path.join(OUTPUT_DIR, "terrain_meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print()
    print(f"Exported {exported} surface pieces → {OUTPUT_DIR}")
    if warn_count:
        print(f"  {warn_count} cells had boundary validation warnings")
    print(f"Global voxel seam_y = {seam_y}")
    print(f"Metadata → {meta_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
