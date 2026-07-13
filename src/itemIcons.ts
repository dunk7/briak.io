import type { InventoryItem } from './inventory'

/** 16×16 pixel-art sprites with highlights and material reads. */
const ICONS: Partial<Record<InventoryItem, string>> = {
  dirt: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#2a2018"/>
    <rect x="1" y="1" width="14" height="5" fill="#3d7234"/>
    <rect x="1" y="1" width="6" height="2" fill="#6db850"/>
    <rect x="8" y="1" width="5" height="2" fill="#58a042"/>
    <rect x="11" y="3" width="4" height="2" fill="#4a8838"/>
    <rect x="2" y="3" width="3" height="2" fill="#78c858"/>
    <rect x="6" y="4" width="2" height="1" fill="#3d7234"/>
    <rect x="1" y="6" width="14" height="9" fill="#76583a"/>
    <rect x="1" y="6" width="3" height="9" fill="#4e3828"/>
    <rect x="12" y="6" width="3" height="9" fill="#5a4028"/>
    <rect x="5" y="7" width="3" height="2" fill="#8b6548"/>
    <rect x="10" y="8" width="2" height="2" fill="#9a7350"/>
    <rect x="4" y="10" width="2" height="2" fill="#6b4e36"/>
    <rect x="8" y="11" width="3" height="2" fill="#5a3f2c"/>
    <rect x="11" y="13" width="2" height="1" fill="#4e3828"/>
    <rect x="2" y="13" width="2" height="1" fill="#8b6548" opacity="0.5"/>
    <rect x="1" y="6" width="14" height="1" fill="#9a7350" opacity="0.25"/>
  </svg>`,

  wood: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#2a1810"/>
    <rect x="2" y="1" width="12" height="14" fill="#5c3a22"/>
    <rect x="2" y="1" width="2" height="14" fill="#4a2e18"/>
    <rect x="12" y="1" width="2" height="14" fill="#6b4428"/>
    <rect x="4" y="1" width="1" height="14" fill="#7a5030"/>
    <rect x="7" y="1" width="2" height="14" fill="#6b4428"/>
    <rect x="10" y="1" width="1" height="14" fill="#8b5e34"/>
    <rect x="5" y="3" width="2" height="2" fill="#4a2e18"/>
    <rect x="9" y="6" width="2" height="2" fill="#3a2210"/>
    <rect x="6" y="9" width="1" height="2" fill="#4a2e18"/>
    <rect x="8" y="11" width="2" height="2" fill="#3a2210"/>
    <rect x="3" y="1" width="10" height="1" fill="#a87848" opacity="0.55"/>
    <rect x="4" y="13" width="2" height="1" fill="#8b5e34"/>
    <rect x="11" y="12" width="2" height="1" fill="#7a5030"/>
  </svg>`,

  stone: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#3a3834"/>
    <rect x="1" y="2" width="14" height="12" fill="#7a7a74"/>
    <rect x="1" y="2" width="7" height="5" fill="#8a8580"/>
    <rect x="9" y="2" width="6" height="4" fill="#686860"/>
    <rect x="1" y="8" width="6" height="4" fill="#686860"/>
    <rect x="8" y="7" width="7" height="5" fill="#9a9a92"/>
    <rect x="2" y="12" width="6" height="2" fill="#5e5e58"/>
    <rect x="9" y="12" width="6" height="2" fill="#7a7a74"/>
    <rect x="3" y="4" width="2" height="2" fill="#b0b0a8"/>
    <rect x="11" y="3" width="2" height="2" fill="#5e5e58"/>
    <rect x="6" y="9" width="2" height="2" fill="#a8a8a0"/>
    <rect x="12" y="9" width="2" height="1" fill="#5e5e58"/>
    <rect x="4" y="11" width="2" height="1" fill="#9a9a92"/>
    <rect x="1" y="2" width="14" height="1" fill="#c8c8c0" opacity="0.35"/>
    <rect x="2" y="13" width="12" height="1" fill="#4a4844"/>
  </svg>`,

  iron: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#2a2824"/>
    <rect x="1" y="2" width="14" height="12" fill="#a8a49c"/>
    <rect x="2" y="3" width="4" height="3" fill="#c8c4bc"/>
    <rect x="7" y="4" width="3" height="2" fill="#8a8680"/>
    <rect x="11" y="3" width="3" height="4" fill="#b8b4ac"/>
    <rect x="3" y="7" width="5" height="3" fill="#908c84"/>
    <rect x="9" y="8" width="4" height="3" fill="#d0ccc4"/>
    <rect x="2" y="11" width="3" height="2" fill="#6a6660"/>
    <rect x="6" y="11" width="4" height="2" fill="#b0aca4"/>
    <rect x="11" y="11" width="3" height="2" fill="#7a7670"/>
    <rect x="4" y="5" width="1" height="1" fill="#f0ece4"/>
    <rect x="10" y="6" width="1" height="1" fill="#e8e4dc"/>
    <rect x="8" y="10" width="1" height="1" fill="#f8f4ec"/>
    <rect x="1" y="2" width="14" height="1" fill="#ffffff" opacity="0.35"/>
    <rect x="2" y="13" width="12" height="1" fill="#4a4844"/>
  </svg>`,

  gold: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#2a2210"/>
    <rect x="1" y="2" width="14" height="12" fill="#c9a227"/>
    <rect x="2" y="3" width="4" height="3" fill="#e8c84a"/>
    <rect x="7" y="4" width="3" height="2" fill="#9a7820"/>
    <rect x="11" y="3" width="3" height="4" fill="#d4b840"/>
    <rect x="3" y="7" width="5" height="3" fill="#a88820"/>
    <rect x="9" y="8" width="4" height="3" fill="#f0d060"/>
    <rect x="2" y="11" width="3" height="2" fill="#8a6810"/>
    <rect x="6" y="11" width="4" height="2" fill="#d4a82a"/>
    <rect x="11" y="11" width="3" height="2" fill="#b89020"/>
    <rect x="4" y="5" width="1" height="1" fill="#fff8d0"/>
    <rect x="10" y="6" width="1" height="1" fill="#fff0a0"/>
    <rect x="8" y="10" width="1" height="1" fill="#ffe566"/>
    <rect x="1" y="2" width="14" height="1" fill="#fff6c8" opacity="0.4"/>
    <rect x="2" y="13" width="12" height="1" fill="#4a3810"/>
  </svg>`,

  diamond: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#127876"/>
    <rect x="1" y="1" width="14" height="14" fill="#5aeee4"/>
    <rect x="2" y="2" width="3" height="2" fill="#e6fffa"/>
    <rect x="5" y="2" width="3" height="2" fill="#aafaf2"/>
    <rect x="8" y="2" width="4" height="3" fill="#78f4ea"/>
    <rect x="12" y="2" width="2" height="2" fill="#e6fffa"/>
    <rect x="2" y="4" width="4" height="3" fill="#78f4ea"/>
    <rect x="6" y="5" width="5" height="4" fill="#5aeee4"/>
    <rect x="11" y="5" width="3" height="3" fill="#78f4ea"/>
    <rect x="2" y="7" width="3" height="3" fill="#aafaf2"/>
    <rect x="5" y="9" width="4" height="3" fill="#aafaf2"/>
    <rect x="9" y="8" width="4" height="3" fill="#5aeee4"/>
    <rect x="2" y="11" width="4" height="3" fill="#78f4ea"/>
    <rect x="6" y="12" width="5" height="2" fill="#e6fffa"/>
    <rect x="11" y="11" width="3" height="3" fill="#30b4ae"/>
    <rect x="3" y="3" width="1" height="1" fill="#ffffff"/>
    <rect x="10" y="4" width="1" height="1" fill="#ffffff"/>
    <rect x="7" y="10" width="1" height="1" fill="#e6fffa"/>
  </svg>`,

  stick: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="13" y="2" width="1" height="1" fill="#5c3a22"/>
    <rect x="14" y="2" width="1" height="1" fill="#3a2210"/>
    <rect x="12" y="3" width="1" height="1" fill="#5c3a22"/>
    <rect x="13" y="3" width="1" height="1" fill="#7a5030"/>
    <rect x="14" y="3" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="4" width="1" height="1" fill="#5c3a22"/>
    <rect x="12" y="4" width="1" height="1" fill="#7a5030"/>
    <rect x="13" y="4" width="1" height="1" fill="#3a2210"/>
    <rect x="10" y="5" width="1" height="1" fill="#5c3a22"/>
    <rect x="11" y="5" width="1" height="1" fill="#6b4428"/>
    <rect x="12" y="5" width="1" height="1" fill="#3a2210"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="11" y="6" width="1" height="1" fill="#3a2210"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#6b4428"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  sword: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="13" y="0" width="3" height="1" fill="#686860"/>
    <rect x="12" y="1" width="1" height="1" fill="#686860"/>
    <rect x="13" y="1" width="2" height="1" fill="#7a7a74"/>
    <rect x="15" y="1" width="1" height="1" fill="#5e5e58"/>
    <rect x="11" y="2" width="1" height="1" fill="#686860"/>
    <rect x="12" y="2" width="1" height="1" fill="#7a7a74"/>
    <rect x="13" y="2" width="1" height="1" fill="#62625c"/>
    <rect x="14" y="2" width="1" height="1" fill="#7a7a74"/>
    <rect x="15" y="2" width="1" height="1" fill="#5e5e58"/>
    <rect x="10" y="3" width="1" height="1" fill="#686860"/>
    <rect x="11" y="3" width="1" height="1" fill="#7a7a74"/>
    <rect x="12" y="3" width="1" height="1" fill="#62625c"/>
    <rect x="13" y="3" width="1" height="1" fill="#7a7a74"/>
    <rect x="14" y="3" width="1" height="1" fill="#5e5e58"/>
    <rect x="9" y="4" width="1" height="1" fill="#686860"/>
    <rect x="10" y="4" width="1" height="1" fill="#7a7a74"/>
    <rect x="11" y="4" width="1" height="1" fill="#62625c"/>
    <rect x="12" y="4" width="1" height="1" fill="#6e6e68"/>
    <rect x="13" y="4" width="1" height="1" fill="#5e5e58"/>
    <rect x="8" y="5" width="1" height="1" fill="#686860"/>
    <rect x="9" y="5" width="1" height="1" fill="#7a7a74"/>
    <rect x="10" y="5" width="1" height="1" fill="#62625c"/>
    <rect x="11" y="5" width="1" height="1" fill="#6e6e68"/>
    <rect x="12" y="5" width="1" height="1" fill="#5e5e58"/>
    <rect x="2" y="6" width="2" height="1" fill="#686860"/>
    <rect x="7" y="6" width="1" height="1" fill="#686860"/>
    <rect x="8" y="6" width="1" height="1" fill="#6e6e68"/>
    <rect x="9" y="6" width="1" height="1" fill="#62625c"/>
    <rect x="10" y="6" width="1" height="1" fill="#6e6e68"/>
    <rect x="11" y="6" width="1" height="1" fill="#5e5e58"/>
    <rect x="2" y="7" width="3" height="1" fill="#686860"/>
    <rect x="6" y="7" width="1" height="1" fill="#686860"/>
    <rect x="7" y="7" width="1" height="1" fill="#6e6e68"/>
    <rect x="8" y="7" width="1" height="1" fill="#62625c"/>
    <rect x="9" y="7" width="1" height="1" fill="#6e6e68"/>
    <rect x="10" y="7" width="1" height="1" fill="#5e5e58"/>
    <rect x="3" y="8" width="1" height="1" fill="#686860"/>
    <rect x="4" y="8" width="1" height="1" fill="#52524e"/>
    <rect x="5" y="8" width="1" height="1" fill="#5e5e58"/>
    <rect x="6" y="8" width="1" height="1" fill="#6e6e68"/>
    <rect x="7" y="8" width="1" height="1" fill="#52524e"/>
    <rect x="8" y="8" width="1" height="1" fill="#6e6e68"/>
    <rect x="9" y="8" width="1" height="1" fill="#5e5e58"/>
    <rect x="3" y="9" width="1" height="1" fill="#686860"/>
    <rect x="4" y="9" width="2" height="1" fill="#52524e"/>
    <rect x="6" y="9" width="1" height="1" fill="#686860"/>
    <rect x="7" y="9" width="1" height="1" fill="#6e6e68"/>
    <rect x="8" y="9" width="1" height="1" fill="#5e5e58"/>
    <rect x="4" y="10" width="3" height="1" fill="#686860"/>
    <rect x="7" y="10" width="1" height="1" fill="#5e5e58"/>
    <rect x="3" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="5" y="11" width="1" height="1" fill="#5e5e58"/>
    <rect x="6" y="11" width="2" height="1" fill="#686860"/>
    <rect x="8" y="11" width="1" height="1" fill="#5e5e58"/>
    <rect x="2" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="6" y="12" width="2" height="1" fill="#5e5e58"/>
    <rect x="8" y="12" width="1" height="1" fill="#686860"/>
    <rect x="9" y="12" width="1" height="1" fill="#5e5e58"/>
    <rect x="0" y="13" width="2" height="1" fill="#686860"/>
    <rect x="2" y="13" width="1" height="1" fill="#6b4428"/>
    <rect x="3" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="8" y="13" width="2" height="1" fill="#5e5e58"/>
    <rect x="0" y="14" width="2" height="1" fill="#686860"/>
    <rect x="2" y="14" width="1" height="1" fill="#5e5e58"/>
    <rect x="0" y="15" width="3" height="1" fill="#5e5e58"/>
  </svg>`,

  axe: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="9" y="1" width="2" height="1" fill="#686860"/>
    <rect x="8" y="2" width="1" height="1" fill="#686860"/>
    <rect x="9" y="2" width="2" height="1" fill="#7a7a74"/>
    <rect x="11" y="2" width="1" height="1" fill="#686860"/>
    <rect x="7" y="3" width="1" height="1" fill="#686860"/>
    <rect x="8" y="3" width="1" height="1" fill="#7a7a74"/>
    <rect x="9" y="3" width="1" height="1" fill="#5a5a54"/>
    <rect x="10" y="3" width="1" height="1" fill="#6e6e68"/>
    <rect x="11" y="3" width="1" height="1" fill="#686860"/>
    <rect x="6" y="4" width="1" height="1" fill="#686860"/>
    <rect x="7" y="4" width="1" height="1" fill="#7a7a74"/>
    <rect x="8" y="4" width="3" height="1" fill="#5a5a54"/>
    <rect x="11" y="4" width="1" height="1" fill="#5c3a22"/>
    <rect x="12" y="4" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="5" width="1" height="1" fill="#5e5e58"/>
    <rect x="7" y="5" width="1" height="1" fill="#7a7a74"/>
    <rect x="8" y="5" width="1" height="1" fill="#6e6e68"/>
    <rect x="9" y="5" width="1" height="1" fill="#5a5a54"/>
    <rect x="10" y="5" width="1" height="1" fill="#52524e"/>
    <rect x="11" y="5" width="1" height="1" fill="#5a5a54"/>
    <rect x="12" y="5" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="6" width="2" height="1" fill="#5e5e58"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#5a5a54"/>
    <rect x="11" y="6" width="1" height="1" fill="#52524e"/>
    <rect x="12" y="6" width="1" height="1" fill="#5a5a54"/>
    <rect x="13" y="6" width="1" height="1" fill="#5e5e58"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#6b4428"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="7" width="2" height="1" fill="#5a5a54"/>
    <rect x="13" y="7" width="1" height="1" fill="#5e5e58"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="8" width="2" height="1" fill="#5e5e58"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#6b4428"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#6b4428"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  shovel: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="11" y="2" width="2" height="1" fill="#686860"/>
    <rect x="13" y="2" width="1" height="1" fill="#5e5e58"/>
    <rect x="10" y="3" width="1" height="1" fill="#686860"/>
    <rect x="11" y="3" width="2" height="1" fill="#7a7a74"/>
    <rect x="13" y="3" width="1" height="1" fill="#5a5a54"/>
    <rect x="14" y="3" width="1" height="1" fill="#5e5e58"/>
    <rect x="9" y="4" width="1" height="1" fill="#686860"/>
    <rect x="10" y="4" width="1" height="1" fill="#7a7a74"/>
    <rect x="11" y="4" width="1" height="1" fill="#6e6e68"/>
    <rect x="12" y="4" width="1" height="1" fill="#5a5a54"/>
    <rect x="13" y="4" width="1" height="1" fill="#7a7a74"/>
    <rect x="14" y="4" width="1" height="1" fill="#5e5e58"/>
    <rect x="8" y="5" width="1" height="1" fill="#686860"/>
    <rect x="9" y="5" width="1" height="1" fill="#7a7a74"/>
    <rect x="10" y="5" width="1" height="1" fill="#6e6e68"/>
    <rect x="11" y="5" width="1" height="1" fill="#5a5a54"/>
    <rect x="12" y="5" width="1" height="1" fill="#6e6e68"/>
    <rect x="13" y="5" width="1" height="1" fill="#7a7a74"/>
    <rect x="14" y="5" width="1" height="1" fill="#5e5e58"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#5a5a54"/>
    <rect x="11" y="6" width="1" height="1" fill="#6e6e68"/>
    <rect x="12" y="6" width="1" height="1" fill="#7a7a74"/>
    <rect x="13" y="6" width="1" height="1" fill="#5e5e58"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#7a5030"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="7" width="1" height="1" fill="#7a7a74"/>
    <rect x="12" y="7" width="1" height="1" fill="#5e5e58"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="8" width="1" height="1" fill="#5e5e58"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="12" width="2" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  pickaxe: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="6" y="2" width="5" height="1" fill="#686860"/>
    <rect x="5" y="3" width="1" height="1" fill="#686860"/>
    <rect x="6" y="3" width="1" height="1" fill="#7a7a74"/>
    <rect x="7" y="3" width="1" height="1" fill="#6e6e68"/>
    <rect x="8" y="3" width="2" height="1" fill="#5a5a54"/>
    <rect x="10" y="3" width="1" height="1" fill="#6e6e68"/>
    <rect x="11" y="3" width="1" height="1" fill="#686860"/>
    <rect x="12" y="3" width="2" height="1" fill="#6b4428"/>
    <rect x="6" y="4" width="1" height="1" fill="#686860"/>
    <rect x="7" y="4" width="3" height="1" fill="#5e5e58"/>
    <rect x="10" y="4" width="2" height="1" fill="#5a5a54"/>
    <rect x="12" y="4" width="1" height="1" fill="#7a5030"/>
    <rect x="13" y="4" width="1" height="1" fill="#3a2210"/>
    <rect x="10" y="5" width="1" height="1" fill="#5c3a22"/>
    <rect x="11" y="5" width="2" height="1" fill="#6e6e68"/>
    <rect x="13" y="5" width="1" height="1" fill="#5e5e58"/>
    <rect x="9" y="6" width="2" height="1" fill="#6b4428"/>
    <rect x="11" y="6" width="1" height="1" fill="#3a2210"/>
    <rect x="12" y="6" width="2" height="1" fill="#5a5a54"/>
    <rect x="14" y="6" width="1" height="1" fill="#5e5e58"/>
    <rect x="8" y="7" width="3" height="1" fill="#5c3a22"/>
    <rect x="12" y="7" width="1" height="1" fill="#5e5e58"/>
    <rect x="13" y="7" width="1" height="1" fill="#5a5a54"/>
    <rect x="14" y="7" width="1" height="1" fill="#5e5e58"/>
    <rect x="7" y="8" width="3" height="1" fill="#6b4428"/>
    <rect x="12" y="8" width="1" height="1" fill="#5e5e58"/>
    <rect x="13" y="8" width="1" height="1" fill="#5a5a54"/>
    <rect x="14" y="8" width="1" height="1" fill="#5e5e58"/>
    <rect x="6" y="9" width="3" height="1" fill="#7a5030"/>
    <rect x="12" y="9" width="1" height="1" fill="#5e5e58"/>
    <rect x="13" y="9" width="1" height="1" fill="#6e6e68"/>
    <rect x="14" y="9" width="1" height="1" fill="#5e5e58"/>
    <rect x="5" y="10" width="3" height="1" fill="#6b4428"/>
    <rect x="12" y="10" width="1" height="1" fill="#5e5e58"/>
    <rect x="13" y="10" width="1" height="1" fill="#7a7a74"/>
    <rect x="14" y="10" width="1" height="1" fill="#5e5e58"/>
    <rect x="4" y="11" width="3" height="1" fill="#7a5030"/>
    <rect x="13" y="11" width="1" height="1" fill="#5e5e58"/>
    <rect x="3" y="12" width="3" height="1" fill="#6b4428"/>
    <rect x="2" y="13" width="3" height="1" fill="#7a5030"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  spear: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="12" y="2" width="1" height="1" fill="#52524e"/>
    <rect x="13" y="2" width="1" height="1" fill="#7a7a74"/>
    <rect x="14" y="2" width="1" height="1" fill="#686860"/>
    <rect x="10" y="3" width="1" height="1" fill="#52524e"/>
    <rect x="11" y="3" width="2" height="1" fill="#6e6e68"/>
    <rect x="13" y="3" width="1" height="1" fill="#52524e"/>
    <rect x="14" y="3" width="1" height="1" fill="#686860"/>
    <rect x="10" y="4" width="1" height="1" fill="#686860"/>
    <rect x="11" y="4" width="1" height="1" fill="#5c3a22"/>
    <rect x="12" y="4" width="1" height="1" fill="#6e6e68"/>
    <rect x="13" y="4" width="1" height="1" fill="#686860"/>
    <rect x="10" y="5" width="1" height="1" fill="#5c3a22"/>
    <rect x="11" y="5" width="1" height="1" fill="#6b4428"/>
    <rect x="12" y="5" width="1" height="1" fill="#52524e"/>
    <rect x="13" y="5" width="1" height="1" fill="#686860"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="11" y="6" width="1" height="1" fill="#3a2210"/>
    <rect x="12" y="6" width="1" height="1" fill="#686860"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#6b4428"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  iron_sword: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="13" y="0" width="3" height="1" fill="#a8a49c"/>
    <rect x="12" y="1" width="1" height="1" fill="#a8a49c"/>
    <rect x="13" y="1" width="2" height="1" fill="#ffffff"/>
    <rect x="15" y="1" width="1" height="1" fill="#6a6660"/>
    <rect x="11" y="2" width="1" height="1" fill="#a8a49c"/>
    <rect x="12" y="2" width="1" height="1" fill="#ffffff"/>
    <rect x="13" y="2" width="1" height="1" fill="#e8e4dc"/>
    <rect x="14" y="2" width="1" height="1" fill="#ffffff"/>
    <rect x="15" y="2" width="1" height="1" fill="#6a6660"/>
    <rect x="10" y="3" width="1" height="1" fill="#a8a49c"/>
    <rect x="11" y="3" width="1" height="1" fill="#ffffff"/>
    <rect x="12" y="3" width="1" height="1" fill="#e8e4dc"/>
    <rect x="13" y="3" width="1" height="1" fill="#ffffff"/>
    <rect x="14" y="3" width="1" height="1" fill="#6a6660"/>
    <rect x="9" y="4" width="1" height="1" fill="#a8a49c"/>
    <rect x="10" y="4" width="1" height="1" fill="#ffffff"/>
    <rect x="11" y="4" width="1" height="1" fill="#e8e4dc"/>
    <rect x="12" y="4" width="1" height="1" fill="#f0ece4"/>
    <rect x="13" y="4" width="1" height="1" fill="#6a6660"/>
    <rect x="8" y="5" width="1" height="1" fill="#a8a49c"/>
    <rect x="9" y="5" width="1" height="1" fill="#ffffff"/>
    <rect x="10" y="5" width="1" height="1" fill="#e8e4dc"/>
    <rect x="11" y="5" width="1" height="1" fill="#f0ece4"/>
    <rect x="12" y="5" width="1" height="1" fill="#6a6660"/>
    <rect x="2" y="6" width="2" height="1" fill="#a8a49c"/>
    <rect x="7" y="6" width="1" height="1" fill="#a8a49c"/>
    <rect x="8" y="6" width="1" height="1" fill="#f0ece4"/>
    <rect x="9" y="6" width="1" height="1" fill="#e8e4dc"/>
    <rect x="10" y="6" width="1" height="1" fill="#f0ece4"/>
    <rect x="11" y="6" width="1" height="1" fill="#6a6660"/>
    <rect x="2" y="7" width="3" height="1" fill="#a8a49c"/>
    <rect x="6" y="7" width="1" height="1" fill="#a8a49c"/>
    <rect x="7" y="7" width="1" height="1" fill="#f0ece4"/>
    <rect x="8" y="7" width="1" height="1" fill="#e8e4dc"/>
    <rect x="9" y="7" width="1" height="1" fill="#f0ece4"/>
    <rect x="10" y="7" width="1" height="1" fill="#6a6660"/>
    <rect x="3" y="8" width="1" height="1" fill="#a8a49c"/>
    <rect x="4" y="8" width="1" height="1" fill="#d8d4cc"/>
    <rect x="5" y="8" width="1" height="1" fill="#6a6660"/>
    <rect x="6" y="8" width="1" height="1" fill="#f0ece4"/>
    <rect x="7" y="8" width="1" height="1" fill="#d8d4cc"/>
    <rect x="8" y="8" width="1" height="1" fill="#f0ece4"/>
    <rect x="9" y="8" width="1" height="1" fill="#6a6660"/>
    <rect x="3" y="9" width="1" height="1" fill="#a8a49c"/>
    <rect x="4" y="9" width="2" height="1" fill="#d8d4cc"/>
    <rect x="6" y="9" width="1" height="1" fill="#a8a49c"/>
    <rect x="7" y="9" width="1" height="1" fill="#f0ece4"/>
    <rect x="8" y="9" width="1" height="1" fill="#6a6660"/>
    <rect x="4" y="10" width="3" height="1" fill="#a8a49c"/>
    <rect x="7" y="10" width="1" height="1" fill="#6a6660"/>
    <rect x="3" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="5" y="11" width="1" height="1" fill="#6a6660"/>
    <rect x="6" y="11" width="2" height="1" fill="#a8a49c"/>
    <rect x="8" y="11" width="1" height="1" fill="#6a6660"/>
    <rect x="2" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="6" y="12" width="2" height="1" fill="#6a6660"/>
    <rect x="8" y="12" width="1" height="1" fill="#a8a49c"/>
    <rect x="9" y="12" width="1" height="1" fill="#6a6660"/>
    <rect x="0" y="13" width="2" height="1" fill="#a8a49c"/>
    <rect x="2" y="13" width="1" height="1" fill="#6b4428"/>
    <rect x="3" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="8" y="13" width="2" height="1" fill="#6a6660"/>
    <rect x="0" y="14" width="2" height="1" fill="#a8a49c"/>
    <rect x="2" y="14" width="1" height="1" fill="#6a6660"/>
    <rect x="0" y="15" width="3" height="1" fill="#6a6660"/>
  </svg>`,

  iron_axe: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="9" y="1" width="2" height="1" fill="#a8a49c"/>
    <rect x="8" y="2" width="1" height="1" fill="#a8a49c"/>
    <rect x="9" y="2" width="2" height="1" fill="#ffffff"/>
    <rect x="11" y="2" width="1" height="1" fill="#a8a49c"/>
    <rect x="7" y="3" width="1" height="1" fill="#a8a49c"/>
    <rect x="8" y="3" width="1" height="1" fill="#ffffff"/>
    <rect x="9" y="3" width="1" height="1" fill="#d8d4cc"/>
    <rect x="10" y="3" width="1" height="1" fill="#f0ece4"/>
    <rect x="11" y="3" width="1" height="1" fill="#a8a49c"/>
    <rect x="6" y="4" width="1" height="1" fill="#a8a49c"/>
    <rect x="7" y="4" width="1" height="1" fill="#ffffff"/>
    <rect x="8" y="4" width="3" height="1" fill="#d8d4cc"/>
    <rect x="11" y="4" width="1" height="1" fill="#5c3a22"/>
    <rect x="12" y="4" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="5" width="1" height="1" fill="#6a6660"/>
    <rect x="7" y="5" width="1" height="1" fill="#ffffff"/>
    <rect x="8" y="5" width="1" height="1" fill="#f0ece4"/>
    <rect x="9" y="5" width="1" height="1" fill="#d8d4cc"/>
    <rect x="10" y="5" width="1" height="1" fill="#c8c4bc"/>
    <rect x="11" y="5" width="1" height="1" fill="#d8d4cc"/>
    <rect x="12" y="5" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="6" width="2" height="1" fill="#6a6660"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#d8d4cc"/>
    <rect x="11" y="6" width="1" height="1" fill="#c8c4bc"/>
    <rect x="12" y="6" width="1" height="1" fill="#d8d4cc"/>
    <rect x="13" y="6" width="1" height="1" fill="#6a6660"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#6b4428"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="7" width="2" height="1" fill="#d8d4cc"/>
    <rect x="13" y="7" width="1" height="1" fill="#6a6660"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="8" width="2" height="1" fill="#6a6660"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#6b4428"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#6b4428"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  iron_shovel: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="11" y="2" width="2" height="1" fill="#a8a49c"/>
    <rect x="13" y="2" width="1" height="1" fill="#6a6660"/>
    <rect x="10" y="3" width="1" height="1" fill="#a8a49c"/>
    <rect x="11" y="3" width="2" height="1" fill="#ffffff"/>
    <rect x="13" y="3" width="1" height="1" fill="#d8d4cc"/>
    <rect x="14" y="3" width="1" height="1" fill="#6a6660"/>
    <rect x="9" y="4" width="1" height="1" fill="#a8a49c"/>
    <rect x="10" y="4" width="1" height="1" fill="#ffffff"/>
    <rect x="11" y="4" width="1" height="1" fill="#f0ece4"/>
    <rect x="12" y="4" width="1" height="1" fill="#d8d4cc"/>
    <rect x="13" y="4" width="1" height="1" fill="#ffffff"/>
    <rect x="14" y="4" width="1" height="1" fill="#6a6660"/>
    <rect x="8" y="5" width="1" height="1" fill="#a8a49c"/>
    <rect x="9" y="5" width="1" height="1" fill="#ffffff"/>
    <rect x="10" y="5" width="1" height="1" fill="#f0ece4"/>
    <rect x="11" y="5" width="1" height="1" fill="#d8d4cc"/>
    <rect x="12" y="5" width="1" height="1" fill="#f0ece4"/>
    <rect x="13" y="5" width="1" height="1" fill="#ffffff"/>
    <rect x="14" y="5" width="1" height="1" fill="#6a6660"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#d8d4cc"/>
    <rect x="11" y="6" width="1" height="1" fill="#f0ece4"/>
    <rect x="12" y="6" width="1" height="1" fill="#ffffff"/>
    <rect x="13" y="6" width="1" height="1" fill="#6a6660"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#7a5030"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="7" width="1" height="1" fill="#ffffff"/>
    <rect x="12" y="7" width="1" height="1" fill="#6a6660"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="8" width="1" height="1" fill="#6a6660"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="12" width="2" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  iron_pickaxe: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="6" y="2" width="5" height="1" fill="#a8a49c"/>
    <rect x="5" y="3" width="1" height="1" fill="#a8a49c"/>
    <rect x="6" y="3" width="1" height="1" fill="#ffffff"/>
    <rect x="7" y="3" width="1" height="1" fill="#f0ece4"/>
    <rect x="8" y="3" width="2" height="1" fill="#d8d4cc"/>
    <rect x="10" y="3" width="1" height="1" fill="#f0ece4"/>
    <rect x="11" y="3" width="1" height="1" fill="#a8a49c"/>
    <rect x="12" y="3" width="2" height="1" fill="#6b4428"/>
    <rect x="6" y="4" width="1" height="1" fill="#a8a49c"/>
    <rect x="7" y="4" width="3" height="1" fill="#6a6660"/>
    <rect x="10" y="4" width="2" height="1" fill="#d8d4cc"/>
    <rect x="12" y="4" width="1" height="1" fill="#7a5030"/>
    <rect x="13" y="4" width="1" height="1" fill="#3a2210"/>
    <rect x="10" y="5" width="1" height="1" fill="#5c3a22"/>
    <rect x="11" y="5" width="2" height="1" fill="#f0ece4"/>
    <rect x="13" y="5" width="1" height="1" fill="#6a6660"/>
    <rect x="9" y="6" width="2" height="1" fill="#6b4428"/>
    <rect x="11" y="6" width="1" height="1" fill="#3a2210"/>
    <rect x="12" y="6" width="2" height="1" fill="#d8d4cc"/>
    <rect x="14" y="6" width="1" height="1" fill="#6a6660"/>
    <rect x="8" y="7" width="3" height="1" fill="#5c3a22"/>
    <rect x="12" y="7" width="1" height="1" fill="#6a6660"/>
    <rect x="13" y="7" width="1" height="1" fill="#d8d4cc"/>
    <rect x="14" y="7" width="1" height="1" fill="#6a6660"/>
    <rect x="7" y="8" width="3" height="1" fill="#6b4428"/>
    <rect x="12" y="8" width="1" height="1" fill="#6a6660"/>
    <rect x="13" y="8" width="1" height="1" fill="#d8d4cc"/>
    <rect x="14" y="8" width="1" height="1" fill="#6a6660"/>
    <rect x="6" y="9" width="3" height="1" fill="#7a5030"/>
    <rect x="12" y="9" width="1" height="1" fill="#6a6660"/>
    <rect x="13" y="9" width="1" height="1" fill="#f0ece4"/>
    <rect x="14" y="9" width="1" height="1" fill="#6a6660"/>
    <rect x="5" y="10" width="3" height="1" fill="#6b4428"/>
    <rect x="12" y="10" width="1" height="1" fill="#6a6660"/>
    <rect x="13" y="10" width="1" height="1" fill="#ffffff"/>
    <rect x="14" y="10" width="1" height="1" fill="#6a6660"/>
    <rect x="4" y="11" width="3" height="1" fill="#7a5030"/>
    <rect x="13" y="11" width="1" height="1" fill="#6a6660"/>
    <rect x="3" y="12" width="3" height="1" fill="#6b4428"/>
    <rect x="2" y="13" width="3" height="1" fill="#7a5030"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  iron_spear: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="12" y="2" width="1" height="1" fill="#d8d4cc"/>
    <rect x="13" y="2" width="1" height="1" fill="#ffffff"/>
    <rect x="14" y="2" width="1" height="1" fill="#a8a49c"/>
    <rect x="10" y="3" width="1" height="1" fill="#d8d4cc"/>
    <rect x="11" y="3" width="2" height="1" fill="#f0ece4"/>
    <rect x="13" y="3" width="1" height="1" fill="#d8d4cc"/>
    <rect x="14" y="3" width="1" height="1" fill="#a8a49c"/>
    <rect x="10" y="4" width="1" height="1" fill="#a8a49c"/>
    <rect x="11" y="4" width="1" height="1" fill="#5c3a22"/>
    <rect x="12" y="4" width="1" height="1" fill="#f0ece4"/>
    <rect x="13" y="4" width="1" height="1" fill="#a8a49c"/>
    <rect x="10" y="5" width="1" height="1" fill="#5c3a22"/>
    <rect x="11" y="5" width="1" height="1" fill="#6b4428"/>
    <rect x="12" y="5" width="1" height="1" fill="#d8d4cc"/>
    <rect x="13" y="5" width="1" height="1" fill="#a8a49c"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="11" y="6" width="1" height="1" fill="#3a2210"/>
    <rect x="12" y="6" width="1" height="1" fill="#a8a49c"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#6b4428"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  gold_sword: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="13" y="0" width="3" height="1" fill="#c9a227"/>
    <rect x="12" y="1" width="1" height="1" fill="#c9a227"/>
    <rect x="13" y="1" width="2" height="1" fill="#fff6c8"/>
    <rect x="15" y="1" width="1" height="1" fill="#8a6810"/>
    <rect x="11" y="2" width="1" height="1" fill="#c9a227"/>
    <rect x="12" y="2" width="1" height="1" fill="#fff6c8"/>
    <rect x="13" y="2" width="1" height="1" fill="#ffe566"/>
    <rect x="14" y="2" width="1" height="1" fill="#fff6c8"/>
    <rect x="15" y="2" width="1" height="1" fill="#8a6810"/>
    <rect x="10" y="3" width="1" height="1" fill="#c9a227"/>
    <rect x="11" y="3" width="1" height="1" fill="#fff6c8"/>
    <rect x="12" y="3" width="1" height="1" fill="#ffe566"/>
    <rect x="13" y="3" width="1" height="1" fill="#fff6c8"/>
    <rect x="14" y="3" width="1" height="1" fill="#8a6810"/>
    <rect x="9" y="4" width="1" height="1" fill="#c9a227"/>
    <rect x="10" y="4" width="1" height="1" fill="#fff6c8"/>
    <rect x="11" y="4" width="1" height="1" fill="#ffe566"/>
    <rect x="12" y="4" width="1" height="1" fill="#fff0a0"/>
    <rect x="13" y="4" width="1" height="1" fill="#8a6810"/>
    <rect x="8" y="5" width="1" height="1" fill="#c9a227"/>
    <rect x="9" y="5" width="1" height="1" fill="#fff6c8"/>
    <rect x="10" y="5" width="1" height="1" fill="#ffe566"/>
    <rect x="11" y="5" width="1" height="1" fill="#fff0a0"/>
    <rect x="12" y="5" width="1" height="1" fill="#8a6810"/>
    <rect x="2" y="6" width="2" height="1" fill="#c9a227"/>
    <rect x="7" y="6" width="1" height="1" fill="#c9a227"/>
    <rect x="8" y="6" width="1" height="1" fill="#fff0a0"/>
    <rect x="9" y="6" width="1" height="1" fill="#ffe566"/>
    <rect x="10" y="6" width="1" height="1" fill="#fff0a0"/>
    <rect x="11" y="6" width="1" height="1" fill="#8a6810"/>
    <rect x="2" y="7" width="3" height="1" fill="#c9a227"/>
    <rect x="6" y="7" width="1" height="1" fill="#c9a227"/>
    <rect x="7" y="7" width="1" height="1" fill="#fff0a0"/>
    <rect x="8" y="7" width="1" height="1" fill="#ffe566"/>
    <rect x="9" y="7" width="1" height="1" fill="#fff0a0"/>
    <rect x="10" y="7" width="1" height="1" fill="#8a6810"/>
    <rect x="3" y="8" width="1" height="1" fill="#c9a227"/>
    <rect x="4" y="8" width="1" height="1" fill="#e8c84a"/>
    <rect x="5" y="8" width="1" height="1" fill="#8a6810"/>
    <rect x="6" y="8" width="1" height="1" fill="#fff0a0"/>
    <rect x="7" y="8" width="1" height="1" fill="#e8c84a"/>
    <rect x="8" y="8" width="1" height="1" fill="#fff0a0"/>
    <rect x="9" y="8" width="1" height="1" fill="#8a6810"/>
    <rect x="3" y="9" width="1" height="1" fill="#c9a227"/>
    <rect x="4" y="9" width="2" height="1" fill="#e8c84a"/>
    <rect x="6" y="9" width="1" height="1" fill="#c9a227"/>
    <rect x="7" y="9" width="1" height="1" fill="#fff0a0"/>
    <rect x="8" y="9" width="1" height="1" fill="#8a6810"/>
    <rect x="4" y="10" width="3" height="1" fill="#c9a227"/>
    <rect x="7" y="10" width="1" height="1" fill="#8a6810"/>
    <rect x="3" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="5" y="11" width="1" height="1" fill="#8a6810"/>
    <rect x="6" y="11" width="2" height="1" fill="#c9a227"/>
    <rect x="8" y="11" width="1" height="1" fill="#8a6810"/>
    <rect x="2" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="6" y="12" width="2" height="1" fill="#8a6810"/>
    <rect x="8" y="12" width="1" height="1" fill="#c9a227"/>
    <rect x="9" y="12" width="1" height="1" fill="#8a6810"/>
    <rect x="0" y="13" width="2" height="1" fill="#c9a227"/>
    <rect x="2" y="13" width="1" height="1" fill="#6b4428"/>
    <rect x="3" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="8" y="13" width="2" height="1" fill="#8a6810"/>
    <rect x="0" y="14" width="2" height="1" fill="#c9a227"/>
    <rect x="2" y="14" width="1" height="1" fill="#8a6810"/>
    <rect x="0" y="15" width="3" height="1" fill="#8a6810"/>
  </svg>`,

  diamond_sword: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="13" y="0" width="3" height="1" fill="#5ec8e0"/>
    <rect x="12" y="1" width="1" height="1" fill="#5ec8e0"/>
    <rect x="13" y="1" width="2" height="1" fill="#e8fcff"/>
    <rect x="15" y="1" width="1" height="1" fill="#2a7088"/>
    <rect x="11" y="2" width="1" height="1" fill="#5ec8e0"/>
    <rect x="12" y="2" width="1" height="1" fill="#e8fcff"/>
    <rect x="13" y="2" width="1" height="1" fill="#b8f0ff"/>
    <rect x="14" y="2" width="1" height="1" fill="#e8fcff"/>
    <rect x="15" y="2" width="1" height="1" fill="#2a7088"/>
    <rect x="10" y="3" width="1" height="1" fill="#5ec8e0"/>
    <rect x="11" y="3" width="1" height="1" fill="#e8fcff"/>
    <rect x="12" y="3" width="1" height="1" fill="#b8f0ff"/>
    <rect x="13" y="3" width="1" height="1" fill="#e8fcff"/>
    <rect x="14" y="3" width="1" height="1" fill="#2a7088"/>
    <rect x="9" y="4" width="1" height="1" fill="#5ec8e0"/>
    <rect x="10" y="4" width="1" height="1" fill="#e8fcff"/>
    <rect x="11" y="4" width="1" height="1" fill="#b8f0ff"/>
    <rect x="12" y="4" width="1" height="1" fill="#d0f8ff"/>
    <rect x="13" y="4" width="1" height="1" fill="#2a7088"/>
    <rect x="8" y="5" width="1" height="1" fill="#5ec8e0"/>
    <rect x="9" y="5" width="1" height="1" fill="#e8fcff"/>
    <rect x="10" y="5" width="1" height="1" fill="#b8f0ff"/>
    <rect x="11" y="5" width="1" height="1" fill="#d0f8ff"/>
    <rect x="12" y="5" width="1" height="1" fill="#2a7088"/>
    <rect x="2" y="6" width="2" height="1" fill="#5ec8e0"/>
    <rect x="7" y="6" width="1" height="1" fill="#5ec8e0"/>
    <rect x="8" y="6" width="1" height="1" fill="#d0f8ff"/>
    <rect x="9" y="6" width="1" height="1" fill="#b8f0ff"/>
    <rect x="10" y="6" width="1" height="1" fill="#d0f8ff"/>
    <rect x="11" y="6" width="1" height="1" fill="#2a7088"/>
    <rect x="2" y="7" width="3" height="1" fill="#5ec8e0"/>
    <rect x="6" y="7" width="1" height="1" fill="#5ec8e0"/>
    <rect x="7" y="7" width="1" height="1" fill="#d0f8ff"/>
    <rect x="8" y="7" width="1" height="1" fill="#b8f0ff"/>
    <rect x="9" y="7" width="1" height="1" fill="#d0f8ff"/>
    <rect x="10" y="7" width="1" height="1" fill="#2a7088"/>
    <rect x="3" y="8" width="1" height="1" fill="#5ec8e0"/>
    <rect x="4" y="8" width="1" height="1" fill="#7ad8f0"/>
    <rect x="5" y="8" width="1" height="1" fill="#2a7088"/>
    <rect x="6" y="8" width="1" height="1" fill="#d0f8ff"/>
    <rect x="7" y="8" width="1" height="1" fill="#7ad8f0"/>
    <rect x="8" y="8" width="1" height="1" fill="#d0f8ff"/>
    <rect x="9" y="8" width="1" height="1" fill="#2a7088"/>
    <rect x="3" y="9" width="1" height="1" fill="#5ec8e0"/>
    <rect x="4" y="9" width="2" height="1" fill="#7ad8f0"/>
    <rect x="6" y="9" width="1" height="1" fill="#5ec8e0"/>
    <rect x="7" y="9" width="1" height="1" fill="#d0f8ff"/>
    <rect x="8" y="9" width="1" height="1" fill="#2a7088"/>
    <rect x="4" y="10" width="3" height="1" fill="#5ec8e0"/>
    <rect x="7" y="10" width="1" height="1" fill="#2a7088"/>
    <rect x="3" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="5" y="11" width="1" height="1" fill="#2a7088"/>
    <rect x="6" y="11" width="2" height="1" fill="#5ec8e0"/>
    <rect x="8" y="11" width="1" height="1" fill="#2a7088"/>
    <rect x="2" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="6" y="12" width="2" height="1" fill="#2a7088"/>
    <rect x="8" y="12" width="1" height="1" fill="#5ec8e0"/>
    <rect x="9" y="12" width="1" height="1" fill="#2a7088"/>
    <rect x="0" y="13" width="2" height="1" fill="#5ec8e0"/>
    <rect x="2" y="13" width="1" height="1" fill="#6b4428"/>
    <rect x="3" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="8" y="13" width="2" height="1" fill="#2a7088"/>
    <rect x="0" y="14" width="2" height="1" fill="#5ec8e0"/>
    <rect x="2" y="14" width="1" height="1" fill="#2a7088"/>
    <rect x="0" y="15" width="3" height="1" fill="#2a7088"/>
  </svg>`,

  gold_axe: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="9" y="1" width="2" height="1" fill="#c9a227"/>
    <rect x="8" y="2" width="1" height="1" fill="#c9a227"/>
    <rect x="9" y="2" width="2" height="1" fill="#fff6c8"/>
    <rect x="11" y="2" width="1" height="1" fill="#c9a227"/>
    <rect x="7" y="3" width="1" height="1" fill="#c9a227"/>
    <rect x="8" y="3" width="1" height="1" fill="#fff6c8"/>
    <rect x="9" y="3" width="1" height="1" fill="#e8c84a"/>
    <rect x="10" y="3" width="1" height="1" fill="#fff0a0"/>
    <rect x="11" y="3" width="1" height="1" fill="#c9a227"/>
    <rect x="6" y="4" width="1" height="1" fill="#c9a227"/>
    <rect x="7" y="4" width="1" height="1" fill="#fff6c8"/>
    <rect x="8" y="4" width="3" height="1" fill="#e8c84a"/>
    <rect x="11" y="4" width="1" height="1" fill="#5c3a22"/>
    <rect x="12" y="4" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="5" width="1" height="1" fill="#8a6810"/>
    <rect x="7" y="5" width="1" height="1" fill="#fff6c8"/>
    <rect x="8" y="5" width="1" height="1" fill="#fff0a0"/>
    <rect x="9" y="5" width="1" height="1" fill="#e8c84a"/>
    <rect x="10" y="5" width="1" height="1" fill="#d4b030"/>
    <rect x="11" y="5" width="1" height="1" fill="#e8c84a"/>
    <rect x="12" y="5" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="6" width="2" height="1" fill="#8a6810"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#e8c84a"/>
    <rect x="11" y="6" width="1" height="1" fill="#d4b030"/>
    <rect x="12" y="6" width="1" height="1" fill="#e8c84a"/>
    <rect x="13" y="6" width="1" height="1" fill="#8a6810"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#6b4428"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="7" width="2" height="1" fill="#e8c84a"/>
    <rect x="13" y="7" width="1" height="1" fill="#8a6810"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="8" width="2" height="1" fill="#8a6810"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#6b4428"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#6b4428"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  diamond_axe: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="9" y="1" width="2" height="1" fill="#5ec8e0"/>
    <rect x="8" y="2" width="1" height="1" fill="#5ec8e0"/>
    <rect x="9" y="2" width="2" height="1" fill="#e8fcff"/>
    <rect x="11" y="2" width="1" height="1" fill="#5ec8e0"/>
    <rect x="7" y="3" width="1" height="1" fill="#5ec8e0"/>
    <rect x="8" y="3" width="1" height="1" fill="#e8fcff"/>
    <rect x="9" y="3" width="1" height="1" fill="#7ad8f0"/>
    <rect x="10" y="3" width="1" height="1" fill="#d0f8ff"/>
    <rect x="11" y="3" width="1" height="1" fill="#5ec8e0"/>
    <rect x="6" y="4" width="1" height="1" fill="#5ec8e0"/>
    <rect x="7" y="4" width="1" height="1" fill="#e8fcff"/>
    <rect x="8" y="4" width="3" height="1" fill="#7ad8f0"/>
    <rect x="11" y="4" width="1" height="1" fill="#5c3a22"/>
    <rect x="12" y="4" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="5" width="1" height="1" fill="#2a7088"/>
    <rect x="7" y="5" width="1" height="1" fill="#e8fcff"/>
    <rect x="8" y="5" width="1" height="1" fill="#d0f8ff"/>
    <rect x="9" y="5" width="1" height="1" fill="#7ad8f0"/>
    <rect x="10" y="5" width="1" height="1" fill="#68c8e0"/>
    <rect x="11" y="5" width="1" height="1" fill="#7ad8f0"/>
    <rect x="12" y="5" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="6" width="2" height="1" fill="#2a7088"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#7ad8f0"/>
    <rect x="11" y="6" width="1" height="1" fill="#68c8e0"/>
    <rect x="12" y="6" width="1" height="1" fill="#7ad8f0"/>
    <rect x="13" y="6" width="1" height="1" fill="#2a7088"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#6b4428"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="7" width="2" height="1" fill="#7ad8f0"/>
    <rect x="13" y="7" width="1" height="1" fill="#2a7088"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="8" width="2" height="1" fill="#2a7088"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#6b4428"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#6b4428"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  gold_shovel: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="11" y="2" width="2" height="1" fill="#c9a227"/>
    <rect x="13" y="2" width="1" height="1" fill="#8a6810"/>
    <rect x="10" y="3" width="1" height="1" fill="#c9a227"/>
    <rect x="11" y="3" width="2" height="1" fill="#fff6c8"/>
    <rect x="13" y="3" width="1" height="1" fill="#e8c84a"/>
    <rect x="14" y="3" width="1" height="1" fill="#8a6810"/>
    <rect x="9" y="4" width="1" height="1" fill="#c9a227"/>
    <rect x="10" y="4" width="1" height="1" fill="#fff6c8"/>
    <rect x="11" y="4" width="1" height="1" fill="#fff0a0"/>
    <rect x="12" y="4" width="1" height="1" fill="#e8c84a"/>
    <rect x="13" y="4" width="1" height="1" fill="#fff6c8"/>
    <rect x="14" y="4" width="1" height="1" fill="#8a6810"/>
    <rect x="8" y="5" width="1" height="1" fill="#c9a227"/>
    <rect x="9" y="5" width="1" height="1" fill="#fff6c8"/>
    <rect x="10" y="5" width="1" height="1" fill="#fff0a0"/>
    <rect x="11" y="5" width="1" height="1" fill="#e8c84a"/>
    <rect x="12" y="5" width="1" height="1" fill="#fff0a0"/>
    <rect x="13" y="5" width="1" height="1" fill="#fff6c8"/>
    <rect x="14" y="5" width="1" height="1" fill="#8a6810"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#e8c84a"/>
    <rect x="11" y="6" width="1" height="1" fill="#fff0a0"/>
    <rect x="12" y="6" width="1" height="1" fill="#fff6c8"/>
    <rect x="13" y="6" width="1" height="1" fill="#8a6810"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#7a5030"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="7" width="1" height="1" fill="#fff6c8"/>
    <rect x="12" y="7" width="1" height="1" fill="#8a6810"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="8" width="1" height="1" fill="#8a6810"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="12" width="2" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  diamond_shovel: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="11" y="2" width="2" height="1" fill="#5ec8e0"/>
    <rect x="13" y="2" width="1" height="1" fill="#2a7088"/>
    <rect x="10" y="3" width="1" height="1" fill="#5ec8e0"/>
    <rect x="11" y="3" width="2" height="1" fill="#e8fcff"/>
    <rect x="13" y="3" width="1" height="1" fill="#7ad8f0"/>
    <rect x="14" y="3" width="1" height="1" fill="#2a7088"/>
    <rect x="9" y="4" width="1" height="1" fill="#5ec8e0"/>
    <rect x="10" y="4" width="1" height="1" fill="#e8fcff"/>
    <rect x="11" y="4" width="1" height="1" fill="#d0f8ff"/>
    <rect x="12" y="4" width="1" height="1" fill="#7ad8f0"/>
    <rect x="13" y="4" width="1" height="1" fill="#e8fcff"/>
    <rect x="14" y="4" width="1" height="1" fill="#2a7088"/>
    <rect x="8" y="5" width="1" height="1" fill="#5ec8e0"/>
    <rect x="9" y="5" width="1" height="1" fill="#e8fcff"/>
    <rect x="10" y="5" width="1" height="1" fill="#d0f8ff"/>
    <rect x="11" y="5" width="1" height="1" fill="#7ad8f0"/>
    <rect x="12" y="5" width="1" height="1" fill="#d0f8ff"/>
    <rect x="13" y="5" width="1" height="1" fill="#e8fcff"/>
    <rect x="14" y="5" width="1" height="1" fill="#2a7088"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#7ad8f0"/>
    <rect x="11" y="6" width="1" height="1" fill="#d0f8ff"/>
    <rect x="12" y="6" width="1" height="1" fill="#e8fcff"/>
    <rect x="13" y="6" width="1" height="1" fill="#2a7088"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#7a5030"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="7" width="1" height="1" fill="#e8fcff"/>
    <rect x="12" y="7" width="1" height="1" fill="#2a7088"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="8" width="1" height="1" fill="#2a7088"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="12" width="2" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  gold_pickaxe: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="6" y="2" width="5" height="1" fill="#c9a227"/>
    <rect x="5" y="3" width="1" height="1" fill="#c9a227"/>
    <rect x="6" y="3" width="1" height="1" fill="#fff6c8"/>
    <rect x="7" y="3" width="1" height="1" fill="#fff0a0"/>
    <rect x="8" y="3" width="2" height="1" fill="#e8c84a"/>
    <rect x="10" y="3" width="1" height="1" fill="#fff0a0"/>
    <rect x="11" y="3" width="1" height="1" fill="#c9a227"/>
    <rect x="12" y="3" width="2" height="1" fill="#6b4428"/>
    <rect x="6" y="4" width="1" height="1" fill="#c9a227"/>
    <rect x="7" y="4" width="3" height="1" fill="#8a6810"/>
    <rect x="10" y="4" width="2" height="1" fill="#e8c84a"/>
    <rect x="12" y="4" width="1" height="1" fill="#7a5030"/>
    <rect x="13" y="4" width="1" height="1" fill="#3a2210"/>
    <rect x="10" y="5" width="1" height="1" fill="#5c3a22"/>
    <rect x="11" y="5" width="2" height="1" fill="#fff0a0"/>
    <rect x="13" y="5" width="1" height="1" fill="#8a6810"/>
    <rect x="9" y="6" width="2" height="1" fill="#6b4428"/>
    <rect x="11" y="6" width="1" height="1" fill="#3a2210"/>
    <rect x="12" y="6" width="2" height="1" fill="#e8c84a"/>
    <rect x="14" y="6" width="1" height="1" fill="#8a6810"/>
    <rect x="8" y="7" width="3" height="1" fill="#5c3a22"/>
    <rect x="12" y="7" width="1" height="1" fill="#8a6810"/>
    <rect x="13" y="7" width="1" height="1" fill="#e8c84a"/>
    <rect x="14" y="7" width="1" height="1" fill="#8a6810"/>
    <rect x="7" y="8" width="3" height="1" fill="#6b4428"/>
    <rect x="12" y="8" width="1" height="1" fill="#8a6810"/>
    <rect x="13" y="8" width="1" height="1" fill="#e8c84a"/>
    <rect x="14" y="8" width="1" height="1" fill="#8a6810"/>
    <rect x="6" y="9" width="3" height="1" fill="#7a5030"/>
    <rect x="12" y="9" width="1" height="1" fill="#8a6810"/>
    <rect x="13" y="9" width="1" height="1" fill="#fff0a0"/>
    <rect x="14" y="9" width="1" height="1" fill="#8a6810"/>
    <rect x="5" y="10" width="3" height="1" fill="#6b4428"/>
    <rect x="12" y="10" width="1" height="1" fill="#8a6810"/>
    <rect x="13" y="10" width="1" height="1" fill="#fff6c8"/>
    <rect x="14" y="10" width="1" height="1" fill="#8a6810"/>
    <rect x="4" y="11" width="3" height="1" fill="#7a5030"/>
    <rect x="13" y="11" width="1" height="1" fill="#8a6810"/>
    <rect x="3" y="12" width="3" height="1" fill="#6b4428"/>
    <rect x="2" y="13" width="3" height="1" fill="#7a5030"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  diamond_pickaxe: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="6" y="2" width="5" height="1" fill="#5ec8e0"/>
    <rect x="5" y="3" width="1" height="1" fill="#5ec8e0"/>
    <rect x="6" y="3" width="1" height="1" fill="#e8fcff"/>
    <rect x="7" y="3" width="1" height="1" fill="#d0f8ff"/>
    <rect x="8" y="3" width="2" height="1" fill="#7ad8f0"/>
    <rect x="10" y="3" width="1" height="1" fill="#d0f8ff"/>
    <rect x="11" y="3" width="1" height="1" fill="#5ec8e0"/>
    <rect x="12" y="3" width="2" height="1" fill="#6b4428"/>
    <rect x="6" y="4" width="1" height="1" fill="#5ec8e0"/>
    <rect x="7" y="4" width="3" height="1" fill="#2a7088"/>
    <rect x="10" y="4" width="2" height="1" fill="#7ad8f0"/>
    <rect x="12" y="4" width="1" height="1" fill="#7a5030"/>
    <rect x="13" y="4" width="1" height="1" fill="#3a2210"/>
    <rect x="10" y="5" width="1" height="1" fill="#5c3a22"/>
    <rect x="11" y="5" width="2" height="1" fill="#d0f8ff"/>
    <rect x="13" y="5" width="1" height="1" fill="#2a7088"/>
    <rect x="9" y="6" width="2" height="1" fill="#6b4428"/>
    <rect x="11" y="6" width="1" height="1" fill="#3a2210"/>
    <rect x="12" y="6" width="2" height="1" fill="#7ad8f0"/>
    <rect x="14" y="6" width="1" height="1" fill="#2a7088"/>
    <rect x="8" y="7" width="3" height="1" fill="#5c3a22"/>
    <rect x="12" y="7" width="1" height="1" fill="#2a7088"/>
    <rect x="13" y="7" width="1" height="1" fill="#7ad8f0"/>
    <rect x="14" y="7" width="1" height="1" fill="#2a7088"/>
    <rect x="7" y="8" width="3" height="1" fill="#6b4428"/>
    <rect x="12" y="8" width="1" height="1" fill="#2a7088"/>
    <rect x="13" y="8" width="1" height="1" fill="#7ad8f0"/>
    <rect x="14" y="8" width="1" height="1" fill="#2a7088"/>
    <rect x="6" y="9" width="3" height="1" fill="#7a5030"/>
    <rect x="12" y="9" width="1" height="1" fill="#2a7088"/>
    <rect x="13" y="9" width="1" height="1" fill="#d0f8ff"/>
    <rect x="14" y="9" width="1" height="1" fill="#2a7088"/>
    <rect x="5" y="10" width="3" height="1" fill="#6b4428"/>
    <rect x="12" y="10" width="1" height="1" fill="#2a7088"/>
    <rect x="13" y="10" width="1" height="1" fill="#e8fcff"/>
    <rect x="14" y="10" width="1" height="1" fill="#2a7088"/>
    <rect x="4" y="11" width="3" height="1" fill="#7a5030"/>
    <rect x="13" y="11" width="1" height="1" fill="#2a7088"/>
    <rect x="3" y="12" width="3" height="1" fill="#6b4428"/>
    <rect x="2" y="13" width="3" height="1" fill="#7a5030"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  gold_spear: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="12" y="2" width="1" height="1" fill="#e8c84a"/>
    <rect x="13" y="2" width="1" height="1" fill="#fff6c8"/>
    <rect x="14" y="2" width="1" height="1" fill="#c9a227"/>
    <rect x="10" y="3" width="1" height="1" fill="#e8c84a"/>
    <rect x="11" y="3" width="2" height="1" fill="#fff0a0"/>
    <rect x="13" y="3" width="1" height="1" fill="#e8c84a"/>
    <rect x="14" y="3" width="1" height="1" fill="#c9a227"/>
    <rect x="10" y="4" width="1" height="1" fill="#c9a227"/>
    <rect x="11" y="4" width="1" height="1" fill="#5c3a22"/>
    <rect x="12" y="4" width="1" height="1" fill="#fff0a0"/>
    <rect x="13" y="4" width="1" height="1" fill="#c9a227"/>
    <rect x="10" y="5" width="1" height="1" fill="#5c3a22"/>
    <rect x="11" y="5" width="1" height="1" fill="#6b4428"/>
    <rect x="12" y="5" width="1" height="1" fill="#e8c84a"/>
    <rect x="13" y="5" width="1" height="1" fill="#c9a227"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="11" y="6" width="1" height="1" fill="#3a2210"/>
    <rect x="12" y="6" width="1" height="1" fill="#c9a227"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#6b4428"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  diamond_spear: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="12" y="2" width="1" height="1" fill="#7ad8f0"/>
    <rect x="13" y="2" width="1" height="1" fill="#e8fcff"/>
    <rect x="14" y="2" width="1" height="1" fill="#5ec8e0"/>
    <rect x="10" y="3" width="1" height="1" fill="#7ad8f0"/>
    <rect x="11" y="3" width="2" height="1" fill="#d0f8ff"/>
    <rect x="13" y="3" width="1" height="1" fill="#7ad8f0"/>
    <rect x="14" y="3" width="1" height="1" fill="#5ec8e0"/>
    <rect x="10" y="4" width="1" height="1" fill="#5ec8e0"/>
    <rect x="11" y="4" width="1" height="1" fill="#5c3a22"/>
    <rect x="12" y="4" width="1" height="1" fill="#d0f8ff"/>
    <rect x="13" y="4" width="1" height="1" fill="#5ec8e0"/>
    <rect x="10" y="5" width="1" height="1" fill="#5c3a22"/>
    <rect x="11" y="5" width="1" height="1" fill="#6b4428"/>
    <rect x="12" y="5" width="1" height="1" fill="#7ad8f0"/>
    <rect x="13" y="5" width="1" height="1" fill="#5ec8e0"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="11" y="6" width="1" height="1" fill="#3a2210"/>
    <rect x="12" y="6" width="1" height="1" fill="#5ec8e0"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#6b4428"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="9" y="8" width="1" height="1" fill="#3a2210"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="10" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="3" y="12" width="1" height="1" fill="#5c3a22"/>
    <rect x="4" y="12" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="12" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="13" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="4" y="13" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,


  scissors: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="8" y="2" width="1" height="1" fill="#6e342a"/>
    <rect x="9" y="2" width="1" height="1" fill="#a8a49c"/>
    <rect x="10" y="2" width="2" height="1" fill="#e8e4dc"/>
    <rect x="12" y="2" width="1" height="1" fill="#a8a49c"/>
    <rect x="7" y="3" width="1" height="1" fill="#6e342a"/>
    <rect x="8" y="3" width="1" height="1" fill="#6a6660"/>
    <rect x="9" y="3" width="2" height="1" fill="#e8e4dc"/>
    <rect x="11" y="3" width="1" height="1" fill="#a8a49c"/>
    <rect x="13" y="3" width="1" height="1" fill="#a8a49c"/>
    <rect x="6" y="4" width="1" height="1" fill="#6e342a"/>
    <rect x="7" y="4" width="1" height="1" fill="#894235"/>
    <rect x="8" y="4" width="1" height="1" fill="#a8a49c"/>
    <rect x="9" y="4" width="1" height="1" fill="#e8e4dc"/>
    <rect x="10" y="4" width="1" height="1" fill="#a8a49c"/>
    <rect x="12" y="4" width="1" height="1" fill="#a8a49c"/>
    <rect x="13" y="4" width="1" height="1" fill="#e8e4dc"/>
    <rect x="5" y="5" width="1" height="1" fill="#6e342a"/>
    <rect x="6" y="5" width="1" height="1" fill="#a44e3e"/>
    <rect x="7" y="5" width="1" height="1" fill="#a8a49c"/>
    <rect x="8" y="5" width="1" height="1" fill="#e8e4dc"/>
    <rect x="9" y="5" width="1" height="1" fill="#a8a49c"/>
    <rect x="11" y="5" width="1" height="1" fill="#a8a49c"/>
    <rect x="12" y="5" width="2" height="1" fill="#e8e4dc"/>
    <rect x="4" y="6" width="1" height="1" fill="#6e342a"/>
    <rect x="5" y="6" width="1" height="1" fill="#a44e3e"/>
    <rect x="6" y="6" width="1" height="1" fill="#5b2c1f"/>
    <rect x="7" y="6" width="1" height="1" fill="#6a6660"/>
    <rect x="8" y="6" width="1" height="1" fill="#a8a49c"/>
    <rect x="10" y="6" width="1" height="1" fill="#a8a49c"/>
    <rect x="11" y="6" width="2" height="1" fill="#e8e4dc"/>
    <rect x="13" y="6" width="1" height="1" fill="#a8a49c"/>
    <rect x="4" y="7" width="1" height="1" fill="#6e342a"/>
    <rect x="5" y="7" width="1" height="1" fill="#a44e3e"/>
    <rect x="6" y="7" width="1" height="1" fill="#5b2c1f"/>
    <rect x="9" y="7" width="1" height="1" fill="#a8a49c"/>
    <rect x="10" y="7" width="1" height="1" fill="#e8e4dc"/>
    <rect x="11" y="7" width="1" height="1" fill="#a8a49c"/>
    <rect x="12" y="7" width="1" height="1" fill="#6a6660"/>
    <rect x="13" y="7" width="1" height="1" fill="#5b2c1f"/>
    <rect x="3" y="8" width="1" height="1" fill="#6e342a"/>
    <rect x="4" y="8" width="1" height="1" fill="#a44e3e"/>
    <rect x="5" y="8" width="1" height="1" fill="#5b2c1f"/>
    <rect x="9" y="8" width="1" height="1" fill="#6a6660"/>
    <rect x="10" y="8" width="1" height="1" fill="#a8a49c"/>
    <rect x="11" y="8" width="1" height="1" fill="#6e342a"/>
    <rect x="12" y="8" width="1" height="1" fill="#5b2c1f"/>
    <rect x="3" y="9" width="1" height="1" fill="#6e342a"/>
    <rect x="4" y="9" width="1" height="1" fill="#894235"/>
    <rect x="5" y="9" width="1" height="1" fill="#5b2c1f"/>
    <rect x="8" y="9" width="3" height="1" fill="#6e342a"/>
    <rect x="11" y="9" width="1" height="1" fill="#5b2c1f"/>
    <rect x="3" y="10" width="2" height="1" fill="#a8a49c"/>
    <rect x="5" y="10" width="3" height="1" fill="#6e342a"/>
    <rect x="8" y="10" width="2" height="1" fill="#894235"/>
    <rect x="10" y="10" width="1" height="1" fill="#5b2c1f"/>
    <rect x="2" y="11" width="1" height="1" fill="#a8a49c"/>
    <rect x="5" y="11" width="1" height="1" fill="#6a6660"/>
    <rect x="6" y="11" width="2" height="1" fill="#894235"/>
    <rect x="8" y="11" width="2" height="1" fill="#5b2c1f"/>
    <rect x="2" y="12" width="1" height="1" fill="#6a6660"/>
    <rect x="5" y="12" width="1" height="1" fill="#414141"/>
    <rect x="6" y="12" width="2" height="1" fill="#5b2c1f"/>
    <rect x="3" y="13" width="2" height="1" fill="#414141"/>
  </svg>`,

  leaves: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#142018"/>
    <rect x="11" y="1" width="1" height="1" fill="#c8f090"/>
    <rect x="10" y="2" width="1" height="1" fill="#a8e878"/>
    <rect x="11" y="2" width="1" height="1" fill="#c8f090"/>
    <rect x="12" y="2" width="1" height="1" fill="#8fd868"/>
    <rect x="9" y="3" width="1" height="1" fill="#8fd868"/>
    <rect x="10" y="3" width="1" height="1" fill="#a8e878"/>
    <rect x="11" y="3" width="1" height="1" fill="#3d7234"/>
    <rect x="12" y="3" width="1" height="1" fill="#6db850"/>
    <rect x="8" y="4" width="1" height="1" fill="#6db850"/>
    <rect x="9" y="4" width="1" height="1" fill="#a8e878"/>
    <rect x="10" y="4" width="1" height="1" fill="#3d7234"/>
    <rect x="11" y="4" width="1" height="1" fill="#78c858"/>
    <rect x="12" y="4" width="1" height="1" fill="#58a042"/>
    <rect x="7" y="5" width="1" height="1" fill="#58a042"/>
    <rect x="8" y="5" width="1" height="1" fill="#8fd868"/>
    <rect x="9" y="5" width="1" height="1" fill="#3d7234"/>
    <rect x="10" y="5" width="1" height="1" fill="#6db850"/>
    <rect x="11" y="5" width="1" height="1" fill="#58a042"/>
    <rect x="12" y="5" width="1" height="1" fill="#4a8838"/>
    <rect x="6" y="6" width="1" height="1" fill="#4a8838"/>
    <rect x="7" y="6" width="1" height="1" fill="#6db850"/>
    <rect x="8" y="6" width="1" height="1" fill="#3d7234"/>
    <rect x="9" y="6" width="1" height="1" fill="#58a042"/>
    <rect x="10" y="6" width="1" height="1" fill="#4a8838"/>
    <rect x="11" y="6" width="1" height="1" fill="#3d7234"/>
    <rect x="6" y="7" width="1" height="1" fill="#3d7234"/>
    <rect x="7" y="7" width="1" height="1" fill="#3d7234"/>
    <rect x="8" y="7" width="1" height="1" fill="#4a8838"/>
    <rect x="9" y="7" width="1" height="1" fill="#3d7234"/>
    <rect x="10" y="7" width="1" height="1" fill="#3d7234"/>
    <rect x="7" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="8" y="8" width="1" height="1" fill="#3d7234"/>
    <rect x="6" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="7" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="10" width="1" height="1" fill="#6b4428"/>
    <rect x="4" y="11" width="1" height="1" fill="#5c3a22"/>
    <rect x="5" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="4" y="12" width="1" height="1" fill="#3a2210"/>
  </svg>`,

  rope: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#142018"/>
    <rect x="4" y="2" width="1" height="1" fill="#4a8838"/>
    <rect x="5" y="2" width="4" height="1" fill="#8fd868"/>
    <rect x="9" y="2" width="1" height="1" fill="#6db850"/>
    <rect x="10" y="2" width="1" height="1" fill="#4a8838"/>
    <rect x="3" y="3" width="1" height="1" fill="#4a8838"/>
    <rect x="4" y="3" width="1" height="1" fill="#8fd868"/>
    <rect x="5" y="3" width="2" height="1" fill="#4a8838"/>
    <rect x="7" y="3" width="3" height="1" fill="#3d7234"/>
    <rect x="10" y="3" width="1" height="1" fill="#6db850"/>
    <rect x="11" y="3" width="1" height="1" fill="#4a8838"/>
    <rect x="3" y="4" width="1" height="1" fill="#3d7234"/>
    <rect x="4" y="4" width="1" height="1" fill="#8fd868"/>
    <rect x="5" y="4" width="1" height="1" fill="#4a8838"/>
    <rect x="10" y="4" width="1" height="1" fill="#3d7234"/>
    <rect x="11" y="4" width="1" height="1" fill="#8fd868"/>
    <rect x="12" y="4" width="1" height="1" fill="#4a8838"/>
    <rect x="3" y="5" width="1" height="1" fill="#3d7234"/>
    <rect x="4" y="5" width="1" height="1" fill="#4a8838"/>
    <rect x="5" y="5" width="1" height="1" fill="#6db850"/>
    <rect x="11" y="5" width="1" height="1" fill="#3d7234"/>
    <rect x="12" y="5" width="1" height="1" fill="#8fd868"/>
    <rect x="13" y="5" width="1" height="1" fill="#4a8838"/>
    <rect x="4" y="6" width="1" height="1" fill="#3d7234"/>
    <rect x="5" y="6" width="1" height="1" fill="#4a8838"/>
    <rect x="6" y="6" width="1" height="1" fill="#6db850"/>
    <rect x="11" y="6" width="1" height="1" fill="#4a8838"/>
    <rect x="12" y="6" width="1" height="1" fill="#6db850"/>
    <rect x="13" y="6" width="1" height="1" fill="#3d7234"/>
    <rect x="5" y="7" width="2" height="1" fill="#3d7234"/>
    <rect x="7" y="7" width="4" height="1" fill="#6db850"/>
    <rect x="11" y="7" width="1" height="1" fill="#4a8838"/>
    <rect x="12" y="7" width="1" height="1" fill="#8fd868"/>
    <rect x="13" y="7" width="1" height="1" fill="#3d7234"/>
    <rect x="7" y="8" width="3" height="1" fill="#3d7234"/>
    <rect x="10" y="8" width="1" height="1" fill="#4a8838"/>
    <rect x="11" y="8" width="1" height="1" fill="#c8f090"/>
    <rect x="12" y="8" width="1" height="1" fill="#a8e878"/>
    <rect x="13" y="8" width="1" height="1" fill="#3d7234"/>
    <rect x="10" y="9" width="1" height="1" fill="#3d7234"/>
    <rect x="11" y="9" width="1" height="1" fill="#a8e878"/>
    <rect x="12" y="9" width="1" height="1" fill="#58a042"/>
    <rect x="10" y="10" width="1" height="1" fill="#4a8838"/>
    <rect x="11" y="10" width="1" height="1" fill="#8fd868"/>
    <rect x="12" y="10" width="1" height="1" fill="#3d7234"/>
    <rect x="10" y="11" width="1" height="1" fill="#4a8838"/>
    <rect x="11" y="11" width="1" height="1" fill="#8fd868"/>
    <rect x="12" y="11" width="1" height="1" fill="#3d7234"/>
    <rect x="3" y="12" width="1" height="1" fill="#6db850"/>
    <rect x="8" y="12" width="1" height="1" fill="#4a8838"/>
    <rect x="9" y="12" width="1" height="1" fill="#8fd868"/>
    <rect x="10" y="12" width="1" height="1" fill="#6db850"/>
    <rect x="11" y="12" width="1" height="1" fill="#3d7234"/>
    <rect x="3" y="13" width="1" height="1" fill="#4a8838"/>
    <rect x="4" y="13" width="1" height="1" fill="#6db850"/>
    <rect x="5" y="13" width="2" height="1" fill="#8fd868"/>
    <rect x="7" y="13" width="1" height="1" fill="#6db850"/>
    <rect x="8" y="13" width="1" height="1" fill="#8fd868"/>
    <rect x="9" y="13" width="2" height="1" fill="#3d7234"/>
    <rect x="3" y="14" width="1" height="1" fill="#4a8838"/>
    <rect x="4" y="14" width="5" height="1" fill="#3d7234"/>
  </svg>`,

  // Diagonal layout matching Minecraft's bow item sprite.
  bow: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="11" y="1" width="1" height="1" fill="#493615"/>
    <rect x="12" y="1" width="1" height="1" fill="#493615"/>
    <rect x="13" y="1" width="1" height="1" fill="#493615"/>
    <rect x="14" y="1" width="1" height="1" fill="#493615"/>
    <rect x="8" y="2" width="1" height="1" fill="#493615"/>
    <rect x="9" y="2" width="1" height="1" fill="#493615"/>
    <rect x="10" y="2" width="1" height="1" fill="#493615"/>
    <rect x="11" y="2" width="1" height="1" fill="#896727"/>
    <rect x="12" y="2" width="1" height="1" fill="#684e1e"/>
    <rect x="13" y="2" width="1" height="1" fill="#684e1e"/>
    <rect x="14" y="2" width="1" height="1" fill="#896727"/>
    <rect x="15" y="2" width="1" height="1" fill="#281e0b"/>
    <rect x="6" y="3" width="1" height="1" fill="#493615"/>
    <rect x="7" y="3" width="1" height="1" fill="#493615"/>
    <rect x="8" y="3" width="1" height="1" fill="#896727"/>
    <rect x="9" y="3" width="1" height="1" fill="#684e1e"/>
    <rect x="10" y="3" width="1" height="1" fill="#896727"/>
    <rect x="11" y="3" width="1" height="1" fill="#281e0b"/>
    <rect x="12" y="3" width="1" height="1" fill="#281e0b"/>
    <rect x="13" y="3" width="1" height="1" fill="#281e0b"/>
    <rect x="14" y="3" width="1" height="1" fill="#281e0b"/>
    <rect x="5" y="4" width="1" height="1" fill="#493615"/>
    <rect x="6" y="4" width="1" height="1" fill="#6b6b6b"/>
    <rect x="7" y="4" width="1" height="1" fill="#684e1e"/>
    <rect x="8" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="9" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="10" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="13" y="4" width="1" height="1" fill="#444444"/>
    <rect x="4" y="5" width="1" height="1" fill="#493615"/>
    <rect x="5" y="5" width="1" height="1" fill="#6b6b6b"/>
    <rect x="6" y="5" width="1" height="1" fill="#969696"/>
    <rect x="7" y="5" width="1" height="1" fill="#6b6b6b"/>
    <rect x="12" y="5" width="1" height="1" fill="#444444"/>
    <rect x="3" y="6" width="1" height="1" fill="#493615"/>
    <rect x="4" y="6" width="1" height="1" fill="#6b6b6b"/>
    <rect x="5" y="6" width="1" height="1" fill="#969696"/>
    <rect x="6" y="6" width="1" height="1" fill="#6b6b6b"/>
    <rect x="11" y="6" width="1" height="1" fill="#444444"/>
    <rect x="3" y="7" width="1" height="1" fill="#493615"/>
    <rect x="4" y="7" width="1" height="1" fill="#684e1e"/>
    <rect x="5" y="7" width="1" height="1" fill="#6b6b6b"/>
    <rect x="10" y="7" width="1" height="1" fill="#444444"/>
    <rect x="2" y="8" width="1" height="1" fill="#493615"/>
    <rect x="3" y="8" width="1" height="1" fill="#896727"/>
    <rect x="4" y="8" width="1" height="1" fill="#281e0b"/>
    <rect x="9" y="8" width="1" height="1" fill="#444444"/>
    <rect x="2" y="9" width="1" height="1" fill="#493615"/>
    <rect x="3" y="9" width="1" height="1" fill="#684e1e"/>
    <rect x="4" y="9" width="1" height="1" fill="#281e0b"/>
    <rect x="8" y="9" width="1" height="1" fill="#444444"/>
    <rect x="2" y="10" width="1" height="1" fill="#493615"/>
    <rect x="3" y="10" width="1" height="1" fill="#896727"/>
    <rect x="4" y="10" width="1" height="1" fill="#281e0b"/>
    <rect x="7" y="10" width="1" height="1" fill="#444444"/>
    <rect x="1" y="11" width="1" height="1" fill="#493615"/>
    <rect x="2" y="11" width="1" height="1" fill="#896727"/>
    <rect x="3" y="11" width="1" height="1" fill="#281e0b"/>
    <rect x="6" y="11" width="1" height="1" fill="#444444"/>
    <rect x="1" y="12" width="1" height="1" fill="#493615"/>
    <rect x="2" y="12" width="1" height="1" fill="#684e1e"/>
    <rect x="3" y="12" width="1" height="1" fill="#281e0b"/>
    <rect x="5" y="12" width="1" height="1" fill="#444444"/>
    <rect x="1" y="13" width="1" height="1" fill="#493615"/>
    <rect x="2" y="13" width="1" height="1" fill="#684e1e"/>
    <rect x="3" y="13" width="1" height="1" fill="#281e0b"/>
    <rect x="4" y="13" width="1" height="1" fill="#444444"/>
    <rect x="1" y="14" width="1" height="1" fill="#493615"/>
    <rect x="2" y="14" width="1" height="1" fill="#896727"/>
    <rect x="3" y="14" width="1" height="1" fill="#281e0b"/>
    <rect x="2" y="15" width="1" height="1" fill="#281e0b"/>
  </svg>`,

  arrow: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="13" y="1" width="1" height="1" fill="#8a8a82"/>
    <rect x="12" y="2" width="2" height="1" fill="#a8a49c"/>
    <rect x="11" y="3" width="3" height="1" fill="#5a5a54"/>
    <rect x="12" y="4" width="2" height="1" fill="#8a8a82"/>
    <rect x="13" y="5" width="1" height="1" fill="#5a5a54"/>
    <rect x="10" y="4" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="5" width="1" height="1" fill="#b88858"/>
    <rect x="10" y="5" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="6" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="7" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="8" width="1" height="1" fill="#9a6d42"/>
    <rect x="7" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="9" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="9" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="10" width="1" height="1" fill="#d8d4cc"/>
    <rect x="5" y="10" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="10" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="11" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="11" width="1" height="1" fill="#e8e4dc"/>
    <rect x="5" y="11" width="1" height="1" fill="#d8d4cc"/>
    <rect x="1" y="11" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="12" width="1" height="1" fill="#d8d4cc"/>
    <rect x="3" y="12" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="12" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="13" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="13" width="1" height="1" fill="#8a8680"/>
  </svg>`,

  iron_arrow: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="13" y="1" width="1" height="1" fill="#ffffff"/>
    <rect x="12" y="2" width="2" height="1" fill="#f0ece4"/>
    <rect x="11" y="3" width="3" height="1" fill="#d8d4cc"/>
    <rect x="12" y="4" width="2" height="1" fill="#b8b4ac"/>
    <rect x="13" y="5" width="1" height="1" fill="#6a6660"/>
    <rect x="10" y="4" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="5" width="1" height="1" fill="#b88858"/>
    <rect x="10" y="5" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="6" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="7" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="8" width="1" height="1" fill="#9a6d42"/>
    <rect x="7" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="9" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="9" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="10" width="1" height="1" fill="#d8d4cc"/>
    <rect x="5" y="10" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="10" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="11" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="11" width="1" height="1" fill="#e8e4dc"/>
    <rect x="5" y="11" width="1" height="1" fill="#d8d4cc"/>
    <rect x="1" y="11" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="12" width="1" height="1" fill="#d8d4cc"/>
    <rect x="3" y="12" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="12" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="13" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="13" width="1" height="1" fill="#8a8680"/>
  </svg>`,

  gold_arrow: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="13" y="1" width="1" height="1" fill="#ffe07a"/>
    <rect x="12" y="2" width="2" height="1" fill="#f0d060"/>
    <rect x="11" y="3" width="3" height="1" fill="#e8c84a"/>
    <rect x="12" y="4" width="2" height="1" fill="#c9a830"/>
    <rect x="13" y="5" width="1" height="1" fill="#a88820"/>
    <rect x="10" y="4" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="5" width="1" height="1" fill="#b88858"/>
    <rect x="10" y="5" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="6" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="7" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="8" width="1" height="1" fill="#9a6d42"/>
    <rect x="7" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="9" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="9" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="10" width="1" height="1" fill="#d8d4cc"/>
    <rect x="5" y="10" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="10" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="11" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="11" width="1" height="1" fill="#e8e4dc"/>
    <rect x="5" y="11" width="1" height="1" fill="#d8d4cc"/>
    <rect x="1" y="11" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="12" width="1" height="1" fill="#d8d4cc"/>
    <rect x="3" y="12" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="12" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="13" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="13" width="1" height="1" fill="#8a8680"/>
  </svg>`,

  diamond_arrow: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="13" y="1" width="1" height="1" fill="#e8fcff"/>
    <rect x="12" y="2" width="2" height="1" fill="#c8f8ff"/>
    <rect x="11" y="3" width="3" height="1" fill="#7ad8f0"/>
    <rect x="12" y="4" width="2" height="1" fill="#4ab8d0"/>
    <rect x="13" y="5" width="1" height="1" fill="#2a98b0"/>
    <rect x="10" y="4" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="5" width="1" height="1" fill="#b88858"/>
    <rect x="10" y="5" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="6" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="7" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="8" width="1" height="1" fill="#9a6d42"/>
    <rect x="7" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="9" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="9" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="10" width="1" height="1" fill="#d8d4cc"/>
    <rect x="5" y="10" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="10" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="11" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="11" width="1" height="1" fill="#e8e4dc"/>
    <rect x="5" y="11" width="1" height="1" fill="#d8d4cc"/>
    <rect x="1" y="11" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="12" width="1" height="1" fill="#d8d4cc"/>
    <rect x="3" y="12" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="12" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="13" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="13" width="1" height="1" fill="#8a8680"/>
  </svg>`,

  glowing_arrow: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#1a0808"/>
    <rect x="14" y="1" width="1" height="1" fill="#ff6644" opacity="0.45"/>
    <rect x="13" y="0" width="1" height="1" fill="#ff3300" opacity="0.35"/>
    <rect x="15" y="2" width="1" height="1" fill="#ff3300" opacity="0.3"/>
    <rect x="13" y="1" width="1" height="1" fill="#ffaa88"/>
    <rect x="12" y="2" width="2" height="1" fill="#ff6644"/>
    <rect x="11" y="3" width="3" height="1" fill="#ff3300"/>
    <rect x="12" y="4" width="2" height="1" fill="#cc1818"/>
    <rect x="13" y="5" width="1" height="1" fill="#ff6644"/>
    <rect x="10" y="4" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="5" width="1" height="1" fill="#b88858"/>
    <rect x="10" y="5" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="6" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="7" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="8" width="1" height="1" fill="#9a6d42"/>
    <rect x="7" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="9" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="9" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="10" width="1" height="1" fill="#d8d4cc"/>
    <rect x="5" y="10" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="10" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="11" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="11" width="1" height="1" fill="#e8e4dc"/>
    <rect x="5" y="11" width="1" height="1" fill="#d8d4cc"/>
    <rect x="1" y="11" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="12" width="1" height="1" fill="#d8d4cc"/>
    <rect x="3" y="12" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="12" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="13" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="13" width="1" height="1" fill="#8a8680"/>
  </svg>`,

  glowing_iron_arrow: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#1a0808"/>
    <rect x="14" y="1" width="1" height="1" fill="#ff6644" opacity="0.45"/>
    <rect x="13" y="0" width="1" height="1" fill="#ff3300" opacity="0.35"/>
    <rect x="15" y="2" width="1" height="1" fill="#ff3300" opacity="0.3"/>
    <rect x="13" y="1" width="1" height="1" fill="#ffccaa"/>
    <rect x="12" y="2" width="2" height="1" fill="#ffaa88"/>
    <rect x="11" y="3" width="3" height="1" fill="#ff6644"/>
    <rect x="12" y="4" width="2" height="1" fill="#ff3300"/>
    <rect x="13" y="5" width="1" height="1" fill="#cc1818"/>
    <rect x="10" y="4" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="5" width="1" height="1" fill="#b88858"/>
    <rect x="10" y="5" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="6" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="7" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="8" width="1" height="1" fill="#9a6d42"/>
    <rect x="7" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="9" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="9" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="10" width="1" height="1" fill="#d8d4cc"/>
    <rect x="5" y="10" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="10" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="11" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="11" width="1" height="1" fill="#e8e4dc"/>
    <rect x="5" y="11" width="1" height="1" fill="#d8d4cc"/>
    <rect x="1" y="11" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="12" width="1" height="1" fill="#d8d4cc"/>
    <rect x="3" y="12" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="12" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="13" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="13" width="1" height="1" fill="#8a8680"/>
  </svg>`,

  glowing_gold_arrow: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#1a0808"/>
    <rect x="14" y="1" width="1" height="1" fill="#ff6644" opacity="0.45"/>
    <rect x="13" y="0" width="1" height="1" fill="#ffaa44" opacity="0.4"/>
    <rect x="15" y="2" width="1" height="1" fill="#ff3300" opacity="0.3"/>
    <rect x="13" y="1" width="1" height="1" fill="#ffe07a"/>
    <rect x="12" y="2" width="2" height="1" fill="#ffcc66"/>
    <rect x="11" y="3" width="3" height="1" fill="#ff9944"/>
    <rect x="12" y="4" width="2" height="1" fill="#ff6644"/>
    <rect x="13" y="5" width="1" height="1" fill="#e8c84a"/>
    <rect x="10" y="4" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="5" width="1" height="1" fill="#b88858"/>
    <rect x="10" y="5" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="6" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="7" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="8" width="1" height="1" fill="#9a6d42"/>
    <rect x="7" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="9" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="9" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="10" width="1" height="1" fill="#d8d4cc"/>
    <rect x="5" y="10" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="10" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="11" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="11" width="1" height="1" fill="#e8e4dc"/>
    <rect x="5" y="11" width="1" height="1" fill="#d8d4cc"/>
    <rect x="1" y="11" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="12" width="1" height="1" fill="#d8d4cc"/>
    <rect x="3" y="12" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="12" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="13" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="13" width="1" height="1" fill="#8a8680"/>
  </svg>`,

  glowing_diamond_arrow: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#1a0808"/>
    <rect x="14" y="1" width="1" height="1" fill="#ff6644" opacity="0.45"/>
    <rect x="13" y="0" width="1" height="1" fill="#ffaa88" opacity="0.35"/>
    <rect x="15" y="2" width="1" height="1" fill="#7ad8f0" opacity="0.35"/>
    <rect x="13" y="1" width="1" height="1" fill="#ffccaa"/>
    <rect x="12" y="2" width="2" height="1" fill="#ffaa88"/>
    <rect x="11" y="3" width="3" height="1" fill="#ff6644"/>
    <rect x="12" y="3" width="1" height="1" fill="#c8f8ff"/>
    <rect x="12" y="4" width="2" height="1" fill="#ff3300"/>
    <rect x="13" y="5" width="1" height="1" fill="#7ad8f0"/>
    <rect x="10" y="4" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="5" width="1" height="1" fill="#b88858"/>
    <rect x="10" y="5" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="6" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="7" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="8" width="1" height="1" fill="#9a6d42"/>
    <rect x="7" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="9" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="9" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="10" width="1" height="1" fill="#d8d4cc"/>
    <rect x="5" y="10" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="10" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="11" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="11" width="1" height="1" fill="#e8e4dc"/>
    <rect x="5" y="11" width="1" height="1" fill="#d8d4cc"/>
    <rect x="1" y="11" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="12" width="1" height="1" fill="#d8d4cc"/>
    <rect x="3" y="12" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="12" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="13" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="13" width="1" height="1" fill="#8a8680"/>
  </svg>`,

  healing_gold_arrow: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#1a1028"/>
    <rect x="13" y="1" width="1" height="1" fill="#e9d5ff"/>
    <rect x="12" y="2" width="2" height="1" fill="#c084fc"/>
    <rect x="11" y="3" width="3" height="1" fill="#a855f7"/>
    <rect x="12" y="4" width="2" height="1" fill="#e8c84a"/>
    <rect x="13" y="5" width="1" height="1" fill="#c9a830"/>
    <rect x="10" y="4" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="5" width="1" height="1" fill="#b88858"/>
    <rect x="10" y="5" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="6" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="7" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="8" width="1" height="1" fill="#9a6d42"/>
    <rect x="7" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="9" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="9" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="10" width="1" height="1" fill="#d8d4cc"/>
    <rect x="5" y="10" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="10" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="11" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="11" width="1" height="1" fill="#e8e4dc"/>
    <rect x="5" y="11" width="1" height="1" fill="#d8d4cc"/>
    <rect x="1" y="11" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="12" width="1" height="1" fill="#d8d4cc"/>
    <rect x="3" y="12" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="12" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="13" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="13" width="1" height="1" fill="#8a8680"/>
  </svg>`,

  glowing_healing_gold_arrow: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#1a1028"/>
    <rect x="14" y="1" width="1" height="1" fill="#c084fc" opacity="0.5"/>
    <rect x="13" y="0" width="1" height="1" fill="#e9d5ff" opacity="0.45"/>
    <rect x="15" y="2" width="1" height="1" fill="#7c3aed" opacity="0.35"/>
    <rect x="13" y="1" width="1" height="1" fill="#e9d5ff"/>
    <rect x="12" y="2" width="2" height="1" fill="#d8b4fe"/>
    <rect x="11" y="3" width="3" height="1" fill="#a855f7"/>
    <rect x="12" y="4" width="2" height="1" fill="#9333ea"/>
    <rect x="13" y="5" width="1" height="1" fill="#e8c84a"/>
    <rect x="10" y="4" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="5" width="1" height="1" fill="#b88858"/>
    <rect x="10" y="5" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="6" width="1" height="1" fill="#9a6d42"/>
    <rect x="9" y="6" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="7" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="6" y="8" width="1" height="1" fill="#9a6d42"/>
    <rect x="7" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="5" y="9" width="1" height="1" fill="#7a5030"/>
    <rect x="6" y="9" width="1" height="1" fill="#5c3a22"/>
    <rect x="3" y="9" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="10" width="1" height="1" fill="#d8d4cc"/>
    <rect x="5" y="10" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="10" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="11" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="11" width="1" height="1" fill="#e8e4dc"/>
    <rect x="5" y="11" width="1" height="1" fill="#d8d4cc"/>
    <rect x="1" y="11" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="12" width="1" height="1" fill="#d8d4cc"/>
    <rect x="3" y="12" width="1" height="1" fill="#f0ece4"/>
    <rect x="4" y="12" width="1" height="1" fill="#a8a49c"/>
    <rect x="2" y="13" width="1" height="1" fill="#c8c4bc"/>
    <rect x="3" y="13" width="1" height="1" fill="#8a8680"/>
  </svg>`,

  sapling: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="7" y="1" width="2" height="1" fill="#c8f090"/>
    <rect x="5" y="2" width="6" height="1" fill="#8fd868"/>
    <rect x="6" y="2" width="3" height="1" fill="#a8e878"/>
    <rect x="4" y="3" width="8" height="1" fill="#6db850"/>
    <rect x="5" y="3" width="3" height="1" fill="#a8e878"/>
    <rect x="8" y="3" width="1" height="1" fill="#3d7234"/>
    <rect x="3" y="4" width="10" height="1" fill="#58a042"/>
    <rect x="4" y="4" width="3" height="1" fill="#8fd868"/>
    <rect x="7" y="4" width="1" height="1" fill="#3d7234"/>
    <rect x="10" y="4" width="2" height="1" fill="#4a8838"/>
    <rect x="3" y="5" width="10" height="1" fill="#4a8838"/>
    <rect x="4" y="5" width="2" height="1" fill="#6db850"/>
    <rect x="6" y="5" width="1" height="1" fill="#3d7234"/>
    <rect x="7" y="5" width="2" height="1" fill="#58a042"/>
    <rect x="11" y="5" width="1" height="1" fill="#3d7234"/>
    <rect x="4" y="6" width="2" height="1" fill="#3d7234"/>
    <rect x="6" y="6" width="1" height="1" fill="#58a042"/>
    <rect x="7" y="6" width="2" height="1" fill="#7a5030"/>
    <rect x="9" y="6" width="1" height="1" fill="#4a8838"/>
    <rect x="10" y="6" width="2" height="1" fill="#3d7234"/>
    <rect x="5" y="7" width="1" height="1" fill="#3d7234"/>
    <rect x="7" y="7" width="2" height="1" fill="#6b4428"/>
    <rect x="10" y="7" width="1" height="1" fill="#3d7234"/>
    <rect x="7" y="8" width="1" height="1" fill="#9a6d42"/>
    <rect x="8" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="10" width="1" height="1" fill="#9a6d42"/>
    <rect x="8" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="11" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="6" y="12" width="4" height="1" fill="#5a4028"/>
    <rect x="7" y="12" width="2" height="1" fill="#8b6548"/>
    <rect x="5" y="13" width="6" height="1" fill="#76583a"/>
    <rect x="6" y="13" width="4" height="1" fill="#9a7350"/>
    <rect x="4" y="14" width="8" height="1" fill="#5a4028"/>
    <rect x="6" y="14" width="1" height="1" fill="#58a042" opacity="0.35"/>
    <rect x="9" y="14" width="1" height="1" fill="#4a8838" opacity="0.3"/>
  </svg>`,

  glowberry_sapling: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#1a1028"/>
    <rect x="7" y="1" width="2" height="1" fill="#c8f090"/>
    <rect x="5" y="2" width="6" height="1" fill="#8fd868"/>
    <rect x="6" y="2" width="3" height="1" fill="#a8e878"/>
    <rect x="4" y="3" width="8" height="1" fill="#6db850"/>
    <rect x="5" y="3" width="3" height="1" fill="#a8e878"/>
    <rect x="8" y="3" width="1" height="1" fill="#3d7234"/>
    <rect x="3" y="4" width="10" height="1" fill="#58a042"/>
    <rect x="4" y="4" width="3" height="1" fill="#8fd868"/>
    <rect x="7" y="4" width="1" height="1" fill="#3d7234"/>
    <rect x="10" y="4" width="2" height="1" fill="#4a8838"/>
    <rect x="3" y="5" width="10" height="1" fill="#4a8838"/>
    <rect x="4" y="5" width="2" height="1" fill="#6db850"/>
    <rect x="6" y="5" width="1" height="1" fill="#3d7234"/>
    <rect x="7" y="5" width="2" height="1" fill="#58a042"/>
    <rect x="11" y="5" width="1" height="1" fill="#3d7234"/>
    <rect x="2" y="3" width="1" height="1" fill="#9333ea"/>
    <rect x="2" y="4" width="1" height="1" fill="#a855f7"/>
    <rect x="3" y="3" width="1" height="1" fill="#e9d5ff"/>
    <rect x="3" y="4" width="1" height="1" fill="#c084fc"/>
    <rect x="12" y="3" width="1" height="1" fill="#e9d5ff"/>
    <rect x="13" y="3" width="1" height="1" fill="#a855f7"/>
    <rect x="12" y="4" width="1" height="1" fill="#c084fc"/>
    <rect x="13" y="4" width="1" height="1" fill="#9333ea"/>
    <rect x="4" y="6" width="2" height="1" fill="#3d7234"/>
    <rect x="6" y="6" width="1" height="1" fill="#58a042"/>
    <rect x="7" y="6" width="2" height="1" fill="#7a5030"/>
    <rect x="9" y="6" width="1" height="1" fill="#4a8838"/>
    <rect x="10" y="6" width="2" height="1" fill="#3d7234"/>
    <rect x="1" y="4" width="1" height="1" fill="#c084fc" opacity="0.4"/>
    <rect x="14" y="4" width="1" height="1" fill="#c084fc" opacity="0.4"/>
    <rect x="5" y="7" width="1" height="1" fill="#3d7234"/>
    <rect x="7" y="7" width="2" height="1" fill="#6b4428"/>
    <rect x="10" y="7" width="1" height="1" fill="#3d7234"/>
    <rect x="7" y="8" width="1" height="1" fill="#9a6d42"/>
    <rect x="8" y="8" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="9" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="9" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="10" width="1" height="1" fill="#9a6d42"/>
    <rect x="8" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="11" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="11" width="1" height="1" fill="#3a2210"/>
    <rect x="6" y="12" width="4" height="1" fill="#5a4028"/>
    <rect x="7" y="12" width="2" height="1" fill="#8b6548"/>
    <rect x="5" y="13" width="6" height="1" fill="#76583a"/>
    <rect x="6" y="13" width="4" height="1" fill="#9a7350"/>
    <rect x="4" y="14" width="8" height="1" fill="#5a4028"/>
    <rect x="6" y="14" width="1" height="1" fill="#a855f7" opacity="0.4"/>
    <rect x="9" y="14" width="1" height="1" fill="#c084fc" opacity="0.35"/>
  </svg>`,

  crystal_berries: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#1a1028"/>
    <polygon points="8,1 14,8 8,15 2,8" fill="#7c3aed"/>
    <polygon points="8,2 12,8 8,14 4,8" fill="#9333ea"/>
    <polygon points="8,3 10,8 8,13 6,8" fill="#a855f7"/>
    <polygon points="8,3 9,6 8,9 7,6" fill="#e9d5ff" opacity="0.55"/>
    <polygon points="8,1 10,4 8,5 6,4" fill="#c084fc" opacity="0.45"/>
  </svg>`,

  glowing_orb: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#1a0808"/>
    <circle cx="8" cy="8" r="6" fill="#cc1818" opacity="0.35"/>
    <circle cx="8" cy="8" r="4" fill="#ff3300"/>
    <circle cx="8" cy="8" r="2" fill="#ff6644"/>
    <rect x="6" y="4" width="2" height="2" fill="#ffaa88" opacity="0.7"/>
    <rect x="9" y="7" width="1" height="1" fill="#ffccaa" opacity="0.5"/>
  </svg>`,

  torch: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="7" y="2" width="2" height="1" fill="#ff3300"/>
    <rect x="6" y="3" width="1" height="1" fill="#cc1818"/>
    <rect x="7" y="3" width="1" height="1" fill="#ffaa88"/>
    <rect x="8" y="3" width="1" height="1" fill="#ff6644"/>
    <rect x="9" y="3" width="1" height="1" fill="#cc1818"/>
    <rect x="6" y="4" width="1" height="1" fill="#ff3300"/>
    <rect x="7" y="4" width="1" height="1" fill="#ffccaa"/>
    <rect x="8" y="4" width="1" height="1" fill="#ff6644"/>
    <rect x="9" y="4" width="1" height="1" fill="#ff3300"/>
    <rect x="6" y="5" width="4" height="1" fill="#ff3300"/>
    <rect x="7" y="6" width="2" height="1" fill="#ff6644"/>
    <rect x="7" y="7" width="1" height="1" fill="#ff3300"/>
    <rect x="8" y="7" width="1" height="1" fill="#cc1818"/>
    <rect x="7" y="8" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="8" width="1" height="1" fill="#7a5030"/>
    <rect x="7" y="9" width="1" height="1" fill="#9a6d42"/>
    <rect x="8" y="9" width="1" height="1" fill="#6b4428"/>
    <rect x="7" y="10" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="10" width="1" height="1" fill="#5c3a22"/>
    <rect x="7" y="11" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="11" width="1" height="1" fill="#6b4428"/>
    <rect x="7" y="12" width="1" height="1" fill="#9a6d42"/>
    <rect x="8" y="12" width="1" height="1" fill="#6b4428"/>
    <rect x="7" y="13" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="13" width="1" height="1" fill="#4a2e18"/>
    <rect x="7" y="14" width="1" height="1" fill="#b88858"/>
    <rect x="8" y="14" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="15" width="1" height="1" fill="#7a5030"/>
    <rect x="8" y="15" width="1" height="1" fill="#3a2210"/>
  </svg>`,

  chest: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="2" y="4" width="12" height="9" fill="#5c3a22"/>
    <rect x="2" y="4" width="12" height="3" fill="#6b4428"/>
    <rect x="2" y="7" width="12" height="1" fill="#3a2414"/>
    <rect x="2" y="4" width="1" height="9" fill="#4a2e18"/>
    <rect x="13" y="4" width="1" height="9" fill="#7a5030"/>
    <rect x="2" y="12" width="12" height="1" fill="#3a2414"/>
    <rect x="3" y="5" width="10" height="1" fill="#d4a82a"/>
    <rect x="3" y="9" width="10" height="1" fill="#d4a82a"/>
    <rect x="2" y="5" width="1" height="1" fill="#c49820"/>
    <rect x="13" y="5" width="1" height="1" fill="#e8c040"/>
    <rect x="2" y="9" width="1" height="1" fill="#c49820"/>
    <rect x="13" y="9" width="1" height="1" fill="#e8c040"/>
    <rect x="3" y="4" width="1" height="9" fill="#d4a82a"/>
    <rect x="12" y="4" width="1" height="9" fill="#d4a82a"/>
    <rect x="7" y="6" width="2" height="3" fill="#d4a82a"/>
    <rect x="7" y="7" width="2" height="1" fill="#3a2414"/>
    <rect x="4" y="8" width="2" height="1" fill="#9a6d42" opacity="0.5"/>
    <rect x="10" y="10" width="2" height="1" fill="#9a6d42" opacity="0.4"/>
  </svg>`,

  bed: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#142018"/>
    <rect x="1" y="3" width="1" height="11" fill="#4a2e18"/>
    <rect x="14" y="3" width="1" height="11" fill="#6b4428"/>
    <rect x="1" y="2" width="14" height="2" fill="#5c3a22"/>
    <rect x="2" y="1" width="12" height="1" fill="#4a2e18"/>
    <rect x="1" y="13" width="14" height="1" fill="#3a2414"/>
    <rect x="2" y="14" width="1" height="1" fill="#3a2210"/>
    <rect x="13" y="14" width="1" height="1" fill="#3a2210"/>
    <rect x="2" y="4" width="12" height="9" fill="#6db850"/>
    <rect x="2" y="4" width="12" height="1" fill="#8fd868"/>
    <rect x="2" y="12" width="12" height="1" fill="#4a8838"/>
    <rect x="3" y="5" width="4" height="2" fill="#b8e898"/>
    <rect x="3" y="5" width="4" height="1" fill="#d0f0b0"/>
    <rect x="7" y="8" width="6" height="3" fill="#4a8838"/>
    <rect x="7" y="8" width="6" height="1" fill="#3d7234"/>
    <rect x="2" y="4" width="1" height="9" fill="#4a8838"/>
    <rect x="13" y="4" width="1" height="9" fill="#8fd868"/>
  </svg>`,
}

/** Tip palette for nocked arrows on bow pull sprites (matches inventory arrow tips). */
function bowArrowTipColors(arrow: InventoryItem): [string, string, string] {
  switch (arrow) {
    case 'iron_arrow':
    case 'glowing_iron_arrow':
      return arrow.startsWith('glowing_')
        ? ['#ffaa88', '#ff6644', '#ff3300']
        : ['#ffffff', '#f0ece4', '#d8d4cc']
    case 'gold_arrow':
    case 'glowing_gold_arrow':
      return arrow.startsWith('glowing_')
        ? ['#ffcc88', '#ff8844', '#ff4400']
        : ['#ffe07a', '#f0d060', '#e8c84a']
    case 'diamond_arrow':
    case 'glowing_diamond_arrow':
      return arrow.startsWith('glowing_')
        ? ['#ffbb99', '#ff6644', '#ff2200']
        : ['#e8fcff', '#c8f8ff', '#7ad8f0']
    case 'healing_gold_arrow':
      return ['#e9d5ff', '#c084fc', '#e8c84a']
    case 'glowing_healing_gold_arrow':
      return ['#e9d5ff', '#a855f7', '#7c3aed']
    case 'glowing_arrow':
      return ['#ffaa88', '#ff6644', '#ff3300']
    default:
      return ['#ffffff', '#a8a49c', '#5a5a54']
  }
}

/**
 * Minecraft-style bow draw stages (idle is the normal `bow` icon).
 * Pixel-matched to vanilla bow_pulling_0 / bow_pulling_2 — tip points
 * upper-left with the shaft toward the string, same as Minecraft.
 */
const BOW_PULLING_TEMPLATES: readonly [string, string] = [
  // pulling_0 — light bend
  `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="1" y="0" width="1" height="1" fill="__TIP0__"/>
    <rect x="1" y="1" width="1" height="1" fill="__TIP2__"/>
    <rect x="2" y="1" width="1" height="1" fill="__TIP1__"/>
    <rect x="11" y="1" width="1" height="1" fill="#493615"/>
    <rect x="12" y="1" width="1" height="1" fill="#493615"/>
    <rect x="13" y="1" width="1" height="1" fill="#493615"/>
    <rect x="14" y="1" width="1" height="1" fill="#493615"/>
    <rect x="2" y="2" width="1" height="1" fill="#281e0b"/>
    <rect x="3" y="2" width="1" height="1" fill="#896727"/>
    <rect x="8" y="2" width="1" height="1" fill="#493615"/>
    <rect x="9" y="2" width="1" height="1" fill="#493615"/>
    <rect x="10" y="2" width="1" height="1" fill="#493615"/>
    <rect x="11" y="2" width="1" height="1" fill="#896727"/>
    <rect x="12" y="2" width="1" height="1" fill="#684e1e"/>
    <rect x="13" y="2" width="1" height="1" fill="#684e1e"/>
    <rect x="14" y="2" width="1" height="1" fill="#896727"/>
    <rect x="15" y="2" width="1" height="1" fill="#281e0b"/>
    <rect x="3" y="3" width="1" height="1" fill="#281e0b"/>
    <rect x="4" y="3" width="1" height="1" fill="#896727"/>
    <rect x="6" y="3" width="1" height="1" fill="#493615"/>
    <rect x="7" y="3" width="1" height="1" fill="#493615"/>
    <rect x="8" y="3" width="1" height="1" fill="#896727"/>
    <rect x="9" y="3" width="1" height="1" fill="#684e1e"/>
    <rect x="10" y="3" width="1" height="1" fill="#896727"/>
    <rect x="11" y="3" width="1" height="1" fill="#281e0b"/>
    <rect x="12" y="3" width="1" height="1" fill="#281e0b"/>
    <rect x="13" y="3" width="1" height="1" fill="#281e0b"/>
    <rect x="14" y="3" width="1" height="1" fill="#281e0b"/>
    <rect x="4" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="5" y="4" width="1" height="1" fill="#896727"/>
    <rect x="6" y="4" width="1" height="1" fill="#6b6b6b"/>
    <rect x="7" y="4" width="1" height="1" fill="#684e1e"/>
    <rect x="8" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="9" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="10" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="14" y="4" width="1" height="1" fill="#444444"/>
    <rect x="4" y="5" width="1" height="1" fill="#493615"/>
    <rect x="5" y="5" width="1" height="1" fill="#281e0b"/>
    <rect x="6" y="5" width="1" height="1" fill="#896727"/>
    <rect x="7" y="5" width="1" height="1" fill="#6b6b6b"/>
    <rect x="13" y="5" width="1" height="1" fill="#444444"/>
    <rect x="3" y="6" width="1" height="1" fill="#493615"/>
    <rect x="4" y="6" width="1" height="1" fill="#6b6b6b"/>
    <rect x="5" y="6" width="1" height="1" fill="#969696"/>
    <rect x="6" y="6" width="1" height="1" fill="#281e0b"/>
    <rect x="7" y="6" width="1" height="1" fill="#896727"/>
    <rect x="13" y="6" width="1" height="1" fill="#444444"/>
    <rect x="3" y="7" width="1" height="1" fill="#493615"/>
    <rect x="4" y="7" width="1" height="1" fill="#684e1e"/>
    <rect x="5" y="7" width="1" height="1" fill="#6b6b6b"/>
    <rect x="7" y="7" width="1" height="1" fill="#281e0b"/>
    <rect x="8" y="7" width="1" height="1" fill="#896727"/>
    <rect x="12" y="7" width="1" height="1" fill="#444444"/>
    <rect x="2" y="8" width="1" height="1" fill="#493615"/>
    <rect x="3" y="8" width="1" height="1" fill="#896727"/>
    <rect x="4" y="8" width="1" height="1" fill="#281e0b"/>
    <rect x="8" y="8" width="1" height="1" fill="#281e0b"/>
    <rect x="9" y="8" width="1" height="1" fill="#896727"/>
    <rect x="11" y="8" width="1" height="1" fill="#444444"/>
    <rect x="2" y="9" width="1" height="1" fill="#493615"/>
    <rect x="3" y="9" width="1" height="1" fill="#684e1e"/>
    <rect x="4" y="9" width="1" height="1" fill="#281e0b"/>
    <rect x="9" y="9" width="1" height="1" fill="#281e0b"/>
    <rect x="10" y="9" width="1" height="1" fill="#896727"/>
    <rect x="11" y="9" width="1" height="1" fill="#444444"/>
    <rect x="2" y="10" width="1" height="1" fill="#493615"/>
    <rect x="3" y="10" width="1" height="1" fill="#896727"/>
    <rect x="4" y="10" width="1" height="1" fill="#281e0b"/>
    <rect x="10" y="10" width="1" height="1" fill="#444444"/>
    <rect x="1" y="11" width="1" height="1" fill="#493615"/>
    <rect x="2" y="11" width="1" height="1" fill="#896727"/>
    <rect x="3" y="11" width="1" height="1" fill="#281e0b"/>
    <rect x="8" y="11" width="1" height="1" fill="#444444"/>
    <rect x="9" y="11" width="1" height="1" fill="#444444"/>
    <rect x="1" y="12" width="1" height="1" fill="#493615"/>
    <rect x="2" y="12" width="1" height="1" fill="#684e1e"/>
    <rect x="3" y="12" width="1" height="1" fill="#281e0b"/>
    <rect x="7" y="12" width="1" height="1" fill="#444444"/>
    <rect x="1" y="13" width="1" height="1" fill="#493615"/>
    <rect x="2" y="13" width="1" height="1" fill="#684e1e"/>
    <rect x="3" y="13" width="1" height="1" fill="#281e0b"/>
    <rect x="5" y="13" width="1" height="1" fill="#444444"/>
    <rect x="6" y="13" width="1" height="1" fill="#444444"/>
    <rect x="1" y="14" width="1" height="1" fill="#493615"/>
    <rect x="2" y="14" width="1" height="1" fill="#896727"/>
    <rect x="3" y="14" width="1" height="1" fill="#281e0b"/>
    <rect x="4" y="14" width="1" height="1" fill="#444444"/>
    <rect x="2" y="15" width="1" height="1" fill="#281e0b"/>
  </svg>`,
  // pulling_1 — full bend (vanilla pulling_2)
  `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="3" y="2" width="1" height="1" fill="__TIP0__"/>
    <rect x="8" y="2" width="1" height="1" fill="#493615"/>
    <rect x="9" y="2" width="1" height="1" fill="#493615"/>
    <rect x="10" y="2" width="1" height="1" fill="#493615"/>
    <rect x="11" y="2" width="1" height="1" fill="#493615"/>
    <rect x="12" y="2" width="1" height="1" fill="#493615"/>
    <rect x="13" y="2" width="1" height="1" fill="#493615"/>
    <rect x="14" y="2" width="1" height="1" fill="#493615"/>
    <rect x="3" y="3" width="1" height="1" fill="__TIP2__"/>
    <rect x="4" y="3" width="1" height="1" fill="__TIP1__"/>
    <rect x="6" y="3" width="1" height="1" fill="#493615"/>
    <rect x="7" y="3" width="1" height="1" fill="#493615"/>
    <rect x="8" y="3" width="1" height="1" fill="#896727"/>
    <rect x="9" y="3" width="1" height="1" fill="#684e1e"/>
    <rect x="10" y="3" width="1" height="1" fill="#896727"/>
    <rect x="11" y="3" width="1" height="1" fill="#896727"/>
    <rect x="12" y="3" width="1" height="1" fill="#896727"/>
    <rect x="13" y="3" width="1" height="1" fill="#684e1e"/>
    <rect x="14" y="3" width="1" height="1" fill="#896727"/>
    <rect x="15" y="3" width="1" height="1" fill="#281e0b"/>
    <rect x="4" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="5" y="4" width="1" height="1" fill="#896727"/>
    <rect x="6" y="4" width="1" height="1" fill="#6b6b6b"/>
    <rect x="7" y="4" width="1" height="1" fill="#684e1e"/>
    <rect x="8" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="9" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="10" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="11" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="12" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="13" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="14" y="4" width="1" height="1" fill="#281e0b"/>
    <rect x="4" y="5" width="1" height="1" fill="#493615"/>
    <rect x="5" y="5" width="1" height="1" fill="#281e0b"/>
    <rect x="6" y="5" width="1" height="1" fill="#896727"/>
    <rect x="7" y="5" width="1" height="1" fill="#6b6b6b"/>
    <rect x="14" y="5" width="1" height="1" fill="#444444"/>
    <rect x="3" y="6" width="1" height="1" fill="#493615"/>
    <rect x="4" y="6" width="1" height="1" fill="#6b6b6b"/>
    <rect x="5" y="6" width="1" height="1" fill="#969696"/>
    <rect x="6" y="6" width="1" height="1" fill="#281e0b"/>
    <rect x="7" y="6" width="1" height="1" fill="#896727"/>
    <rect x="14" y="6" width="1" height="1" fill="#444444"/>
    <rect x="3" y="7" width="1" height="1" fill="#493615"/>
    <rect x="4" y="7" width="1" height="1" fill="#684e1e"/>
    <rect x="5" y="7" width="1" height="1" fill="#6b6b6b"/>
    <rect x="7" y="7" width="1" height="1" fill="#281e0b"/>
    <rect x="8" y="7" width="1" height="1" fill="#896727"/>
    <rect x="13" y="7" width="1" height="1" fill="#444444"/>
    <rect x="2" y="8" width="1" height="1" fill="#493615"/>
    <rect x="3" y="8" width="1" height="1" fill="#896727"/>
    <rect x="4" y="8" width="1" height="1" fill="#281e0b"/>
    <rect x="8" y="8" width="1" height="1" fill="#281e0b"/>
    <rect x="9" y="8" width="1" height="1" fill="#896727"/>
    <rect x="13" y="8" width="1" height="1" fill="#444444"/>
    <rect x="2" y="9" width="1" height="1" fill="#493615"/>
    <rect x="3" y="9" width="1" height="1" fill="#684e1e"/>
    <rect x="4" y="9" width="1" height="1" fill="#281e0b"/>
    <rect x="9" y="9" width="1" height="1" fill="#281e0b"/>
    <rect x="10" y="9" width="1" height="1" fill="#896727"/>
    <rect x="13" y="9" width="1" height="1" fill="#444444"/>
    <rect x="2" y="10" width="1" height="1" fill="#493615"/>
    <rect x="3" y="10" width="1" height="1" fill="#896727"/>
    <rect x="4" y="10" width="1" height="1" fill="#281e0b"/>
    <rect x="10" y="10" width="1" height="1" fill="#281e0b"/>
    <rect x="11" y="10" width="1" height="1" fill="#896727"/>
    <rect x="13" y="10" width="1" height="1" fill="#444444"/>
    <rect x="2" y="11" width="1" height="1" fill="#493615"/>
    <rect x="3" y="11" width="1" height="1" fill="#896727"/>
    <rect x="4" y="11" width="1" height="1" fill="#281e0b"/>
    <rect x="11" y="11" width="1" height="1" fill="#281e0b"/>
    <rect x="12" y="11" width="1" height="1" fill="#896727"/>
    <rect x="2" y="12" width="1" height="1" fill="#493615"/>
    <rect x="3" y="12" width="1" height="1" fill="#896727"/>
    <rect x="4" y="12" width="1" height="1" fill="#281e0b"/>
    <rect x="11" y="12" width="1" height="1" fill="#444444"/>
    <rect x="2" y="13" width="1" height="1" fill="#493615"/>
    <rect x="3" y="13" width="1" height="1" fill="#684e1e"/>
    <rect x="4" y="13" width="1" height="1" fill="#281e0b"/>
    <rect x="7" y="13" width="1" height="1" fill="#444444"/>
    <rect x="8" y="13" width="1" height="1" fill="#444444"/>
    <rect x="9" y="13" width="1" height="1" fill="#444444"/>
    <rect x="10" y="13" width="1" height="1" fill="#444444"/>
    <rect x="2" y="14" width="1" height="1" fill="#493615"/>
    <rect x="3" y="14" width="1" height="1" fill="#896727"/>
    <rect x="4" y="14" width="1" height="1" fill="#281e0b"/>
    <rect x="5" y="14" width="1" height="1" fill="#444444"/>
    <rect x="6" y="14" width="1" height="1" fill="#444444"/>
    <rect x="3" y="15" width="1" height="1" fill="#281e0b"/>
  </svg>`,
]

/** Bow pull stage SVGs for the held viewmodel (0 = light, 1 = full). */
export function resolveBowPullingSvg(stage: 0 | 1, arrow: InventoryItem): string {
  const tips = bowArrowTipColors(arrow)
  return BOW_PULLING_TEMPLATES[stage]!
    .replaceAll('__TIP0__', tips[0])
    .replaceAll('__TIP1__', tips[1])
    .replaceAll('__TIP2__', tips[2])
}

/** Resolve the raw SVG markup used for an item icon (with tier fallbacks). */
export function resolveItemIconSvg(item: InventoryItem): string {
  return (
    ICONS[item] ??
    (item.startsWith('gold_')
      ? ICONS[item.replace('gold_', 'iron_') as InventoryItem]
      : undefined) ??
    (item.startsWith('diamond_')
      ? ICONS[item.replace('diamond_', 'iron_') as InventoryItem]
      : undefined) ??
    (item === 'gold' || item === 'diamond' ? ICONS.iron : undefined) ??
    ICONS.dirt ??
    ''
  )
}

export function itemIconMarkup(item: InventoryItem): string {
  const svg = resolveItemIconSvg(item)
  return `<span class="inventory-icon inventory-icon--${item}" aria-hidden="true">${svg}</span>`
}
