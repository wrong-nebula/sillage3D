/** Terrestrial field library: original designed organisms, not canonical taxonomy.
 * Concept plates 08–16 are interpreted through editable organ grammars.
 * Ecological envelopes are art-directed; temperature °C, distances m, slope radians,
 * light/resource fractions 0–1. Height is the nominal adult target (organ bounds vary).
 * width is a height ratio. Sources refer to the read-only local scan catalog.
 */
import { SOURCE_FLORA_SPECIES } from './source-flora-catalog.js';
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const LAND_COLLECTIONS = freeze({
  "drylands": "Xeric frontiers",
  "woodlands": "Open crowns",
  "wetlands": "River margins",
  "alpine": "High stone gardens",
  "mineral": "Mineral provinces",
  "twilight": "Vesper understory",
  "comic-gardens": "Comic field studies",
  "giant-stands": "Giant stands"
});

export const LAND_FLORA_SPECIES = freeze({
  "jade-candelabra": {
    "name": "Jade candelabra",
    "genus": "Digitocereus",
    "collection": "drylands",
    "morphology": "candelabra",
    "studyPlate": "08A",
    "conceptPath": "../research/botanical-plates/terrestrial-drylands.png",
    "height": [
      2.4,
      5.8
    ],
    "width": [
      0.65,
      1.1
    ],
    "branches": [
      5,
      8
    ],
    "palette": {
      "base": "#9d7d7c",
      "body": "#789b78",
      "tip": "#bdc58d",
      "underside": "#6c968e",
      "accent": "#deb777"
    },
    "traits": {
      "flower": true,
      "curl": 0.05,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -7,
        48
      ],
      "moisture": [
        0.05,
        0.53
      ],
      "pH": [
        5.3,
        8.8
      ],
      "soilDepth": [
        0.06,
        2.5
      ],
      "lightMin": 0.2,
      "slopeMax": 0.9,
      "salinityMax": 0.4,
      "nutrientNeed": [
        0.12,
        0.17
      ],
      "metalTolerance": 0.45,
      "spacing": 6,
      "clusterRadius": 16,
      "dispersal": "animal",
      "bedrock": "any"
    },
    "night": {
      "mode": "night",
      "intensity": 0.55,
      "color": "#e1bc75",
      "opening": 0.035
    },
    "sourceReferences": [
      "arzach-epic-local-scan-014",
      "arzach-epic-local-scan-056",
      "moebius-005-local-scan-043"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": "Tips carry small amber light organs after dusk."
  },
  "ochre-water-bottle": {
    "name": "Ochre water bottle",
    "genus": "Ampullocaulis",
    "collection": "drylands",
    "morphology": "bottle",
    "studyPlate": "08B",
    "conceptPath": "../research/botanical-plates/terrestrial-drylands.png",
    "height": [
      3.8,
      8
    ],
    "width": [
      0.62,
      0.9
    ],
    "branches": [
      3,
      5
    ],
    "palette": {
      "base": "#b38e6b",
      "body": "#9aab83",
      "tip": "#d5c391",
      "underside": "#748c86",
      "accent": "#b96d52"
    },
    "traits": {
      "leafShape": "spear",
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -7,
        48
      ],
      "moisture": [
        0.05,
        0.53
      ],
      "pH": [
        5.3,
        8.8
      ],
      "soilDepth": [
        0.25,
        2.5
      ],
      "lightMin": 0.2,
      "slopeMax": 0.9,
      "salinityMax": 0.4,
      "nutrientNeed": [
        0.12,
        0.17
      ],
      "metalTolerance": 0.45,
      "spacing": 10,
      "clusterRadius": 16,
      "dispersal": "gravity",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-014",
      "arzach-epic-local-scan-056",
      "moebius-005-local-scan-043"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "coral-dune-rosette": {
    "name": "Coral dune rosette",
    "genus": "Spiralophylla",
    "collection": "drylands",
    "morphology": "rosette",
    "studyPlate": "08C",
    "conceptPath": "../research/botanical-plates/terrestrial-drylands.png",
    "height": [
      0.65,
      1.6
    ],
    "width": [
      1.3,
      2.2
    ],
    "branches": [
      12,
      19
    ],
    "palette": {
      "base": "#a57770",
      "body": "#cd9a84",
      "tip": "#e0b69a",
      "underside": "#a8b3a0",
      "accent": "#e4c899"
    },
    "traits": {
      "curl": 0.42,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -7,
        48
      ],
      "moisture": [
        0.05,
        0.53
      ],
      "pH": [
        5.3,
        8.8
      ],
      "soilDepth": [
        0.06,
        2.5
      ],
      "lightMin": 0.2,
      "slopeMax": 0.9,
      "salinityMax": 0.4,
      "nutrientNeed": [
        0.12,
        0.17
      ],
      "metalTolerance": 0.45,
      "spacing": 2.2,
      "clusterRadius": 16,
      "dispersal": "ballistic",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-014",
      "arzach-epic-local-scan-056",
      "moebius-005-local-scan-043"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "amber-needlegrass": {
    "name": "Amber needlegrass",
    "genus": "Aurostipa",
    "collection": "drylands",
    "morphology": "grass",
    "studyPlate": "08D",
    "conceptPath": "../research/botanical-plates/terrestrial-drylands.png",
    "height": [
      0.5,
      1.3
    ],
    "width": [
      0.6,
      1
    ],
    "branches": [
      11,
      18
    ],
    "palette": {
      "base": "#8f9171",
      "body": "#aeb99a",
      "tip": "#e4d5a5",
      "underside": "#819c99",
      "accent": "#d5ac6a"
    },
    "traits": {
      "flower": true,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -12,
        43
      ],
      "moisture": [
        0.05,
        0.53
      ],
      "pH": [
        5.3,
        8.8
      ],
      "soilDepth": [
        0.06,
        2.5
      ],
      "lightMin": 0.2,
      "slopeMax": 0.9,
      "salinityMax": 0.4,
      "nutrientNeed": [
        0.12,
        0.17
      ],
      "metalTolerance": 0.45,
      "spacing": 1.1,
      "clusterRadius": 17,
      "dispersal": "wind",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-014",
      "arzach-epic-local-scan-056",
      "moebius-005-local-scan-043"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "copper-wind-fan": {
    "name": "Copper wind fan",
    "genus": "Plicatifolia",
    "collection": "drylands",
    "morphology": "fan",
    "studyPlate": "08E",
    "conceptPath": "../research/botanical-plates/terrestrial-drylands.png",
    "height": [
      1.2,
      2.7
    ],
    "width": [
      1.1,
      1.6
    ],
    "branches": [
      3,
      5
    ],
    "palette": {
      "base": "#967b70",
      "body": "#91b2a2",
      "tip": "#c79779",
      "underside": "#7d9795",
      "accent": "#d5b789"
    },
    "traits": {
      "lobes": 7,
      "curl": 0.2,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -7,
        48
      ],
      "moisture": [
        0.05,
        0.53
      ],
      "pH": [
        5.3,
        8.8
      ],
      "soilDepth": [
        0.06,
        2.5
      ],
      "lightMin": 0.2,
      "slopeMax": 1.1,
      "salinityMax": 0.4,
      "nutrientNeed": [
        0.12,
        0.17
      ],
      "metalTolerance": 0.45,
      "spacing": 3,
      "clusterRadius": 16,
      "dispersal": "wind",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-014",
      "arzach-epic-local-scan-056",
      "moebius-005-local-scan-043"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "salt-pillow": {
    "name": "Salt pillow",
    "genus": "Pulvinella",
    "collection": "drylands",
    "morphology": "cushion",
    "studyPlate": "08F",
    "conceptPath": "../research/botanical-plates/terrestrial-drylands.png",
    "height": [
      0.16,
      0.45
    ],
    "width": [
      3,
      4.8
    ],
    "branches": [
      7,
      11
    ],
    "palette": {
      "base": "#aaa99a",
      "body": "#bcc6b7",
      "tip": "#e2ddc5",
      "underside": "#98b6b5",
      "accent": "#e2cc9b"
    },
    "traits": {
      "leafShape": "round",
      "flower": true,
      "roots": "buried",
      "runner": "buried-clonal"
    },
    "ecology": {
      "temperature": [
        -18,
        42
      ],
      "moisture": [
        0.05,
        0.65
      ],
      "pH": [
        6.4,
        9.4
      ],
      "soilDepth": [
        0.06,
        2.5
      ],
      "lightMin": 0.2,
      "slopeMax": 0.9,
      "salinityMax": 0.86,
      "nutrientNeed": [
        0.12,
        0.17
      ],
      "metalTolerance": 0.45,
      "spacing": 1.1,
      "clusterRadius": 16,
      "dispersal": "clonal",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-014",
      "arzach-epic-local-scan-056",
      "moebius-005-local-scan-043"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "meadow-crown": {
    "name": "Meadow crown",
    "genus": "Velocoma",
    "collection": "woodlands",
    "morphology": "canopy",
    "studyPlate": "09A",
    "conceptPath": "../research/botanical-plates/terrestrial-woodlands.png",
    "height": [
      7,
      15
    ],
    "width": [
      1.2,
      1.8
    ],
    "branches": [
      7,
      11
    ],
    "palette": {
      "base": "#9d7d7c",
      "body": "#789b78",
      "tip": "#bdc58d",
      "underside": "#6c968e",
      "accent": "#deb777"
    },
    "traits": {
      "leafShape": "round",
      "crownSpread": 0.85,
      "smallLeaves": true,
      "crownStyle": "compound",
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -8,
        33
      ],
      "moisture": [
        0.3,
        0.88
      ],
      "pH": [
        4.5,
        8.1
      ],
      "soilDepth": [
        0.2,
        3.5
      ],
      "lightMin": 0.16,
      "slopeMax": 0.85,
      "salinityMax": 0.24,
      "nutrientNeed": [
        0.25,
        0.26
      ],
      "metalTolerance": 0.38,
      "spacing": 13,
      "clusterRadius": 28,
      "dispersal": "animal",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "moebius-005-local-scan-015",
      "moebius-005-local-scan-017",
      "moebius-005-local-scan-036"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "ladder-fern": {
    "name": "Ladder fern",
    "genus": "Pectinopteris",
    "collection": "woodlands",
    "morphology": "fern",
    "studyPlate": "09B",
    "conceptPath": "../research/botanical-plates/terrestrial-woodlands.png",
    "height": [
      0.8,
      1.9
    ],
    "width": [
      1,
      1.5
    ],
    "branches": [
      5,
      8
    ],
    "palette": {
      "base": "#8c8871",
      "body": "#739985",
      "tip": "#b9c799",
      "underside": "#658985",
      "accent": "#dcba7e"
    },
    "traits": {
      "leafShape": "spear",
      "tiers": 8,
      "curl": 0.18,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -8,
        33
      ],
      "moisture": [
        0.3,
        0.88
      ],
      "pH": [
        4.5,
        8.1
      ],
      "soilDepth": [
        0.12,
        2.5
      ],
      "lightMin": 0.04,
      "slopeMax": 0.85,
      "salinityMax": 0.24,
      "nutrientNeed": [
        0.25,
        0.26
      ],
      "metalTolerance": 0.38,
      "spacing": 1.7,
      "clusterRadius": 28,
      "dispersal": "wind",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "moebius-005-local-scan-015",
      "moebius-005-local-scan-017",
      "moebius-005-local-scan-036"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "pale-grove-fan": {
    "name": "Pale grove fan",
    "genus": "Plicatifolia",
    "collection": "woodlands",
    "morphology": "fan",
    "studyPlate": "09C",
    "conceptPath": "../research/botanical-plates/terrestrial-woodlands.png",
    "height": [
      3.5,
      7.8
    ],
    "width": [
      0.8,
      1.2
    ],
    "branches": [
      5,
      7
    ],
    "palette": {
      "base": "#b9b49c",
      "body": "#a0b99a",
      "tip": "#c6ce9f",
      "underside": "#86a9a1",
      "accent": "#d7b471"
    },
    "traits": {
      "lobes": 9,
      "curl": 0.12,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -8,
        33
      ],
      "moisture": [
        0.3,
        0.88
      ],
      "pH": [
        4.5,
        8.1
      ],
      "soilDepth": [
        0.3,
        3
      ],
      "lightMin": 0.16,
      "slopeMax": 0.85,
      "salinityMax": 0.24,
      "nutrientNeed": [
        0.25,
        0.26
      ],
      "metalTolerance": 0.38,
      "spacing": 7,
      "clusterRadius": 28,
      "dispersal": "wind",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "moebius-005-local-scan-015",
      "moebius-005-local-scan-017",
      "moebius-005-local-scan-036"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "blue-needle-spire": {
    "name": "Blue needle spire",
    "genus": "Caerulopinus",
    "collection": "woodlands",
    "morphology": "spire",
    "studyPlate": "09D",
    "conceptPath": "../research/botanical-plates/terrestrial-woodlands.png",
    "height": [
      7,
      18
    ],
    "width": [
      0.4,
      0.7
    ],
    "branches": [
      5,
      8
    ],
    "palette": {
      "base": "#a5a0a5",
      "body": "#8fa7ad",
      "tip": "#c0c9b3",
      "underside": "#838da5",
      "accent": "#d6bf86"
    },
    "traits": {
      "leafShape": "ribbon",
      "tiers": 7,
      "curl": 0.2,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -20,
        24
      ],
      "moisture": [
        0.22,
        0.78
      ],
      "pH": [
        4.5,
        8.1
      ],
      "soilDepth": [
        0.2,
        3.5
      ],
      "lightMin": 0.16,
      "slopeMax": 0.85,
      "salinityMax": 0.24,
      "nutrientNeed": [
        0.25,
        0.26
      ],
      "metalTolerance": 0.38,
      "spacing": 10,
      "clusterRadius": 28,
      "dispersal": "wind",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "moebius-005-local-scan-015",
      "moebius-005-local-scan-017",
      "moebius-005-local-scan-036"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "honey-whorl": {
    "name": "Honey whorl",
    "genus": "Verticellata",
    "collection": "woodlands",
    "morphology": "whorl",
    "studyPlate": "09E",
    "conceptPath": "../research/botanical-plates/terrestrial-woodlands.png",
    "height": [
      1.2,
      3.4
    ],
    "width": [
      0.7,
      1.1
    ],
    "branches": [
      5,
      8
    ],
    "palette": {
      "base": "#ad956b",
      "body": "#a8b482",
      "tip": "#d9c48d",
      "underside": "#84a799",
      "accent": "#dbaa56"
    },
    "traits": {
      "leafShape": "round",
      "tiers": 5,
      "flower": true,
      "leavesPerNode": 2,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -8,
        33
      ],
      "moisture": [
        0.3,
        0.88
      ],
      "pH": [
        4.5,
        8.1
      ],
      "soilDepth": [
        0.2,
        3.5
      ],
      "lightMin": 0.08,
      "slopeMax": 0.85,
      "salinityMax": 0.24,
      "nutrientNeed": [
        0.25,
        0.26
      ],
      "metalTolerance": 0.38,
      "spacing": 3,
      "clusterRadius": 28,
      "dispersal": "animal",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "moebius-005-local-scan-015",
      "moebius-005-local-scan-017",
      "moebius-005-local-scan-036"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "looping-forest-runner": {
    "name": "Looping forest runner",
    "genus": "Arcovitis",
    "collection": "woodlands",
    "morphology": "vine",
    "studyPlate": "09F",
    "conceptPath": "../research/botanical-plates/terrestrial-woodlands.png",
    "height": [
      0.5,
      1.6
    ],
    "width": [
      2.3,
      3.4
    ],
    "branches": [
      7,
      11
    ],
    "palette": {
      "base": "#a499ac",
      "body": "#9bb89c",
      "tip": "#c9cba3",
      "underside": "#928fb0",
      "accent": "#dfc48b"
    },
    "traits": {
      "leafShape": "heart",
      "flower": true,
      "curl": 0.12,
      "roots": "buried",
      "runner": "surface-arch"
    },
    "ecology": {
      "temperature": [
        -8,
        33
      ],
      "moisture": [
        0.3,
        0.88
      ],
      "pH": [
        4.5,
        8.1
      ],
      "soilDepth": [
        0.2,
        3.5
      ],
      "lightMin": 0.035,
      "slopeMax": 0.85,
      "salinityMax": 0.24,
      "nutrientNeed": [
        0.25,
        0.26
      ],
      "metalTolerance": 0.38,
      "spacing": 3,
      "clusterRadius": 28,
      "dispersal": "clonal",
      "bedrock": "any"
    },
    "night": {
      "mode": "night",
      "intensity": 0,
      "color": "#c9d6bb",
      "opening": 0.08
    },
    "sourceReferences": [
      "moebius-005-local-scan-015",
      "moebius-005-local-scan-017",
      "moebius-005-local-scan-036"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": "Flower opening is represented by a gentle night posture change, without emission."
  },
  "floodplain-umbrella": {
    "name": "Floodplain umbrella",
    "genus": "Velocoma",
    "collection": "wetlands",
    "morphology": "canopy",
    "studyPlate": "10A",
    "conceptPath": "../research/botanical-plates/terrestrial-wetlands.png",
    "height": [
      5,
      12
    ],
    "width": [
      1.05,
      1.5
    ],
    "branches": [
      5,
      8
    ],
    "palette": {
      "base": "#b9b49c",
      "body": "#a0b99a",
      "tip": "#c6ce9f",
      "underside": "#86a9a1",
      "accent": "#d7b471"
    },
    "traits": {
      "leafShape": "lobed",
      "lobes": 6,
      "crownSpread": 1.2,
      "flower": true,
      "crownStyle": "umbrella",
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -5,
        36
      ],
      "moisture": [
        0.46,
        1
      ],
      "pH": [
        4.5,
        8.3
      ],
      "soilDepth": [
        0.6,
        4
      ],
      "lightMin": 0.09,
      "slopeMax": 0.65,
      "salinityMax": 0.28,
      "nutrientNeed": [
        0.25,
        0.24
      ],
      "metalTolerance": 0.4,
      "waterDistance": [
        0,
        190
      ],
      "spacing": 12,
      "clusterRadius": 18,
      "dispersal": "water",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "moebius-005-local-scan-021",
      "moebius-005-local-scan-031",
      "moebius-005-local-scan-037",
      "arzach-epic-local-scan-049"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "river-silk-reed": {
    "name": "River silk reed",
    "genus": "Aurostipa",
    "collection": "wetlands",
    "morphology": "grass",
    "studyPlate": "10B",
    "conceptPath": "../research/botanical-plates/terrestrial-wetlands.png",
    "height": [
      1.3,
      3.1
    ],
    "width": [
      0.45,
      0.8
    ],
    "branches": [
      13,
      21
    ],
    "palette": {
      "base": "#8f9171",
      "body": "#aeb99a",
      "tip": "#e4d5a5",
      "underside": "#819c99",
      "accent": "#d5ac6a"
    },
    "traits": {
      "flower": true,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -5,
        36
      ],
      "moisture": [
        0.38,
        0.97
      ],
      "pH": [
        4.5,
        8.3
      ],
      "soilDepth": [
        0.2,
        4
      ],
      "lightMin": 0.09,
      "slopeMax": 0.65,
      "salinityMax": 0.28,
      "nutrientNeed": [
        0.25,
        0.24
      ],
      "metalTolerance": 0.4,
      "waterDistance": [
        0,
        190
      ],
      "spacing": 1.5,
      "clusterRadius": 14,
      "dispersal": "water",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "moebius-005-local-scan-021",
      "moebius-005-local-scan-031",
      "moebius-005-local-scan-037",
      "arzach-epic-local-scan-049"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "saffron-rain-pitcher": {
    "name": "Saffron rain pitcher",
    "genus": "Calycivora",
    "collection": "wetlands",
    "morphology": "pitcher",
    "studyPlate": "10C",
    "conceptPath": "../research/botanical-plates/terrestrial-wetlands.png",
    "height": [
      0.65,
      1.65
    ],
    "width": [
      0.8,
      1.3
    ],
    "branches": [
      3,
      5
    ],
    "palette": {
      "base": "#a98963",
      "body": "#cbb06f",
      "tip": "#e0ca91",
      "underside": "#b79a9c",
      "accent": "#e0b66d"
    },
    "traits": {
      "lobes": 7,
      "curl": 0.15,
      "form": "trumpet",
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -5,
        36
      ],
      "moisture": [
        0.46,
        1
      ],
      "pH": [
        4.1,
        7.3
      ],
      "soilDepth": [
        0.2,
        4
      ],
      "lightMin": 0.09,
      "slopeMax": 0.65,
      "salinityMax": 0.28,
      "nutrientNeed": [
        0.08,
        0.13
      ],
      "metalTolerance": 0.4,
      "waterDistance": [
        0,
        190
      ],
      "spacing": 2,
      "clusterRadius": 18,
      "dispersal": "water",
      "bedrock": "any"
    },
    "night": {
      "mode": "night",
      "intensity": 0.72,
      "color": "#9ad8cb",
      "opening": 0.07
    },
    "sourceReferences": [
      "moebius-005-local-scan-021",
      "moebius-005-local-scan-031",
      "moebius-005-local-scan-037",
      "arzach-epic-local-scan-049"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": "Only the rim and nectar organs carry a subdued turquoise night light."
  },
  "oxbow-comb-fern": {
    "name": "Oxbow comb fern",
    "genus": "Pectinopteris",
    "collection": "wetlands",
    "morphology": "fern",
    "studyPlate": "10D",
    "conceptPath": "../research/botanical-plates/terrestrial-wetlands.png",
    "height": [
      1.2,
      2.5
    ],
    "width": [
      0.65,
      1
    ],
    "branches": [
      3,
      5
    ],
    "palette": {
      "base": "#8f9992",
      "body": "#88b0a6",
      "tip": "#c2cdb0",
      "underside": "#8c9fae",
      "accent": "#d3ba8e"
    },
    "traits": {
      "leafShape": "round",
      "tiers": 7,
      "curl": 0.5,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -5,
        36
      ],
      "moisture": [
        0.46,
        1
      ],
      "pH": [
        4.5,
        8.3
      ],
      "soilDepth": [
        0.2,
        4
      ],
      "lightMin": 0.035,
      "slopeMax": 0.65,
      "salinityMax": 0.28,
      "nutrientNeed": [
        0.25,
        0.24
      ],
      "metalTolerance": 0.4,
      "waterDistance": [
        0,
        190
      ],
      "spacing": 2.3,
      "clusterRadius": 18,
      "dispersal": "wind",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "moebius-005-local-scan-021",
      "moebius-005-local-scan-031",
      "moebius-005-local-scan-037",
      "arzach-epic-local-scan-049"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "lotus-ladder": {
    "name": "Lotus ladder",
    "genus": "Verticellata",
    "collection": "wetlands",
    "morphology": "whorl",
    "studyPlate": "10E",
    "conceptPath": "../research/botanical-plates/terrestrial-wetlands.png",
    "height": [
      1.4,
      3.2
    ],
    "width": [
      0.85,
      1.4
    ],
    "branches": [
      4,
      6
    ],
    "palette": {
      "base": "#ad956b",
      "body": "#a8b482",
      "tip": "#d9c48d",
      "underside": "#84a799",
      "accent": "#dbaa56"
    },
    "traits": {
      "leafShape": "round",
      "tiers": 4,
      "flower": true,
      "curl": 0.2,
      "form": "lotus",
      "leavesPerNode": 1,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -5,
        36
      ],
      "moisture": [
        0.46,
        1
      ],
      "pH": [
        4.5,
        8.3
      ],
      "soilDepth": [
        0.2,
        4
      ],
      "lightMin": 0.09,
      "slopeMax": 0.4,
      "salinityMax": 0.28,
      "nutrientNeed": [
        0.25,
        0.24
      ],
      "metalTolerance": 0.4,
      "waterDistance": [
        0,
        190
      ],
      "spacing": 2.8,
      "clusterRadius": 18,
      "dispersal": "water",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "moebius-005-local-scan-021",
      "moebius-005-local-scan-031",
      "moebius-005-local-scan-037",
      "arzach-epic-local-scan-049"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "bank-arc-vine": {
    "name": "Bank arc vine",
    "genus": "Arcovitis",
    "collection": "wetlands",
    "morphology": "vine",
    "studyPlate": "10F",
    "conceptPath": "../research/botanical-plates/terrestrial-wetlands.png",
    "height": [
      0.4,
      1.1
    ],
    "width": [
      2.8,
      4
    ],
    "branches": [
      9,
      14
    ],
    "palette": {
      "base": "#a08c89",
      "body": "#9cb29b",
      "tip": "#cecbaa",
      "underside": "#849e9a",
      "accent": "#be879d"
    },
    "traits": {
      "leafShape": "spear",
      "flower": true,
      "curl": 0.35,
      "roots": "eroded-bank",
      "runner": "surface-arch"
    },
    "ecology": {
      "temperature": [
        -5,
        36
      ],
      "moisture": [
        0.46,
        1
      ],
      "pH": [
        4.5,
        8.3
      ],
      "soilDepth": [
        0.2,
        4
      ],
      "lightMin": 0.09,
      "slopeMax": 1.05,
      "salinityMax": 0.28,
      "nutrientNeed": [
        0.25,
        0.24
      ],
      "metalTolerance": 0.4,
      "waterDistance": [
        0,
        190
      ],
      "spacing": 2.8,
      "clusterRadius": 18,
      "dispersal": "clonal",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "moebius-005-local-scan-021",
      "moebius-005-local-scan-031",
      "moebius-005-local-scan-037",
      "arzach-epic-local-scan-049"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "wind-combed-spire": {
    "name": "Wind-combed spire",
    "genus": "Caerulopinus",
    "collection": "alpine",
    "morphology": "spire",
    "studyPlate": "11A",
    "conceptPath": "../research/botanical-plates/terrestrial-alpine.png",
    "height": [
      2.3,
      6.8
    ],
    "width": [
      0.5,
      0.9
    ],
    "branches": [
      4,
      7
    ],
    "palette": {
      "base": "#a5a0a5",
      "body": "#8fa7ad",
      "tip": "#c0c9b3",
      "underside": "#838da5",
      "accent": "#d6bf86"
    },
    "traits": {
      "leafShape": "spear",
      "tiers": 5,
      "curl": 0.4,
      "roots": "rock-clasp",
      "runner": "none",
      "lean": 0.35,
      "windCombed": true
    },
    "ecology": {
      "temperature": [
        -27,
        16
      ],
      "moisture": [
        0.14,
        0.75
      ],
      "pH": [
        4.3,
        8.3
      ],
      "soilDepth": [
        0.025,
        1.8
      ],
      "lightMin": 0.12,
      "slopeMax": 1.2,
      "salinityMax": 0.26,
      "nutrientNeed": [
        0.1,
        0.12
      ],
      "metalTolerance": 0.45,
      "spacing": 7,
      "clusterRadius": 12,
      "dispersal": "wind",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-057",
      "arzach-epic-local-scan-071",
      "moebius-005-local-scan-042"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "snow-lace-cushion": {
    "name": "Snow lace cushion",
    "genus": "Pulvinella",
    "collection": "alpine",
    "morphology": "cushion",
    "studyPlate": "11B",
    "conceptPath": "../research/botanical-plates/terrestrial-alpine.png",
    "height": [
      0.12,
      0.36
    ],
    "width": [
      2.7,
      4.2
    ],
    "branches": [
      8,
      13
    ],
    "palette": {
      "base": "#aaa99a",
      "body": "#bcc6b7",
      "tip": "#e2ddc5",
      "underside": "#98b6b5",
      "accent": "#e2cc9b"
    },
    "traits": {
      "leafShape": "round",
      "flower": true,
      "roots": "buried",
      "runner": "buried-clonal"
    },
    "ecology": {
      "temperature": [
        -27,
        16
      ],
      "moisture": [
        0.18,
        0.8
      ],
      "pH": [
        4.3,
        8.3
      ],
      "soilDepth": [
        0.025,
        1.8
      ],
      "lightMin": 0.12,
      "slopeMax": 1.2,
      "salinityMax": 0.26,
      "nutrientNeed": [
        0.1,
        0.12
      ],
      "metalTolerance": 0.45,
      "spacing": 0.9,
      "clusterRadius": 12,
      "dispersal": "clonal",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-057",
      "arzach-epic-local-scan-071",
      "moebius-005-local-scan-042"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "silver-scree-rosette": {
    "name": "Silver scree rosette",
    "genus": "Spiralophylla",
    "collection": "alpine",
    "morphology": "rosette",
    "studyPlate": "11C",
    "conceptPath": "../research/botanical-plates/terrestrial-alpine.png",
    "height": [
      0.25,
      0.7
    ],
    "width": [
      1.4,
      2.2
    ],
    "branches": [
      8,
      13
    ],
    "palette": {
      "base": "#a5a59c",
      "body": "#b9c5bf",
      "tip": "#dfdec8",
      "underside": "#94a8b0",
      "accent": "#d6bd8e"
    },
    "traits": {
      "leafShape": "spear",
      "curl": 0.24,
      "flower": true,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -27,
        16
      ],
      "moisture": [
        0.14,
        0.75
      ],
      "pH": [
        4.3,
        8.3
      ],
      "soilDepth": [
        0.025,
        0.7
      ],
      "lightMin": 0.12,
      "slopeMax": 1.3,
      "salinityMax": 0.26,
      "nutrientNeed": [
        0.1,
        0.12
      ],
      "metalTolerance": 0.45,
      "spacing": 1.3,
      "clusterRadius": 12,
      "dispersal": "ballistic",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-057",
      "arzach-epic-local-scan-071",
      "moebius-005-local-scan-042"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "ridge-plume-grass": {
    "name": "Ridge plume grass",
    "genus": "Aurostipa",
    "collection": "alpine",
    "morphology": "grass",
    "studyPlate": "11D",
    "conceptPath": "../research/botanical-plates/terrestrial-alpine.png",
    "height": [
      0.3,
      0.8
    ],
    "width": [
      0.7,
      1.2
    ],
    "branches": [
      9,
      15
    ],
    "palette": {
      "base": "#8f9171",
      "body": "#aeb99a",
      "tip": "#e4d5a5",
      "underside": "#819c99",
      "accent": "#d5ac6a"
    },
    "traits": {
      "flower": true,
      "curl": 0.2,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -27,
        16
      ],
      "moisture": [
        0.14,
        0.75
      ],
      "pH": [
        4.3,
        8.3
      ],
      "soilDepth": [
        0.025,
        1.8
      ],
      "lightMin": 0.12,
      "slopeMax": 1.2,
      "salinityMax": 0.26,
      "nutrientNeed": [
        0.1,
        0.12
      ],
      "metalTolerance": 0.45,
      "spacing": 0.9,
      "clusterRadius": 12,
      "dispersal": "wind",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-057",
      "arzach-epic-local-scan-071",
      "moebius-005-local-scan-042"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "slate-pocket-fern": {
    "name": "Slate pocket fern",
    "genus": "Pectinopteris",
    "collection": "alpine",
    "morphology": "fern",
    "studyPlate": "11E",
    "conceptPath": "../research/botanical-plates/terrestrial-alpine.png",
    "height": [
      0.25,
      0.7
    ],
    "width": [
      0.9,
      1.5
    ],
    "branches": [
      3,
      5
    ],
    "palette": {
      "base": "#8f9992",
      "body": "#88b0a6",
      "tip": "#c2cdb0",
      "underside": "#8c9fae",
      "accent": "#d3ba8e"
    },
    "traits": {
      "leafShape": "round",
      "tiers": 5,
      "curl": 0.22,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -27,
        16
      ],
      "moisture": [
        0.3,
        0.8
      ],
      "pH": [
        4.3,
        8.3
      ],
      "soilDepth": [
        0.025,
        1.8
      ],
      "lightMin": 0.05,
      "slopeMax": 1.2,
      "salinityMax": 0.26,
      "nutrientNeed": [
        0.1,
        0.12
      ],
      "metalTolerance": 0.45,
      "spacing": 1,
      "clusterRadius": 12,
      "dispersal": "wind",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-057",
      "arzach-epic-local-scan-071",
      "moebius-005-local-scan-042"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "copper-cliff-fan": {
    "name": "Copper cliff fan",
    "genus": "Plicatifolia",
    "collection": "alpine",
    "morphology": "fan",
    "studyPlate": "11F",
    "conceptPath": "../research/botanical-plates/terrestrial-alpine.png",
    "height": [
      0.45,
      1.2
    ],
    "width": [
      1.2,
      1.7
    ],
    "branches": [
      2,
      4
    ],
    "palette": {
      "base": "#967b70",
      "body": "#91b2a2",
      "tip": "#c79779",
      "underside": "#7d9795",
      "accent": "#d5b789"
    },
    "traits": {
      "lobes": 5,
      "curl": 0.3,
      "roots": "rock-clasp",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -27,
        16
      ],
      "moisture": [
        0.14,
        0.75
      ],
      "pH": [
        4.3,
        8.3
      ],
      "soilDepth": [
        0.025,
        1
      ],
      "lightMin": 0.12,
      "slopeMax": 1.4,
      "salinityMax": 0.26,
      "nutrientNeed": [
        0.1,
        0.12
      ],
      "metalTolerance": 0.45,
      "spacing": 1.7,
      "clusterRadius": 12,
      "dispersal": "wind",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-057",
      "arzach-epic-local-scan-071",
      "moebius-005-local-scan-042"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "iron-antler": {
    "name": "Iron antler",
    "genus": "Digitocereus",
    "collection": "mineral",
    "morphology": "candelabra",
    "studyPlate": "12A",
    "conceptPath": "../research/botanical-plates/terrestrial-mineral.png",
    "height": [
      1.4,
      3.8
    ],
    "width": [
      0.8,
      1.3
    ],
    "branches": [
      6,
      10
    ],
    "palette": {
      "base": "#a97966",
      "body": "#b69b7a",
      "tip": "#d6bb8c",
      "underside": "#8e9a8e",
      "accent": "#d29c68"
    },
    "traits": {
      "curl": 0.12,
      "flower": true,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -15,
        46
      ],
      "moisture": [
        0.08,
        0.73
      ],
      "pH": [
        5,
        9.2
      ],
      "soilDepth": [
        0.025,
        2.2
      ],
      "lightMin": 0.13,
      "slopeMax": 1.05,
      "salinityMax": 0.65,
      "nutrientNeed": [
        0.08,
        0.13
      ],
      "metalTolerance": 0.94,
      "spacing": 4.5,
      "clusterRadius": 13,
      "dispersal": "ballistic",
      "bedrock": [
        "basalt",
        "sandstone"
      ]
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-022",
      "arzach-epic-local-scan-073",
      "airtight-garage-local-scan-017"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "chalk-reservoir": {
    "name": "Chalk reservoir",
    "genus": "Ampullocaulis",
    "collection": "mineral",
    "morphology": "bottle",
    "studyPlate": "12B",
    "conceptPath": "../research/botanical-plates/terrestrial-mineral.png",
    "height": [
      2.2,
      5.2
    ],
    "width": [
      0.7,
      1
    ],
    "branches": [
      3,
      6
    ],
    "palette": {
      "base": "#aaa99a",
      "body": "#bcc6b7",
      "tip": "#e2ddc5",
      "underside": "#98b6b5",
      "accent": "#e2cc9b"
    },
    "traits": {
      "leafShape": "round",
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -15,
        46
      ],
      "moisture": [
        0.08,
        0.73
      ],
      "pH": [
        7,
        9.4
      ],
      "soilDepth": [
        0.025,
        2.2
      ],
      "lightMin": 0.13,
      "slopeMax": 1.05,
      "salinityMax": 0.65,
      "nutrientNeed": [
        0.08,
        0.13
      ],
      "metalTolerance": 0.94,
      "spacing": 7,
      "clusterRadius": 13,
      "dispersal": "gravity",
      "bedrock": [
        "limestone",
        "evaporite"
      ]
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-022",
      "arzach-epic-local-scan-073",
      "airtight-garage-local-scan-017"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "basalt-spear": {
    "name": "Basalt spear",
    "genus": "Spiralophylla",
    "collection": "mineral",
    "morphology": "rosette",
    "studyPlate": "12C",
    "conceptPath": "../research/botanical-plates/terrestrial-mineral.png",
    "height": [
      0.8,
      1.7
    ],
    "width": [
      0.85,
      1.3
    ],
    "branches": [
      7,
      12
    ],
    "palette": {
      "base": "#8c8a91",
      "body": "#8b9da1",
      "tip": "#bac0ad",
      "underside": "#8c90a2",
      "accent": "#d5ad7a"
    },
    "traits": {
      "leafShape": "spear",
      "curl": 0.12,
      "roots": "buried",
      "runner": "none",
      "upright": true
    },
    "ecology": {
      "temperature": [
        -15,
        46
      ],
      "moisture": [
        0.08,
        0.73
      ],
      "pH": [
        4.7,
        7.5
      ],
      "soilDepth": [
        0.025,
        2.2
      ],
      "lightMin": 0.13,
      "slopeMax": 1.05,
      "salinityMax": 0.65,
      "nutrientNeed": [
        0.08,
        0.13
      ],
      "metalTolerance": 0.94,
      "spacing": 2,
      "clusterRadius": 13,
      "dispersal": "ballistic",
      "bedrock": [
        "basalt",
        "granite"
      ]
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-022",
      "arzach-epic-local-scan-073",
      "airtight-garage-local-scan-017"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "sulfur-fluted-cup": {
    "name": "Sulfur fluted cup",
    "genus": "Calycivora",
    "collection": "mineral",
    "morphology": "pitcher",
    "studyPlate": "12D",
    "conceptPath": "../research/botanical-plates/terrestrial-mineral.png",
    "height": [
      0.6,
      1.5
    ],
    "width": [
      1,
      1.5
    ],
    "branches": [
      3,
      6
    ],
    "palette": {
      "base": "#a98963",
      "body": "#cbb06f",
      "tip": "#e0ca91",
      "underside": "#b79a9c",
      "accent": "#e0b66d"
    },
    "traits": {
      "lobes": 10,
      "curl": 0.26,
      "form": "trumpet",
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -15,
        46
      ],
      "moisture": [
        0.08,
        0.73
      ],
      "pH": [
        5,
        9.2
      ],
      "soilDepth": [
        0.025,
        2.2
      ],
      "lightMin": 0.13,
      "slopeMax": 1.05,
      "salinityMax": 0.8,
      "nutrientNeed": [
        0.08,
        0.13
      ],
      "metalTolerance": 0.94,
      "spacing": 2.4,
      "clusterRadius": 13,
      "dispersal": "wind",
      "bedrock": [
        "basalt",
        "evaporite"
      ]
    },
    "night": {
      "mode": "night",
      "intensity": 0.48,
      "color": "#e5c17d",
      "opening": 0.04
    },
    "sourceReferences": [
      "arzach-epic-local-scan-022",
      "arzach-epic-local-scan-073",
      "airtight-garage-local-scan-017"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": "Small amber rim organs brighten after dusk; mineral tolerance is fictional."
  },
  "gypsum-bead-mat": {
    "name": "Gypsum bead mat",
    "genus": "Pulvinella",
    "collection": "mineral",
    "morphology": "cushion",
    "studyPlate": "12E",
    "conceptPath": "../research/botanical-plates/terrestrial-mineral.png",
    "height": [
      0.15,
      0.5
    ],
    "width": [
      3,
      4.7
    ],
    "branches": [
      7,
      12
    ],
    "palette": {
      "base": "#aaa99a",
      "body": "#bcc6b7",
      "tip": "#e2ddc5",
      "underside": "#98b6b5",
      "accent": "#e2cc9b"
    },
    "traits": {
      "leafShape": "round",
      "roots": "buried",
      "runner": "buried-clonal",
      "form": "beads"
    },
    "ecology": {
      "temperature": [
        -15,
        46
      ],
      "moisture": [
        0.08,
        0.73
      ],
      "pH": [
        6.5,
        9.4
      ],
      "soilDepth": [
        0.025,
        2.2
      ],
      "lightMin": 0.13,
      "slopeMax": 1.05,
      "salinityMax": 0.9,
      "nutrientNeed": [
        0.08,
        0.13
      ],
      "metalTolerance": 0.94,
      "spacing": 1.3,
      "clusterRadius": 13,
      "dispersal": "clonal",
      "bedrock": [
        "evaporite",
        "limestone"
      ]
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-022",
      "arzach-epic-local-scan-073",
      "airtight-garage-local-scan-017"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "ochre-coin-whorl": {
    "name": "Ochre coin whorl",
    "genus": "Verticellata",
    "collection": "mineral",
    "morphology": "whorl",
    "studyPlate": "12F",
    "conceptPath": "../research/botanical-plates/terrestrial-mineral.png",
    "height": [
      0.7,
      1.8
    ],
    "width": [
      0.7,
      1.2
    ],
    "branches": [
      4,
      7
    ],
    "palette": {
      "base": "#a97966",
      "body": "#b69b7a",
      "tip": "#d6bb8c",
      "underside": "#8e9a8e",
      "accent": "#d29c68"
    },
    "traits": {
      "leafShape": "round",
      "tiers": 5,
      "flower": true,
      "roots": "buried",
      "runner": "none",
      "leavesPerNode": 2
    },
    "ecology": {
      "temperature": [
        -15,
        46
      ],
      "moisture": [
        0.08,
        0.73
      ],
      "pH": [
        5,
        9.2
      ],
      "soilDepth": [
        0.025,
        2.2
      ],
      "lightMin": 0.13,
      "slopeMax": 1.05,
      "salinityMax": 0.65,
      "nutrientNeed": [
        0.08,
        0.13
      ],
      "metalTolerance": 0.94,
      "spacing": 2.1,
      "clusterRadius": 13,
      "dispersal": "animal",
      "bedrock": [
        "basalt",
        "sandstone",
        "limestone"
      ]
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "arzach-epic-local-scan-022",
      "arzach-epic-local-scan-073",
      "airtight-garage-local-scan-017"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "vesper-lantern-crown": {
    "name": "Vesper lantern crown",
    "genus": "Velocoma",
    "collection": "twilight",
    "morphology": "canopy",
    "studyPlate": "13A",
    "conceptPath": "../research/botanical-plates/terrestrial-twilight.png",
    "height": [
      6,
      13
    ],
    "width": [
      1,
      1.7
    ],
    "branches": [
      5,
      9
    ],
    "palette": {
      "base": "#a499ac",
      "body": "#9bb89c",
      "tip": "#c9cba3",
      "underside": "#928fb0",
      "accent": "#dfc48b"
    },
    "traits": {
      "leafShape": "heart",
      "flower": true,
      "crownSpread": 1.1,
      "crownStyle": "broad",
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -8,
        32
      ],
      "moisture": [
        0.4,
        0.96
      ],
      "pH": [
        4.5,
        8.1
      ],
      "soilDepth": [
        0.14,
        3.6
      ],
      "lightMin": 0.035,
      "slopeMax": 0.8,
      "salinityMax": 0.22,
      "nutrientNeed": [
        0.21,
        0.22
      ],
      "metalTolerance": 0.38,
      "spacing": 12,
      "clusterRadius": 24,
      "dispersal": "animal",
      "bedrock": "any"
    },
    "night": {
      "mode": "night",
      "intensity": 0.62,
      "color": "#dfc48b",
      "opening": 0.02
    },
    "sourceReferences": [
      "moebius-005-local-scan-026",
      "moebius-005-local-scan-028",
      "arzach-epic-local-scan-052",
      "airtight-garage-local-scan-113"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": "A few reproductive organs glow pale amber; foliage remains dark."
  },
  "indigo-tier-spire": {
    "name": "Indigo tier spire",
    "genus": "Caerulopinus",
    "collection": "twilight",
    "morphology": "spire",
    "studyPlate": "13B",
    "conceptPath": "../research/botanical-plates/terrestrial-twilight.png",
    "height": [
      5,
      11
    ],
    "width": [
      0.55,
      0.85
    ],
    "branches": [
      5,
      8
    ],
    "palette": {
      "base": "#a5a0a5",
      "body": "#8fa7ad",
      "tip": "#c0c9b3",
      "underside": "#838da5",
      "accent": "#d6bf86"
    },
    "traits": {
      "leafShape": "ribbon",
      "tiers": 8,
      "curl": 0.38,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -8,
        32
      ],
      "moisture": [
        0.4,
        0.96
      ],
      "pH": [
        4.5,
        8.1
      ],
      "soilDepth": [
        0.14,
        3.6
      ],
      "lightMin": 0.035,
      "slopeMax": 0.8,
      "salinityMax": 0.22,
      "nutrientNeed": [
        0.21,
        0.22
      ],
      "metalTolerance": 0.38,
      "spacing": 8,
      "clusterRadius": 24,
      "dispersal": "wind",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "moebius-005-local-scan-026",
      "moebius-005-local-scan-028",
      "arzach-epic-local-scan-052",
      "airtight-garage-local-scan-113"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "moon-water-bottle": {
    "name": "Moon water bottle",
    "genus": "Ampullocaulis",
    "collection": "twilight",
    "morphology": "bottle",
    "studyPlate": "13C",
    "conceptPath": "../research/botanical-plates/terrestrial-twilight.png",
    "height": [
      2.6,
      6
    ],
    "width": [
      0.75,
      1.1
    ],
    "branches": [
      4,
      6
    ],
    "palette": {
      "base": "#b9b49c",
      "body": "#a0b99a",
      "tip": "#c6ce9f",
      "underside": "#86a9a1",
      "accent": "#d7b471"
    },
    "traits": {
      "leafShape": "heart",
      "flower": false,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -8,
        32
      ],
      "moisture": [
        0.4,
        0.96
      ],
      "pH": [
        4.5,
        8.1
      ],
      "soilDepth": [
        0.3,
        3.5
      ],
      "lightMin": 0.035,
      "slopeMax": 0.8,
      "salinityMax": 0.22,
      "nutrientNeed": [
        0.21,
        0.22
      ],
      "metalTolerance": 0.38,
      "spacing": 7,
      "clusterRadius": 24,
      "dispersal": "animal",
      "bedrock": "any"
    },
    "night": {
      "mode": "none",
      "intensity": 0,
      "opening": 0,
      "color": "#b2dcbd"
    },
    "sourceReferences": [
      "moebius-005-local-scan-026",
      "moebius-005-local-scan-028",
      "arzach-epic-local-scan-052",
      "airtight-garage-local-scan-113"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": ""
  },
  "violet-dew-pitcher": {
    "name": "Violet dew pitcher",
    "genus": "Calycivora",
    "collection": "twilight",
    "morphology": "pitcher",
    "studyPlate": "13D",
    "conceptPath": "../research/botanical-plates/terrestrial-twilight.png",
    "height": [
      1,
      2.2
    ],
    "width": [
      0.8,
      1.2
    ],
    "branches": [
      4,
      6
    ],
    "palette": {
      "base": "#988aa4",
      "body": "#b0a3b4",
      "tip": "#d2b9bc",
      "underside": "#8b9baa",
      "accent": "#d5b595"
    },
    "traits": {
      "lobes": 8,
      "curl": 0.25,
      "roots": "buried",
      "runner": "none"
    },
    "ecology": {
      "temperature": [
        -8,
        32
      ],
      "moisture": [
        0.4,
        0.96
      ],
      "pH": [
        4.5,
        8.1
      ],
      "soilDepth": [
        0.14,
        3.6
      ],
      "lightMin": 0.035,
      "slopeMax": 0.8,
      "salinityMax": 0.22,
      "nutrientNeed": [
        0.09,
        0.12
      ],
      "metalTolerance": 0.38,
      "spacing": 2.4,
      "clusterRadius": 24,
      "dispersal": "water",
      "bedrock": "any"
    },
    "night": {
      "mode": "night",
      "intensity": 0.75,
      "color": "#a2d8da",
      "opening": 0.1
    },
    "sourceReferences": [
      "moebius-005-local-scan-026",
      "moebius-005-local-scan-028",
      "arzach-epic-local-scan-052",
      "airtight-garage-local-scan-113"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": "Cyan mouth rims mark the night variant; the whole vessel is never emissive."
  },
  "dusk-bud-candelabra": {
    "name": "Dusk bud candelabra",
    "genus": "Digitocereus",
    "collection": "twilight",
    "morphology": "candelabra",
    "studyPlate": "13E",
    "conceptPath": "../research/botanical-plates/terrestrial-twilight.png",
    "height": [
      2.4,
      5.5
    ],
    "width": [
      0.7,
      1.2
    ],
    "branches": [
      5,
      8
    ],
    "palette": {
      "base": "#aa8195",
      "body": "#9cb29b",
      "tip": "#cecbaa",
      "underside": "#849e9a",
      "accent": "#d6b078"
    },
    "traits": {
      "leafShape": "spear",
      "flower": true,
      "roots": "buried",
      "runner": "none",
      "slender": 0.47,
      "stemColorRole": "base"
    },
    "ecology": {
      "temperature": [
        -8,
        32
      ],
      "moisture": [
        0.4,
        0.96
      ],
      "pH": [
        4.5,
        8.1
      ],
      "soilDepth": [
        0.14,
        3.6
      ],
      "lightMin": 0.035,
      "slopeMax": 0.8,
      "salinityMax": 0.22,
      "nutrientNeed": [
        0.21,
        0.22
      ],
      "metalTolerance": 0.38,
      "spacing": 5,
      "clusterRadius": 24,
      "dispersal": "animal",
      "bedrock": "any"
    },
    "night": {
      "mode": "night",
      "intensity": 0.66,
      "color": "#e6b68d",
      "opening": 0.035
    },
    "sourceReferences": [
      "moebius-005-local-scan-026",
      "moebius-005-local-scan-028",
      "arzach-epic-local-scan-052",
      "airtight-garage-local-scan-113"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": "Terminal buds carry a warm selective night emission."
  },
  "starbell-arc-vine": {
    "name": "Starbell arc vine",
    "genus": "Arcovitis",
    "collection": "twilight",
    "morphology": "vine",
    "studyPlate": "13F",
    "conceptPath": "../research/botanical-plates/terrestrial-twilight.png",
    "height": [
      0.8,
      2
    ],
    "width": [
      2.2,
      3.4
    ],
    "branches": [
      8,
      13
    ],
    "palette": {
      "base": "#988aa4",
      "body": "#b0a3b4",
      "tip": "#d2b9bc",
      "underside": "#8b9baa",
      "accent": "#d5b595"
    },
    "traits": {
      "leafShape": "heart",
      "flower": true,
      "curl": 0.3,
      "roots": "buried",
      "runner": "surface-arch"
    },
    "ecology": {
      "temperature": [
        -8,
        32
      ],
      "moisture": [
        0.4,
        0.96
      ],
      "pH": [
        4.5,
        8.1
      ],
      "soilDepth": [
        0.14,
        3.6
      ],
      "lightMin": 0.035,
      "slopeMax": 0.8,
      "salinityMax": 0.22,
      "nutrientNeed": [
        0.21,
        0.22
      ],
      "metalTolerance": 0.38,
      "spacing": 3,
      "clusterRadius": 24,
      "dispersal": "clonal",
      "bedrock": "any"
    },
    "night": {
      "mode": "night",
      "intensity": 0.62,
      "color": "#bfdac8",
      "opening": 0.08
    },
    "sourceReferences": [
      "moebius-005-local-scan-026",
      "moebius-005-local-scan-028",
      "arzach-epic-local-scan-052",
      "airtight-garage-local-scan-113"
    ],
    "provenance": "Original GPT Image botanical concept; visual translation, not a canonical organism.",
    "nightNote": "Small hanging flower organs brighten and the upper form gently opens after dusk."
  },
  ...SOURCE_FLORA_SPECIES
});
