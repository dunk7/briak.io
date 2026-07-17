#!/usr/bin/env python3
"""
Cut map3.stl into a uniform 5 m cube grid.

Every grid cell that intersects the watertight mesh is either:
  - full cube  → diggable voxel (metadata bit only)
  - partial    → outer surface piece (smooth boolean mesh, ≤ 5³)
  - empty      → skipped

No tall caps. Classification is atmosphere-agnostic: a perfect fill is interior;
anything cut by the mesh exterior is an outer piece.

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
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import Any

import numpy as np
import trimesh

CELL_SIZE = 5
# Occupied depth is derived from the mesh; this is only a soft report cap.
MAX_LAYERS_REPORT = 31

COLUMN_Y_MIN = -500.0
COLUMN_Y_MAX = 500.0

# Dense inset grid used to classify full vs partial without a boolean.
# Keep inset small — a deep inset misses shallow exterior cuts and falsely
# marks surface-touching cubes as full (voxels poking through the terrain).
SAMPLE_AXIS = 6
SAMPLE_INSET = 0.05
# Extra samples pressed against each of the 6 cube faces catch shallow cuts
# that the interior grid can still miss.
FACE_SAMPLE_AXIS = 4
FACE_SAMPLE_INSET = 0.02
# Boolean volume ≥ this fraction of CELL³ counts as a full cube. Keep this
# strict so near-surface cubes stay smooth partials instead of blocky voxels.
FULL_VOLUME_RATIO = 0.995
MIN_PARTIAL_VOLUME = 1e-3

# Footprint coverage gate for sparse map-edge columns.
SURFACE_SAMPLES = 7
MIN_CELL_COVERAGE = 0.5

BOUNDARY_SNAP = 1e-3
VERTEX_MERGE_DIGITS = 8

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STL_PATH = os.path.join(PROJECT_ROOT, "map3.stl")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "assets", "terrain", "surface_pieces")

# Set in worker processes via initializer.
_WORKER_MESH: trimesh.Trimesh | None = None


def stl_to_y_up(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """STL (X, Y, Z) → game (X, Y-up, Z): game Y = STL Z, game Z = STL Y."""
    out = mesh.copy()
    v = out.vertices
    out.vertices = np.column_stack([v[:, 0], v[:, 2], v[:, 1]])
    out.invert()
    return out


def layer_ceil(y: float) -> int:
    if y <= 0:
        return int(math.ceil(y / CELL_SIZE - 1e-12)) * CELL_SIZE
    return int(math.ceil((y - 1e-12) / CELL_SIZE)) * CELL_SIZE


def layer_floor(y: float) -> int:
    return int(math.floor(y / CELL_SIZE + 1e-12)) * CELL_SIZE


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
    """Force verts inside the cell box and weld near-boundary verts to exact planes."""
    lo = (float(x0), float(y0), float(z0))
    hi = (float(x1), float(y1), float(z1))
    verts = piece.vertices.copy()

    for axis, (plane_lo, plane_hi) in enumerate(zip(lo, hi)):
        col = verts[:, axis]
        near_lo = np.abs(col - plane_lo) <= BOUNDARY_SNAP
        near_hi = np.abs(col - plane_hi) <= BOUNDARY_SNAP
        col[near_lo] = plane_lo
        col[near_hi] = plane_hi
        # Strict clip — never leave verts outside the owning cell (prevents
        # adjacent-cell overlap / z-fight from boolean tolerance).
        verts[:, axis] = np.clip(col, plane_lo, plane_hi)

    out = piece.copy()
    out.vertices = verts
    return clean_piece(out)


def footprint_coverage(
    mesh: trimesh.Trimesh,
    x0: float,
    x1: float,
    z0: float,
    z1: float,
) -> float:
    xs = np.linspace(x0, x1, SURFACE_SAMPLES)
    zs = np.linspace(z0, z1, SURFACE_SAMPLES)
    gx, gz = np.meshgrid(xs, zs)
    sample_count = gx.size
    origins = np.column_stack(
        [gx.ravel(), np.full(sample_count, COLUMN_Y_MAX), gz.ravel()]
    )
    directions = np.tile([0.0, -1.0, 0.0], (sample_count, 1))
    locations, ray_idx, _ = mesh.ray.intersects_location(
        origins, directions, multiple_hits=False
    )
    if len(locations) == 0:
        return 0.0
    return len(set(int(i) for i in ray_idx)) / sample_count


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


def sample_points_in_cell(
    x0: float,
    x1: float,
    y0: float,
    y1: float,
    z0: float,
    z1: float,
) -> np.ndarray:
    xs = np.linspace(x0 + SAMPLE_INSET, x1 - SAMPLE_INSET, SAMPLE_AXIS)
    ys = np.linspace(y0 + SAMPLE_INSET, y1 - SAMPLE_INSET, SAMPLE_AXIS)
    zs = np.linspace(z0 + SAMPLE_INSET, z1 - SAMPLE_INSET, SAMPLE_AXIS)
    gx, gy, gz = np.meshgrid(xs, ys, zs, indexing="ij")
    return np.column_stack([gx.ravel(), gy.ravel(), gz.ravel()])


def face_exposure_points(
    x0: float,
    x1: float,
    y0: float,
    y1: float,
    z0: float,
    z1: float,
) -> np.ndarray:
    """
    Sample just inside each of the six cube faces.

    Catches shallow atmosphere cuts that a deeper interior grid can miss —
    those false-fulls are what make diggable cubes poke through the surface.
    """
    inset = FACE_SAMPLE_INSET
    n = FACE_SAMPLE_AXIS
    u = np.linspace(0.0, 1.0, n)
    pts: list[np.ndarray] = []

    # Faces normal ±X
    ys = y0 + inset + u * (y1 - y0 - 2 * inset)
    zs = z0 + inset + u * (z1 - z0 - 2 * inset)
    gy, gz = np.meshgrid(ys, zs, indexing="ij")
    pts.append(np.column_stack([np.full(gy.size, x0 + inset), gy.ravel(), gz.ravel()]))
    pts.append(np.column_stack([np.full(gy.size, x1 - inset), gy.ravel(), gz.ravel()]))

    # Faces normal ±Y
    xs = x0 + inset + u * (x1 - x0 - 2 * inset)
    zs = z0 + inset + u * (z1 - z0 - 2 * inset)
    gx, gz = np.meshgrid(xs, zs, indexing="ij")
    pts.append(np.column_stack([gx.ravel(), np.full(gx.size, y0 + inset), gz.ravel()]))
    pts.append(np.column_stack([gx.ravel(), np.full(gx.size, y1 - inset), gz.ravel()]))

    # Faces normal ±Z
    xs = x0 + inset + u * (x1 - x0 - 2 * inset)
    ys = y0 + inset + u * (y1 - y0 - 2 * inset)
    gx, gy = np.meshgrid(xs, ys, indexing="ij")
    pts.append(np.column_stack([gx.ravel(), gy.ravel(), np.full(gx.size, z0 + inset)]))
    pts.append(np.column_stack([gx.ravel(), gy.ravel(), np.full(gx.size, z1 - inset)]))

    return np.vstack(pts)


def _contains_safe(mesh: trimesh.Trimesh, pts: np.ndarray) -> np.ndarray:
    try:
        return mesh.contains(pts)
    except Exception:
        return np.zeros(len(pts), dtype=bool)


def classify_layer(
    column: trimesh.Trimesh,
    x0: int,
    x1: int,
    y0: int,
    y1: int,
    z0: int,
    z1: int,
) -> tuple[str, trimesh.Trimesh | None]:
    """
    Returns (kind, piece) where kind is 'full' | 'partial' | 'empty'.

    Full cubes skip boolean only when both the interior grid and the
    face-exposure samples are entirely inside the solid.
    """
    clo, chi = column.bounds
    if chi[1] < y0 or clo[1] > y1:
        return "empty", None

    fx0, fx1 = float(x0), float(x1)
    fy0, fy1 = float(y0), float(y1)
    fz0, fz1 = float(z0), float(z1)

    interior = sample_points_in_cell(fx0, fx1, fy0, fy1, fz0, fz1)
    inside = _contains_safe(column, interior)
    n_in = int(inside.sum())

    if n_in == len(interior):
        face_pts = face_exposure_points(fx0, fx1, fy0, fy1, fz0, fz1)
        face_inside = _contains_safe(column, face_pts)
        if bool(face_inside.all()):
            return "full", None
        # Shallow exterior cut near a face — fall through to boolean.

    slab = exact_box(fx0, fx1, fy0, fy1, fz0, fz1)
    piece = boolean_intersection(column, slab)
    if piece is None:
        return "empty", None

    try:
        vol = float(piece.volume)
    except Exception:
        vol = 0.0
    if vol < MIN_PARTIAL_VOLUME:
        return "empty", None

    full_vol = float(CELL_SIZE ** 3)
    if vol >= full_vol * FULL_VOLUME_RATIO:
        # Near-complete fill, but only promote to full when face samples agree.
        # Otherwise keep the thin atmosphere cut as a smooth partial.
        face_pts = face_exposure_points(fx0, fx1, fy0, fy1, fz0, fz1)
        face_inside = _contains_safe(column, face_pts)
        if bool(face_inside.all()):
            return "full", None

    clipped = snap_and_clip_to_box(piece, x0, x1, y0, y1, z0, z1)
    if clipped is None or len(clipped.faces) == 0:
        return "empty", None
    return "partial", clipped


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


def mesh_bounds_dict(piece: trimesh.Trimesh) -> dict[str, list[float]]:
    b = piece.bounds
    return {
        "min": [float(b[0][0]), float(b[0][1]), float(b[0][2])],
        "max": [float(b[1][0]), float(b[1][1]), float(b[1][2])],
    }


def combine_bounds(
    pieces: list[trimesh.Trimesh],
) -> dict[str, list[float]] | None:
    if not pieces:
        return None
    mins = np.min([p.bounds[0] for p in pieces], axis=0)
    maxs = np.max([p.bounds[1] for p in pieces], axis=0)
    return {
        "min": [float(mins[0]), float(mins[1]), float(mins[2])],
        "max": [float(maxs[0]), float(maxs[1]), float(maxs[2])],
    }


def _init_worker(stl_path: str) -> None:
    global _WORKER_MESH
    raw = trimesh.load(stl_path)
    if not isinstance(raw, trimesh.Trimesh):
        raw = raw.dump(concatenate=True)
    _WORKER_MESH = preprocess_mesh(stl_to_y_up(raw))


def export_column_glb(
    partial_layers: list[tuple[int, trimesh.Trimesh]],
    filepath: str,
) -> int:
    """Write one GLB with a child mesh per partial layer. Returns triangle count."""
    scene = trimesh.Scene()
    tris = 0
    for layer, piece in partial_layers:
        scene.add_geometry(piece, geom_name=f"layer_{layer}", node_name=f"layer_{layer}")
        tris += int(len(piece.faces))
    scene.export(filepath)
    return tris


def slice_column_job(
    args: tuple[int, int, int, int, str],
) -> dict[str, Any] | None:
    """Worker: classify one XZ column, export GLB, return metadata only."""
    assert _WORKER_MESH is not None
    mesh = _WORKER_MESH
    ix, iy, min_x, min_z, output_dir = args

    x0 = cell_origin(min_x, ix)
    z0 = cell_origin(min_z, iy)
    x1 = x0 + CELL_SIZE
    z1 = z0 + CELL_SIZE

    coverage = footprint_coverage(mesh, float(x0), float(x1), float(z0), float(z1))
    if coverage < MIN_CELL_COVERAGE:
        return None

    column = intersect_column(mesh, x0, x1, z0, z1)
    if column is None:
        return None

    y_top = layer_ceil(float(np.max(column.vertices[:, 1])))
    y_bottom = layer_floor(float(np.min(column.vertices[:, 1])))
    if y_top <= y_bottom:
        return None

    partial_layers: list[tuple[int, trimesh.Trimesh]] = []
    voxel_bits = 0
    surface_bits = 0
    layer = 0
    y1 = y_top
    while y1 > y_bottom and layer < MAX_LAYERS_REPORT:
        y0 = y1 - CELL_SIZE
        kind, piece = classify_layer(column, x0, x1, y0, y1, z0, z1)
        bit = 1 << layer
        if kind == "full":
            voxel_bits |= bit
        elif kind == "partial" and piece is not None:
            surface_bits |= bit
            partial_layers.append((layer, piece))
        layer += 1
        y1 = y0

    if voxel_bits == 0 and surface_bits == 0:
        return None

    # A layer cannot be both full and partial.
    assert (voxel_bits & surface_bits) == 0

    filename = f"surf_{ix}_{iy}.glb"
    filepath = os.path.join(output_dir, filename)
    tri_count = export_column_glb(partial_layers, filepath)

    pieces = [p for _, p in partial_layers]
    bounds = combine_bounds(pieces)
    if bounds is None:
        cx = cell_center(min_x, ix)
        cz = cell_center(min_z, iy)
        depth = layer * CELL_SIZE
        bounds = {
            "min": [cx - CELL_SIZE * 0.5, y_top - depth, cz - CELL_SIZE * 0.5],
            "max": [cx + CELL_SIZE * 0.5, y_top, cz + CELL_SIZE * 0.5],
        }

    return {
        "ix": ix,
        "iy": iy,
        "center_x": cell_center(min_x, ix),
        "center_y": cell_center(min_z, iy),
        "file": filename,
        "tri_count": tri_count,
        "voxel_top_y": y_top,
        "cap_top_y": y_top,
        "cap_bottom_y": y_top - CELL_SIZE,
        "voxel_layer_mask": voxel_bits,
        "surface_layer_mask": surface_bits,
        "layer_count": layer,
        "bounds": bounds,
        "n_full": bin(voxel_bits).count("1"),
        "n_partial": bin(surface_bits).count("1"),
    }


def _available_ram_gb() -> float | None:
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    kb = float(line.split()[1])
                    return kb / (1024 * 1024)
    except OSError:
        return None
    return None


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

    print(
        f"  grid origin ({min_x}, {min_z}), "
        f"extent {num_x}×{num_z} cells, metadata span {num_cells}×{num_cells}",
        flush=True,
    )
    print(
        f"  classify: sample {SAMPLE_AXIS}³ inset={SAMPLE_INSET}, "
        f"face {FACE_SAMPLE_AXIS}² inset={FACE_SAMPLE_INSET}, "
        f"full_vol≥{FULL_VOLUME_RATIO}",
        flush=True,
    )

    ix0, ix1, iy0, iy1 = active_cell_range(mesh, min_x, min_z, num_x, num_z)
    print(f"  active cells: ix {ix0}..{ix1 - 1}, iy {iy0}..{iy1 - 1}", flush=True)

    jobs = [
        (ix, iy, min_x, min_z, OUTPUT_DIR)
        for ix in range(ix0, ix1)
        for iy in range(iy0, iy1)
    ]
    total = len(jobs)

    # One in-process mesh avoids OOM from N worker copies of the STL.
    mem_available_gb = _available_ram_gb()
    workers = 1
    if mem_available_gb is not None and mem_available_gb >= 8.0:
        workers = max(1, min(os.cpu_count() or 1, 3))
    print(f"  slicing {total} columns with {workers} worker(s) …", flush=True)
    if mem_available_gb is not None:
        print(f"  available RAM ≈ {mem_available_gb:.1f} GiB", flush=True)

    meta_cells: dict[str, dict] = {}
    exported = 0
    max_layers = 0
    full_count = 0
    partial_count = 0
    done = 0

    def consume(result: dict[str, Any] | None) -> None:
        nonlocal exported, max_layers, full_count, partial_count
        if result is None:
            return
        ix = result["ix"]
        iy = result["iy"]
        full_count += result.pop("n_full")
        partial_count += result.pop("n_partial")
        max_layers = max(max_layers, result.pop("layer_count"))
        meta_cells[f"{ix}_{iy}"] = result
        exported += 1

    if workers == 1:
        global _WORKER_MESH
        _WORKER_MESH = mesh
        for job in jobs:
            done += 1
            if done % 25 == 0 or done == total:
                print(
                    f"  progress {done}/{total} ({exported} columns, "
                    f"{partial_count} surface cells, {full_count} full voxels) …",
                    flush=True,
                )
            try:
                consume(slice_column_job(job))
            except Exception as exc:
                print(f"  WARN: column {job[0]},{job[1]} failed: {exc}", flush=True)
        _WORKER_MESH = None
    else:
        del mesh
        with ProcessPoolExecutor(
            max_workers=workers,
            initializer=_init_worker,
            initargs=(STL_PATH,),
        ) as pool:
            wave = max(workers * 8, 16)
            for start in range(0, total, wave):
                batch = jobs[start : start + wave]
                futures = {pool.submit(slice_column_job, job): job for job in batch}
                for fut in as_completed(futures):
                    done += 1
                    if done % 25 == 0 or done == total:
                        print(
                            f"  progress {done}/{total} ({exported} columns, "
                            f"{partial_count} surface cells, {full_count} full voxels) …",
                            flush=True,
                        )
                    try:
                        consume(fut.result())
                    except Exception as exc:
                        job = futures[fut]
                        print(
                            f"  WARN: column {job[0]},{job[1]} failed: {exc}",
                            flush=True,
                        )

    if max_layers <= 0:
        max_layers = 1

    seam_candidates = []
    for c in meta_cells.values():
        top = c["voxel_top_y"]
        occupied = c["voxel_layer_mask"] | c["surface_layer_mask"]
        depth = 0
        m = occupied
        while m:
            depth += 1
            m >>= 1
        seam_candidates.append(top - depth * CELL_SIZE)
    seam_y = min(seam_candidates) if seam_candidates else 0

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
            "layers": max_layers,
            "layer_height": CELL_SIZE,
            "surface_cap_height": CELL_SIZE,
            "seam_y": seam_y,
        },
        "coordinate_system": {
            "source": "map3.stl",
            "game_up": "Y",
            "note": (
                "Uniform CELL_SIZE cube grid: full cells are voxels "
                "(voxel_layer_mask); partial atmosphere-cut cells are smooth "
                "surface meshes (surface_layer_mask, GLB children layer_k)."
            ),
        },
    }

    meta_path = os.path.join(OUTPUT_DIR, "terrain_meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print()
    print(f"Exported {exported} columns → {OUTPUT_DIR}")
    print(f"  full voxel cells: {full_count}")
    print(f"  partial surface cells: {partial_count}")
    print(f"  max layers: {max_layers}")
    print(f"Global voxel seam_y = {seam_y}")
    print(f"Metadata → {meta_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
