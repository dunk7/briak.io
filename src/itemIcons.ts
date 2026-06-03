import type { InventoryItem } from './inventory'

/** 16×16 pixel-art sprites with highlights and material reads. */
const ICONS: Record<InventoryItem, string> = {
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
    <rect x="13" y="1" width="2" height="1" fill="#f0f0e8"/>
    <rect x="15" y="1" width="1" height="1" fill="#5e5e58"/>
    <rect x="11" y="2" width="1" height="1" fill="#686860"/>
    <rect x="12" y="2" width="1" height="1" fill="#f0f0e8"/>
    <rect x="13" y="2" width="1" height="1" fill="#d0d0c8"/>
    <rect x="14" y="2" width="1" height="1" fill="#f0f0e8"/>
    <rect x="15" y="2" width="1" height="1" fill="#5e5e58"/>
    <rect x="10" y="3" width="1" height="1" fill="#686860"/>
    <rect x="11" y="3" width="1" height="1" fill="#f0f0e8"/>
    <rect x="12" y="3" width="1" height="1" fill="#d0d0c8"/>
    <rect x="13" y="3" width="1" height="1" fill="#f0f0e8"/>
    <rect x="14" y="3" width="1" height="1" fill="#5e5e58"/>
    <rect x="9" y="4" width="1" height="1" fill="#686860"/>
    <rect x="10" y="4" width="1" height="1" fill="#f0f0e8"/>
    <rect x="11" y="4" width="1" height="1" fill="#d0d0c8"/>
    <rect x="12" y="4" width="1" height="1" fill="#e8e8e0"/>
    <rect x="13" y="4" width="1" height="1" fill="#5e5e58"/>
    <rect x="8" y="5" width="1" height="1" fill="#686860"/>
    <rect x="9" y="5" width="1" height="1" fill="#f0f0e8"/>
    <rect x="10" y="5" width="1" height="1" fill="#d0d0c8"/>
    <rect x="11" y="5" width="1" height="1" fill="#e8e8e0"/>
    <rect x="12" y="5" width="1" height="1" fill="#5e5e58"/>
    <rect x="2" y="6" width="2" height="1" fill="#686860"/>
    <rect x="7" y="6" width="1" height="1" fill="#686860"/>
    <rect x="8" y="6" width="1" height="1" fill="#e8e8e0"/>
    <rect x="9" y="6" width="1" height="1" fill="#d0d0c8"/>
    <rect x="10" y="6" width="1" height="1" fill="#e8e8e0"/>
    <rect x="11" y="6" width="1" height="1" fill="#5e5e58"/>
    <rect x="2" y="7" width="3" height="1" fill="#686860"/>
    <rect x="6" y="7" width="1" height="1" fill="#686860"/>
    <rect x="7" y="7" width="1" height="1" fill="#e8e8e0"/>
    <rect x="8" y="7" width="1" height="1" fill="#d0d0c8"/>
    <rect x="9" y="7" width="1" height="1" fill="#e8e8e0"/>
    <rect x="10" y="7" width="1" height="1" fill="#5e5e58"/>
    <rect x="3" y="8" width="1" height="1" fill="#686860"/>
    <rect x="4" y="8" width="1" height="1" fill="#b0b0a8"/>
    <rect x="5" y="8" width="1" height="1" fill="#5e5e58"/>
    <rect x="6" y="8" width="1" height="1" fill="#e8e8e0"/>
    <rect x="7" y="8" width="1" height="1" fill="#b0b0a8"/>
    <rect x="8" y="8" width="1" height="1" fill="#e8e8e0"/>
    <rect x="9" y="8" width="1" height="1" fill="#5e5e58"/>
    <rect x="3" y="9" width="1" height="1" fill="#686860"/>
    <rect x="4" y="9" width="2" height="1" fill="#b0b0a8"/>
    <rect x="6" y="9" width="1" height="1" fill="#686860"/>
    <rect x="7" y="9" width="1" height="1" fill="#e8e8e0"/>
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
    <rect x="9" y="2" width="2" height="1" fill="#f0f0e8"/>
    <rect x="11" y="2" width="1" height="1" fill="#686860"/>
    <rect x="7" y="3" width="1" height="1" fill="#686860"/>
    <rect x="8" y="3" width="1" height="1" fill="#f0f0e8"/>
    <rect x="9" y="3" width="1" height="1" fill="#c8c8c0"/>
    <rect x="10" y="3" width="1" height="1" fill="#e8e8e0"/>
    <rect x="11" y="3" width="1" height="1" fill="#686860"/>
    <rect x="6" y="4" width="1" height="1" fill="#686860"/>
    <rect x="7" y="4" width="1" height="1" fill="#f0f0e8"/>
    <rect x="8" y="4" width="3" height="1" fill="#c8c8c0"/>
    <rect x="11" y="4" width="1" height="1" fill="#5c3a22"/>
    <rect x="12" y="4" width="1" height="1" fill="#6b4428"/>
    <rect x="6" y="5" width="1" height="1" fill="#5e5e58"/>
    <rect x="7" y="5" width="1" height="1" fill="#f0f0e8"/>
    <rect x="8" y="5" width="1" height="1" fill="#e8e8e0"/>
    <rect x="9" y="5" width="1" height="1" fill="#c8c8c0"/>
    <rect x="10" y="5" width="1" height="1" fill="#b0b0a8"/>
    <rect x="11" y="5" width="1" height="1" fill="#c8c8c0"/>
    <rect x="12" y="5" width="1" height="1" fill="#3a2210"/>
    <rect x="7" y="6" width="2" height="1" fill="#5e5e58"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#c8c8c0"/>
    <rect x="11" y="6" width="1" height="1" fill="#b0b0a8"/>
    <rect x="12" y="6" width="1" height="1" fill="#c8c8c0"/>
    <rect x="13" y="6" width="1" height="1" fill="#5e5e58"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#6b4428"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="7" width="2" height="1" fill="#c8c8c0"/>
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
    <rect x="11" y="3" width="2" height="1" fill="#f0f0e8"/>
    <rect x="13" y="3" width="1" height="1" fill="#c8c8c0"/>
    <rect x="14" y="3" width="1" height="1" fill="#5e5e58"/>
    <rect x="9" y="4" width="1" height="1" fill="#686860"/>
    <rect x="10" y="4" width="1" height="1" fill="#f0f0e8"/>
    <rect x="11" y="4" width="1" height="1" fill="#e8e8e0"/>
    <rect x="12" y="4" width="1" height="1" fill="#c8c8c0"/>
    <rect x="13" y="4" width="1" height="1" fill="#f0f0e8"/>
    <rect x="14" y="4" width="1" height="1" fill="#5e5e58"/>
    <rect x="8" y="5" width="1" height="1" fill="#686860"/>
    <rect x="9" y="5" width="1" height="1" fill="#f0f0e8"/>
    <rect x="10" y="5" width="1" height="1" fill="#e8e8e0"/>
    <rect x="11" y="5" width="1" height="1" fill="#c8c8c0"/>
    <rect x="12" y="5" width="1" height="1" fill="#e8e8e0"/>
    <rect x="13" y="5" width="1" height="1" fill="#f0f0e8"/>
    <rect x="14" y="5" width="1" height="1" fill="#5e5e58"/>
    <rect x="9" y="6" width="1" height="1" fill="#5c3a22"/>
    <rect x="10" y="6" width="1" height="1" fill="#c8c8c0"/>
    <rect x="11" y="6" width="1" height="1" fill="#e8e8e0"/>
    <rect x="12" y="6" width="1" height="1" fill="#f0f0e8"/>
    <rect x="13" y="6" width="1" height="1" fill="#5e5e58"/>
    <rect x="8" y="7" width="1" height="1" fill="#5c3a22"/>
    <rect x="9" y="7" width="1" height="1" fill="#7a5030"/>
    <rect x="10" y="7" width="1" height="1" fill="#3a2210"/>
    <rect x="11" y="7" width="1" height="1" fill="#f0f0e8"/>
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
    <rect x="6" y="3" width="1" height="1" fill="#f0f0e8"/>
    <rect x="7" y="3" width="1" height="1" fill="#e8e8e0"/>
    <rect x="8" y="3" width="2" height="1" fill="#c8c8c0"/>
    <rect x="10" y="3" width="1" height="1" fill="#e8e8e0"/>
    <rect x="11" y="3" width="1" height="1" fill="#686860"/>
    <rect x="12" y="3" width="2" height="1" fill="#6b4428"/>
    <rect x="6" y="4" width="1" height="1" fill="#686860"/>
    <rect x="7" y="4" width="3" height="1" fill="#5e5e58"/>
    <rect x="10" y="4" width="2" height="1" fill="#c8c8c0"/>
    <rect x="12" y="4" width="1" height="1" fill="#7a5030"/>
    <rect x="13" y="4" width="1" height="1" fill="#3a2210"/>
    <rect x="10" y="5" width="1" height="1" fill="#5c3a22"/>
    <rect x="11" y="5" width="2" height="1" fill="#e8e8e0"/>
    <rect x="13" y="5" width="1" height="1" fill="#5e5e58"/>
    <rect x="9" y="6" width="2" height="1" fill="#6b4428"/>
    <rect x="11" y="6" width="1" height="1" fill="#3a2210"/>
    <rect x="12" y="6" width="2" height="1" fill="#c8c8c0"/>
    <rect x="14" y="6" width="1" height="1" fill="#5e5e58"/>
    <rect x="8" y="7" width="3" height="1" fill="#5c3a22"/>
    <rect x="12" y="7" width="1" height="1" fill="#5e5e58"/>
    <rect x="13" y="7" width="1" height="1" fill="#c8c8c0"/>
    <rect x="14" y="7" width="1" height="1" fill="#5e5e58"/>
    <rect x="7" y="8" width="3" height="1" fill="#6b4428"/>
    <rect x="12" y="8" width="1" height="1" fill="#5e5e58"/>
    <rect x="13" y="8" width="1" height="1" fill="#c8c8c0"/>
    <rect x="14" y="8" width="1" height="1" fill="#5e5e58"/>
    <rect x="6" y="9" width="3" height="1" fill="#7a5030"/>
    <rect x="12" y="9" width="1" height="1" fill="#5e5e58"/>
    <rect x="13" y="9" width="1" height="1" fill="#e8e8e0"/>
    <rect x="14" y="9" width="1" height="1" fill="#5e5e58"/>
    <rect x="5" y="10" width="3" height="1" fill="#6b4428"/>
    <rect x="12" y="10" width="1" height="1" fill="#5e5e58"/>
    <rect x="13" y="10" width="1" height="1" fill="#f0f0e8"/>
    <rect x="14" y="10" width="1" height="1" fill="#5e5e58"/>
    <rect x="4" y="11" width="3" height="1" fill="#7a5030"/>
    <rect x="13" y="11" width="1" height="1" fill="#5e5e58"/>
    <rect x="3" y="12" width="3" height="1" fill="#6b4428"/>
    <rect x="2" y="13" width="3" height="1" fill="#7a5030"/>
    <rect x="2" y="14" width="2" height="1" fill="#3a2210"/>
  </svg>`,

  spear: `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="0" y="0" width="16" height="16" fill="#141820"/>
    <rect x="12" y="2" width="1" height="1" fill="#b0b0a8"/>
    <rect x="13" y="2" width="1" height="1" fill="#f0f0e8"/>
    <rect x="14" y="2" width="1" height="1" fill="#686860"/>
    <rect x="10" y="3" width="1" height="1" fill="#b0b0a8"/>
    <rect x="11" y="3" width="2" height="1" fill="#e8e8e0"/>
    <rect x="13" y="3" width="1" height="1" fill="#b0b0a8"/>
    <rect x="14" y="3" width="1" height="1" fill="#686860"/>
    <rect x="10" y="4" width="1" height="1" fill="#686860"/>
    <rect x="11" y="4" width="1" height="1" fill="#5c3a22"/>
    <rect x="12" y="4" width="1" height="1" fill="#e8e8e0"/>
    <rect x="13" y="4" width="1" height="1" fill="#686860"/>
    <rect x="10" y="5" width="1" height="1" fill="#5c3a22"/>
    <rect x="11" y="5" width="1" height="1" fill="#6b4428"/>
    <rect x="12" y="5" width="1" height="1" fill="#b0b0a8"/>
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
}

export function itemIconMarkup(item: InventoryItem): string {
  return `<span class="inventory-icon inventory-icon--${item}" aria-hidden="true">${ICONS[item]}</span>`
}
