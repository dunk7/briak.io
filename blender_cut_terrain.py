"""
Legacy Blender slicer — superseded by scripts/slice_terrain.py

The Python slicer reads map.stl directly, cuts exact 5m grid columns with
manifold booleans, and exports Y-up GLBs that tile without runtime scaling.

Run instead:
  npm run slice-terrain
"""

print(__doc__)
