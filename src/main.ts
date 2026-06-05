import "./styles.css";

type ToolMode = "draw" | "select" | "pan";

type Point = {
  x: number;
  y: number;
};

type PolygonShape = {
  id: string;
  groupId?: string;
  vertices: Point[];
  snapAnchor: Point;
  fill: string;
  stroke: string;
  opacity: number;
  strokeWidth: number;
};

type ClipboardPolygon = Omit<PolygonShape, "id">;

type DrawingFile = {
  version: 1;
  gridSize: number;
  polygons: PolygonShape[];
};

type BrowserSaveFilePicker = (options: {
  excludeAcceptAllOption?: boolean;
  id?: string;
  startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<{
  name: string;
  createWritable: () => Promise<{
    write: (content: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

type EditorSettings = {
  mode: ToolMode;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
};

type HistorySnapshot = {
  document: DrawingFile;
  draftVertices: Point[];
  selection: {
    ids: string[];
    primaryId: string | null;
    vertexIndex: number | null;
  };
};

type DragState =
  | {
      kind: "pan";
      startX: number;
      startY: number;
      viewX: number;
      viewY: number;
    }
  | {
      kind: "vertex";
      polygonId: string;
      vertexIndex: number;
    }
  | {
      kind: "polygon";
      polygonIds: string[];
      lastWorld: Point;
      originalVertices: Map<string, Point[]>;
      originalAnchors: Map<string, Point>;
    }
  | {
      kind: "marquee";
      startWorld: Point;
      currentWorld: Point;
      additive: boolean;
    };

const STORAGE_KEY = "polydraw.document.v1";
const VIEWPORT_STORAGE_KEY = "polydraw.viewport.v1";
const EDITOR_SETTINGS_STORAGE_KEY = "polydraw.editorSettings.v1";
const JSON_FILE_NAME_STORAGE_KEY = "polydraw.jsonFileName.v1";
const MIN_GRID = 4;
const MAX_GRID = 240;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 6;
const MAX_CENTER_ZOOM = 1;
const HISTORY_LIMIT = 80;
const DEFAULT_FILL = "#5b8def";
const DEFAULT_STROKE = "#20232d";
const defaultEditorSettings: EditorSettings = {
  mode: "draw",
  fill: DEFAULT_FILL,
  stroke: DEFAULT_STROKE,
  strokeWidth: 2,
  opacity: 0.82,
};

const iconSvg = {
  cursor:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 3 14 8-6 2.2L10.8 19 5 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  polygon:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 4 10 3 3 9-8 5-8-5 1-9 2-3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 4h.01M17 7h.01M20 16h.01M12 21h.01M4 16h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  hand:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V11m0-3.5a1.5 1.5 0 0 1 3 0V13m0-2.5a1.5 1.5 0 0 1 3 0V15c0 4-2.4 6-6.6 6H12a6 6 0 0 1-5.1-2.8l-2.5-4.1A1.7 1.7 0 0 1 7 12l1.8 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  undo:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M5 12h9a5 5 0 1 1 0 10h-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  redo:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5M19 12h-9a5 5 0 1 0 0 10h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  download:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  upload:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V9m0 0 4 4m-4-4-4 4M5 5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h11v11H8zM5 16V5h11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  duplicate:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h11v11H8zM5 16V5h11M13.5 11v5M11 13.5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  group:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h7v7H5zM12 9h7v7h-7zM8.5 15v2.5H17V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  ungroup:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h7v7H5zM12 9h7v7h-7zM8.5 17.5H11M14 16h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  layerUp:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15h8v4H6zM10 5h8v4h-8zM17 17v-5m0 0-2 2m2-2 2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  layerDown:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5h8v4h-8zM6 15h8v4H6zM17 12v5m0 0-2-2m2 2 2-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bringFront:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15h8v4H5zM11 9h8v4h-8zM15 9V4m0 0-3 3m3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sendBack:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h8v4h-8zM5 11h8v4H5zM9 15v5m0 0-3-3m3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  image:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 16 4.5-4.5 4 4L15 13l5 5M8.5 8.5h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6m4-6v6M9 7l1-3h4l1 3m-8 0 1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  target:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M7 12a5 5 0 1 0 10 0 5 5 0 0 0-10 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  magnet:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v8a5 5 0 0 0 10 0V4M7 8h4m2 0h4M7 4h4m2 0h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  home:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7M6.5 10v9h11v-9M10 19v-5h4v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  minus:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 18 18M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  keyboard:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v10H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 13h.01M10 13h4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  list:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

const initialDocument: DrawingFile = {
  version: 1,
  gridSize: 32,
  polygons: [],
};

let documentState = loadDocument();
let editorSettings = loadEditorSettings();
let mode: ToolMode = editorSettings.mode;
let viewport: Viewport = { x: 0, y: 0, scale: 1 };
let dpr = window.devicePixelRatio || 1;
let draftVertices: Point[] = [];
let selectedPolygonId: string | null = null;
let selectedPolygonIds = new Set<string>();
let selectedVertexIndex: number | null = null;
let clipboardPolygons: ClipboardPolygon[] = [];
let dragState: DragState | null = null;
let lastPointerWorld: Point = { x: 0, y: 0 };
let lastPointerSnap: Point = { x: 0, y: 0 };
let snapIsDisabled = false;
let spaceIsDown = false;
let toastTimer = 0;
let undoStack: HistorySnapshot[] = [];
let redoStack: HistorySnapshot[] = [];
let lastHistorySnapshot = createHistorySnapshot();
let lastHistoryKey = serializeHistorySnapshot(lastHistorySnapshot);

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

app.innerHTML = `
  <main class="app-shell">
    <aside class="sidebar" aria-label="Editor controls">
      <div class="brand">
        <h1>PolyDraw</h1>
        <span class="status-pill" id="saveStatus">Saved</span>
      </div>

      <section class="panel" aria-label="Tools">
        <h2 class="panel-title">Tool</h2>
        <div class="segmented">
          <button class="tool-button ${mode === "draw" ? "active" : ""}" data-tool="draw" type="button" title="Draw polygon">${iconSvg.polygon}<span>Draw</span></button>
          <button class="tool-button ${mode === "select" ? "active" : ""}" data-tool="select" type="button" title="Select and edit">${iconSvg.cursor}<span>Select</span></button>
          <button class="tool-button ${mode === "pan" ? "active" : ""}" data-tool="pan" type="button" title="Pan canvas">${iconSvg.hand}<span>Pan</span></button>
        </div>
      </section>

      <section class="panel" aria-label="Grid settings">
        <h2 class="panel-title">Grid</h2>
        <div class="form-grid">
          <div class="field-row">
            <label for="gridSize">Grid size</label>
            <input id="gridSize" type="number" min="${MIN_GRID}" max="${MAX_GRID}" step="1" value="${documentState.gridSize}" />
          </div>
        </div>
      </section>

      <section class="panel" aria-label="Polygon style">
        <h2 class="panel-title">Style</h2>
        <div class="form-grid">
          <div class="field">
            <label for="fillColor">Fill</label>
            <input id="fillColor" type="color" value="${editorSettings.fill}" />
          </div>
          <div class="field">
            <label for="strokeColor">Stroke</label>
            <input id="strokeColor" type="color" value="${editorSettings.stroke}" />
          </div>
          <div class="field-row">
            <label for="strokeWidth">Stroke width</label>
            <input id="strokeWidth" type="number" min="0" max="40" step="1" value="${editorSettings.strokeWidth}" />
          </div>
          <div class="field-row">
            <label for="opacity">Opacity</label>
            <input id="opacity" type="number" min="0.05" max="1" step="0.05" value="${editorSettings.opacity}" />
          </div>
        </div>
      </section>

      <section class="panel" aria-label="Draft actions">
        <h2 class="panel-title">Draft</h2>
        <div class="command-grid">
          <button class="command-button" id="finishDraft" type="button" title="Finish polygon">${iconSvg.check}<span>Finish</span></button>
          <button class="command-button" id="cancelDraft" type="button" title="Cancel draft">${iconSvg.x}<span>Cancel</span></button>
        </div>
      </section>

      <section class="panel" aria-label="File actions">
        <h2 class="panel-title">Files</h2>
        <div class="command-grid">
          <button class="command-button" id="saveJson" type="button" title="Save drawing file">${iconSvg.download}<span>JSON</span></button>
          <button class="command-button" id="loadJson" type="button" title="Load drawing file">${iconSvg.upload}<span>Load</span></button>
          <button class="command-button" id="saveSvg" type="button" title="Export SVG logo">${iconSvg.image}<span>SVG</span></button>
          <button class="command-button danger" id="clearAll" type="button" title="Clear drawing">${iconSvg.trash}<span>Clear</span></button>
        </div>
        <input class="hidden-file" id="fileInput" type="file" accept="application/json,.json" />
      </section>

    </aside>

    <section class="workspace" aria-label="Infinite polygon canvas">
      <canvas class="canvas" id="canvas"></canvas>
      <div class="topbar">
        <div class="readout">
          <span class="readout-item" id="coordinateReadout">0, 0</span>
          <span class="readout-item" id="zoomReadout">100%</span>
          <span class="readout-item" id="countReadout">0 polygons</span>
        </div>
        <div class="context-actions" id="contextActions" hidden></div>
        <div class="quick-actions">
          <button class="icon-button" id="undoAction" type="button" title="Undo" disabled>${iconSvg.undo}</button>
          <button class="icon-button" id="redoAction" type="button" title="Redo" disabled>${iconSvg.redo}</button>
          <button class="icon-button" id="showShortcuts" type="button" title="Keyboard shortcuts">${iconSvg.keyboard}</button>
          <button class="icon-button" id="zoomOut" type="button" title="Zoom out">${iconSvg.minus}</button>
          <button class="icon-button" id="zoomIn" type="button" title="Zoom in">${iconSvg.plus}</button>
          <button class="icon-button" id="centerView" type="button" title="Center drawing">${iconSvg.target}</button>
          <button class="icon-button" id="resetView" type="button" title="Reset camera">${iconSvg.home}</button>
          <details class="object-list" id="objectList">
            <summary class="icon-button" title="Object list">${iconSvg.list}</summary>
            <div class="object-list-panel">
              <div class="object-list-header">Objects</div>
              <div class="object-list-items" id="objectListItems"></div>
            </div>
          </details>
        </div>
      </div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
      <dialog class="shortcut-dialog" id="shortcutDialog" aria-labelledby="shortcutTitle">
        <div class="shortcut-header">
          <h2 id="shortcutTitle">Keyboard Shortcuts</h2>
          <button class="icon-button" id="closeShortcuts" type="button" title="Close shortcuts">${iconSvg.x}</button>
        </div>
        <div class="shortcut-grid">
          <span><kbd>D</kbd></span><span>Draw</span>
          <span><kbd>V</kbd></span><span>Select</span>
          <span><kbd>H</kbd></span><span>Pan</span>
          <span><kbd>Space</kbd></span><span>Temporary pan</span>
          <span><kbd>Enter</kbd></span><span>Finish polygon</span>
          <span><kbd>Esc</kbd></span><span>Cancel or clear selection</span>
          <span><kbd>Delete</kbd></span><span>Delete selection</span>
          <span><kbd>Shift</kbd> + drag</span><span>Add to selection</span>
          <span><kbd>Shift</kbd></span><span>Place or move vertices freely</span>
          <span><kbd>+</kbd> / <kbd>-</kbd></span><span>Zoom</span>
          <span><kbd>0</kbd></span><span>Center view</span>
          <span><kbd>1</kbd></span><span>Reset camera</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>S</kbd></span><span>Save JSON</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd></span><span>Save JSON</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Z</kbd></span><span>Undo</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></span><span>Redo</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Y</kbd></span><span>Redo</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>C</kbd></span><span>Copy selection</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>V</kbd></span><span>Paste selection</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>G</kbd></span><span>Group selection</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>G</kbd></span><span>Ungroup selection</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>]</kbd></span><span>Move layer up</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>[</kbd></span><span>Move layer down</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>]</kbd></span><span>Bring to front</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>[</kbd></span><span>Send to back</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>O</kbd></span><span>Load JSON</span>
          <span><kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>E</kbd></span><span>Export SVG</span>
          <span><kbd>?</kbd> or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>/</kbd></span><span>Show shortcuts</span>
        </div>
      </dialog>
    </section>
  </main>
`;

const canvas = mustQuery<HTMLCanvasElement>("#canvas");
const maybeContext = canvas.getContext("2d");

if (!maybeContext) {
  throw new Error("2D canvas is not supported");
}

const context: CanvasRenderingContext2D = maybeContext;

const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tool]"));
const gridSizeInput = mustQuery<HTMLInputElement>("#gridSize");
const fillColorInput = mustQuery<HTMLInputElement>("#fillColor");
const strokeColorInput = mustQuery<HTMLInputElement>("#strokeColor");
const strokeWidthInput = mustQuery<HTMLInputElement>("#strokeWidth");
const opacityInput = mustQuery<HTMLInputElement>("#opacity");
const saveStatus = mustQuery<HTMLSpanElement>("#saveStatus");
const coordinateReadout = mustQuery<HTMLSpanElement>("#coordinateReadout");
const zoomReadout = mustQuery<HTMLSpanElement>("#zoomReadout");
const countReadout = mustQuery<HTMLSpanElement>("#countReadout");
const contextActions = mustQuery<HTMLDivElement>("#contextActions");
const objectList = mustQuery<HTMLDetailsElement>("#objectList");
const objectListItems = mustQuery<HTMLDivElement>("#objectListItems");
const toast = mustQuery<HTMLDivElement>("#toast");
const fileInput = mustQuery<HTMLInputElement>("#fileInput");
const shortcutDialog = mustQuery<HTMLDialogElement>("#shortcutDialog");
const undoButton = mustQuery<HTMLButtonElement>("#undoAction");
const redoButton = mustQuery<HTMLButtonElement>("#redoAction");

function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function loadDocument(): DrawingFile {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return structuredClone(initialDocument);
  }

  try {
    return parseDrawingFile(JSON.parse(stored));
  } catch {
    return structuredClone(initialDocument);
  }
}

function parseDrawingFile(value: unknown): DrawingFile {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.polygons)) {
    throw new Error("Unsupported drawing file");
  }

  const gridSize = clamp(Number(value.gridSize), MIN_GRID, MAX_GRID);
  const polygons = value.polygons.map((polygon) => {
    if (!isRecord(polygon) || !Array.isArray(polygon.vertices)) {
      throw new Error("Invalid polygon");
    }

    const vertices = polygon.vertices.map((vertex) => {
      if (!isRecord(vertex)) {
        throw new Error("Invalid vertex");
      }
      return {
        x: Number(vertex.x),
        y: Number(vertex.y),
      };
    });

    if (vertices.length < 3 || vertices.some((vertex) => !Number.isFinite(vertex.x) || !Number.isFinite(vertex.y))) {
      throw new Error("Invalid polygon vertices");
    }

    return {
      id: typeof polygon.id === "string" ? polygon.id : createId(),
      groupId: typeof polygon.groupId === "string" ? polygon.groupId : undefined,
      vertices,
      snapAnchor: parsePoint(polygon.snapAnchor) ?? vertices[0],
      fill: typeof polygon.fill === "string" ? polygon.fill : DEFAULT_FILL,
      stroke: typeof polygon.stroke === "string" ? polygon.stroke : DEFAULT_STROKE,
      opacity: clamp(Number(polygon.opacity), 0.05, 1),
      strokeWidth: clamp(Number(polygon.strokeWidth), 0, 40),
    };
  });

  return {
    version: 1,
    gridSize,
    polygons,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePoint(value: unknown): Point | null {
  if (!isRecord(value)) {
    return null;
  }

  const point = {
    x: Number(value.x),
    y: Number(value.y),
  };
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

function saveDocument() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(documentState));
  saveStatus.textContent = "Saved";
  saveStatus.style.color = "#2f6f4f";
  updateReadouts();
}

function loadViewport(): boolean {
  const stored = window.localStorage.getItem(VIEWPORT_STORAGE_KEY);
  if (!stored) {
    return false;
  }

  try {
    const parsed = JSON.parse(stored);
    if (!isRecord(parsed)) {
      return false;
    }

    const nextViewport = {
      x: Number(parsed.x),
      y: Number(parsed.y),
      scale: clamp(Number(parsed.scale), MIN_ZOOM, MAX_ZOOM),
    };

    if (!Number.isFinite(nextViewport.x) || !Number.isFinite(nextViewport.y)) {
      return false;
    }

    viewport = nextViewport;
    return true;
  } catch {
    return false;
  }
}

function saveViewport() {
  window.localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport));
}

function loadEditorSettings(): EditorSettings {
  const stored = window.localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY);
  if (!stored) {
    return { ...defaultEditorSettings };
  }

  try {
    const parsed = JSON.parse(stored);
    if (!isRecord(parsed)) {
      return { ...defaultEditorSettings };
    }

    return {
      mode: parseToolMode(parsed.mode) ?? defaultEditorSettings.mode,
      fill: parseColor(parsed.fill) ?? defaultEditorSettings.fill,
      stroke: parseColor(parsed.stroke) ?? defaultEditorSettings.stroke,
      strokeWidth: clamp(Number(parsed.strokeWidth), 0, 40),
      opacity: clamp(Number(parsed.opacity), 0.05, 1),
    };
  } catch {
    return { ...defaultEditorSettings };
  }
}

function saveEditorSettings() {
  editorSettings = {
    mode,
    fill: fillColorInput.value,
    stroke: strokeColorInput.value,
    strokeWidth: clamp(Number(strokeWidthInput.value), 0, 40),
    opacity: clamp(Number(opacityInput.value), 0.05, 1),
  };
  window.localStorage.setItem(EDITOR_SETTINGS_STORAGE_KEY, JSON.stringify(editorSettings));
}

function parseToolMode(value: unknown): ToolMode | null {
  return value === "draw" || value === "select" || value === "pan" ? value : null;
}

function parseColor(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function createHistorySnapshot(): HistorySnapshot {
  return {
    document: structuredClone(documentState),
    draftVertices: draftVertices.map((vertex) => ({ ...vertex })),
    selection: {
      ids: [...selectedPolygonIds],
      primaryId: selectedPolygonId,
      vertexIndex: selectedVertexIndex,
    },
  };
}

function serializeHistorySnapshot(snapshot: HistorySnapshot): string {
  return JSON.stringify({
    document: snapshot.document,
    draftVertices: snapshot.draftVertices,
  });
}

function recordHistoryBoundary(): boolean {
  const currentSnapshot = createHistorySnapshot();
  const currentKey = serializeHistorySnapshot(currentSnapshot);
  if (currentKey === lastHistoryKey) {
    lastHistorySnapshot = currentSnapshot;
    updateHistoryButtons();
    return false;
  }

  undoStack.push(structuredClone(lastHistorySnapshot));
  if (undoStack.length > HISTORY_LIMIT) {
    undoStack.shift();
  }
  redoStack = [];
  lastHistorySnapshot = currentSnapshot;
  lastHistoryKey = currentKey;
  updateHistoryButtons();
  return true;
}

function restoreHistorySnapshot(snapshot: HistorySnapshot) {
  documentState = structuredClone(snapshot.document);
  gridSizeInput.value = String(documentState.gridSize);
  draftVertices = snapshot.draftVertices.map((vertex) => ({ ...vertex }));
  restoreSelection(snapshot);
  dragState = null;
  syncCanvasCursor();
  saveDocument();
  draw();
}

function restoreSelection(snapshot: HistorySnapshot) {
  const polygonIds = new Set(documentState.polygons.map((polygon) => polygon.id));
  const restoredIds = snapshot.selection.ids.filter((id) => polygonIds.has(id));
  const primaryId = snapshot.selection.primaryId && polygonIds.has(snapshot.selection.primaryId) ? snapshot.selection.primaryId : (restoredIds[0] ?? null);
  selectedPolygonIds = new Set(restoredIds);
  selectedPolygonId = primaryId;
  selectedVertexIndex = getRestorableVertexIndex(snapshot, primaryId);
  syncStyleControls();
  updateContextActions();
}

function getRestorableVertexIndex(snapshot: HistorySnapshot, polygonId: string | null): number | null {
  if (!polygonId || snapshot.selection.vertexIndex === null) {
    return null;
  }

  const polygon = documentState.polygons.find((item) => item.id === polygonId);
  if (!polygon || snapshot.selection.vertexIndex < 0 || snapshot.selection.vertexIndex >= polygon.vertices.length) {
    return null;
  }
  return snapshot.selection.vertexIndex;
}

function undo() {
  const previousSnapshot = undoStack.pop();
  if (!previousSnapshot) {
    showToast("Nothing to undo.");
    updateHistoryButtons();
    return;
  }

  redoStack.push(createHistorySnapshot());
  restoreHistorySnapshot(previousSnapshot);
  lastHistorySnapshot = createHistorySnapshot();
  lastHistoryKey = serializeHistorySnapshot(lastHistorySnapshot);
  updateHistoryButtons();
  showToast("Undone.");
}

function redo() {
  const nextSnapshot = redoStack.pop();
  if (!nextSnapshot) {
    showToast("Nothing to redo.");
    updateHistoryButtons();
    return;
  }

  undoStack.push(createHistorySnapshot());
  restoreHistorySnapshot(nextSnapshot);
  lastHistorySnapshot = createHistorySnapshot();
  lastHistoryKey = serializeHistorySnapshot(lastHistorySnapshot);
  updateHistoryButtons();
  showToast("Redone.");
}

function updateHistoryButtons() {
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function markChanged(message?: string) {
  recordHistoryBoundary();
  saveStatus.textContent = "Saving";
  saveStatus.style.color = "#71662c";
  saveDocument();
  if (message) {
    showToast(message);
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function screenToWorld(screen: Point): Point {
  return {
    x: (screen.x - viewport.x) / viewport.scale,
    y: (screen.y - viewport.y) / viewport.scale,
  };
}

function worldToScreen(world: Point): Point {
  return {
    x: world.x * viewport.scale + viewport.x,
    y: world.y * viewport.scale + viewport.y,
  };
}

function snapPoint(point: Point): Point {
  const grid = documentState.gridSize;
  return {
    x: Math.round(point.x / grid) * grid,
    y: Math.round(point.y / grid) * grid,
  };
}

function snapPointRelativeToAnchor(point: Point, anchor: Point): Point {
  const grid = documentState.gridSize;
  return {
    x: anchor.x + Math.round((point.x - anchor.x) / grid) * grid,
    y: anchor.y + Math.round((point.y - anchor.y) / grid) * grid,
  };
}

function getPlacementPoint(point: Point, disableSnap: boolean): Point {
  return disableSnap ? roundPoint(point) : snapPoint(point);
}

function getCurrentPlacementPoint(): Point {
  return snapIsDisabled ? roundPoint(lastPointerWorld) : lastPointerSnap;
}

function roundPoint(point: Point): Point {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
  };
}

function getPointerPoint(event: PointerEvent | MouseEvent | WheelEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#eef0f4";
  context.fillRect(0, 0, width, height);

  drawGrid(width, height);

  for (const polygon of documentState.polygons) {
    drawPolygon(polygon, selectedPolygonIds.has(polygon.id));
  }

  if (draftVertices.length > 0) {
    drawDraftPolygon();
  }

  if (dragState?.kind === "marquee") {
    drawMarquee(dragState);
  }

  drawSnapMarker();
  updateReadouts();
  updateObjectList();
}

function drawGrid(width: number, height: number) {
  const grid = documentState.gridSize;
  const scaledGrid = grid * viewport.scale;
  const majorEvery = 4;

  if (scaledGrid < 5) {
    return;
  }

  const startWorldX = Math.floor(-viewport.x / viewport.scale / grid) * grid;
  const endWorldX = Math.ceil((width - viewport.x) / viewport.scale / grid) * grid;
  const startWorldY = Math.floor(-viewport.y / viewport.scale / grid) * grid;
  const endWorldY = Math.ceil((height - viewport.y) / viewport.scale / grid) * grid;

  context.save();
  context.lineWidth = 1;

  for (let x = startWorldX; x <= endWorldX; x += grid) {
    const screen = worldToScreen({ x, y: 0 }).x;
    const isMajor = Math.round(x / grid) % majorEvery === 0;
    context.strokeStyle = isMajor ? "#cfd5df" : "#dfe3ea";
    drawLine(screen, 0, screen, height);
  }

  for (let y = startWorldY; y <= endWorldY; y += grid) {
    const screen = worldToScreen({ x: 0, y }).y;
    const isMajor = Math.round(y / grid) % majorEvery === 0;
    context.strokeStyle = isMajor ? "#cfd5df" : "#dfe3ea";
    drawLine(0, screen, width, screen);
  }

  context.strokeStyle = "#aeb8c8";
  drawLine(worldToScreen({ x: 0, y: 0 }).x, 0, worldToScreen({ x: 0, y: 0 }).x, height);
  drawLine(0, worldToScreen({ x: 0, y: 0 }).y, width, worldToScreen({ x: 0, y: 0 }).y);
  context.restore();
}

function drawLine(x1: number, y1: number, x2: number, y2: number) {
  context.beginPath();
  context.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  context.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
  context.stroke();
}

function drawPolygon(polygon: PolygonShape, isSelected: boolean) {
  if (polygon.vertices.length < 3) {
    return;
  }

  context.save();
  context.globalAlpha = polygon.opacity;
  context.beginPath();
  polygon.vertices.forEach((vertex, index) => {
    const screen = worldToScreen(vertex);
    if (index === 0) {
      context.moveTo(screen.x, screen.y);
    } else {
      context.lineTo(screen.x, screen.y);
    }
  });
  context.closePath();
  context.fillStyle = polygon.fill;
  context.fill();
  if (polygon.strokeWidth > 0) {
    context.strokeStyle = polygon.stroke;
    context.lineWidth = Math.max(1, polygon.strokeWidth * viewport.scale);
    context.stroke();
  }
  context.restore();

  if (isSelected) {
    drawSelection(polygon);
  }
}

function drawSelection(polygon: PolygonShape) {
  context.save();
  context.strokeStyle = "#2767e7";
  context.lineWidth = 1.5;
  context.setLineDash([5, 5]);
  context.beginPath();
  polygon.vertices.forEach((vertex, index) => {
    const screen = worldToScreen(vertex);
    if (index === 0) {
      context.moveTo(screen.x, screen.y);
    } else {
      context.lineTo(screen.x, screen.y);
    }
  });
  context.closePath();
  context.stroke();
  context.setLineDash([]);

  polygon.vertices.forEach((vertex, index) => {
    const screen = worldToScreen(vertex);
    const isActiveVertex = polygon.id === selectedPolygonId && index === selectedVertexIndex;
    context.beginPath();
    context.arc(screen.x, screen.y, isActiveVertex ? 7 : 5, 0, Math.PI * 2);
    context.fillStyle = isActiveVertex ? "#2767e7" : "#ffffff";
    context.strokeStyle = "#2767e7";
    context.lineWidth = 2;
    context.fill();
    context.stroke();
  });

  context.restore();
}

function drawMarquee(marquee: Extract<DragState, { kind: "marquee" }>) {
  const bounds = normalizeBounds(marquee.startWorld, marquee.currentWorld);
  const topLeft = worldToScreen({ x: bounds.minX, y: bounds.minY });
  const bottomRight = worldToScreen({ x: bounds.maxX, y: bounds.maxY });
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;

  context.save();
  context.fillStyle = "rgba(39, 103, 231, 0.10)";
  context.strokeStyle = "#2767e7";
  context.lineWidth = 1.5;
  context.setLineDash([6, 5]);
  context.fillRect(topLeft.x, topLeft.y, width, height);
  context.strokeRect(topLeft.x, topLeft.y, width, height);
  context.restore();
}

function drawDraftPolygon() {
  const previewVertices = [...draftVertices];
  const previewPoint = getCurrentPlacementPoint();
  if (!pointsEqual(previewVertices[previewVertices.length - 1], previewPoint)) {
    previewVertices.push(previewPoint);
  }

  context.save();
  context.strokeStyle = "#2767e7";
  context.lineWidth = 2;
  context.setLineDash([7, 5]);
  context.beginPath();
  previewVertices.forEach((vertex, index) => {
    const screen = worldToScreen(vertex);
    if (index === 0) {
      context.moveTo(screen.x, screen.y);
    } else {
      context.lineTo(screen.x, screen.y);
    }
  });
  context.stroke();
  context.setLineDash([]);

  for (const vertex of draftVertices) {
    const screen = worldToScreen(vertex);
    context.beginPath();
    context.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#2767e7";
    context.lineWidth = 2;
    context.fill();
    context.stroke();
  }

  if (draftVertices.length >= 3) {
    const start = worldToScreen(draftVertices[0]);
    context.beginPath();
    context.arc(start.x, start.y, 10, 0, Math.PI * 2);
    context.strokeStyle = "#2767e7";
    context.lineWidth = 1.5;
    context.stroke();
  }

  context.restore();
}

function drawSnapMarker() {
  if (dragState || mode === "pan") {
    return;
  }

  const screen = worldToScreen(getCurrentPlacementPoint());
  context.save();
  context.strokeStyle = mode === "select" ? "#168a6a" : "#d1406b";
  context.globalAlpha = snapIsDisabled ? 0.72 : 1;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(screen.x - 7, screen.y);
  context.lineTo(screen.x + 7, screen.y);
  context.moveTo(screen.x, screen.y - 7);
  context.lineTo(screen.x, screen.y + 7);
  context.stroke();
  context.restore();
}

function setMode(nextMode: ToolMode) {
  mode = nextMode;
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === mode);
  });
  syncCanvasCursor();
  saveEditorSettings();
  draw();
}

function getSelectedPolygon(): PolygonShape | null {
  return documentState.polygons.find((polygon) => polygon.id === selectedPolygonId) ?? null;
}

function getSelectedPolygons(): PolygonShape[] {
  return documentState.polygons.filter((polygon) => selectedPolygonIds.has(polygon.id));
}

function setSelection(ids: string[], primaryId = ids[0] ?? null) {
  selectedPolygonIds = new Set(ids);
  selectedPolygonId = primaryId && selectedPolygonIds.has(primaryId) ? primaryId : (ids[0] ?? null);
  selectedVertexIndex = null;
  syncStyleControls();
  updateContextActions();
}

function clearSelection() {
  selectedPolygonIds.clear();
  selectedPolygonId = null;
  selectedVertexIndex = null;
  updateContextActions();
}

function syncStyleControls() {
  const polygon = getSelectedPolygon();
  if (!polygon) {
    return;
  }

  fillColorInput.value = polygon.fill;
  strokeColorInput.value = polygon.stroke;
  strokeWidthInput.value = String(polygon.strokeWidth);
  opacityInput.value = String(polygon.opacity);
  saveEditorSettings();
}

function updateContextActions() {
  const selectedCount = selectedPolygonIds.size;
  const selectedPolygons = getSelectedPolygons();
  const hasGroupedSelection = selectedPolygons.some((polygon) => polygon.groupId);

  if (selectedCount === 0) {
    contextActions.hidden = true;
    contextActions.innerHTML = "";
    return;
  }

  contextActions.hidden = false;

  if (selectedVertexIndex !== null && selectedPolygonId) {
    contextActions.innerHTML = `
      <span class="context-label">Vertex</span>
      <button class="context-button" data-context-action="snap-vertex" type="button" title="Snap vertex to grid">${iconSvg.magnet}<span>Snap</span></button>
      <button class="context-button danger" data-context-action="delete-vertex" type="button" title="Delete vertex">${iconSvg.trash}<span>Vertex</span></button>
      <button class="context-button danger" data-context-action="delete-selection" type="button" title="Delete polygon">${iconSvg.x}<span>Polygon</span></button>
    `;
    return;
  }

  const label = selectedCount === 1 ? "Polygon" : `${selectedCount} selected`;
  const groupAction = selectedCount > 1
    ? `<button class="context-button" data-context-action="group-selection" type="button" title="Group selection">${iconSvg.group}<span>Group</span></button>`
    : "";
  const ungroupAction = hasGroupedSelection
    ? `<button class="context-button" data-context-action="ungroup-selection" type="button" title="Ungroup selection">${iconSvg.ungroup}<span>Ungroup</span></button>`
    : "";
  contextActions.innerHTML = `
    <span class="context-label">${label}</span>
    ${groupAction}
    ${ungroupAction}
    <details class="context-menu">
      <summary class="context-button">${iconSvg.layerUp}<span>Layer</span></summary>
      <div class="context-menu-panel">
        <button data-context-action="bring-front" type="button">${iconSvg.bringFront}<span>Bring to front</span></button>
        <button data-context-action="move-layer-up" type="button">${iconSvg.layerUp}<span>Move up</span></button>
        <button data-context-action="move-layer-down" type="button">${iconSvg.layerDown}<span>Move down</span></button>
        <button data-context-action="send-back" type="button">${iconSvg.sendBack}<span>Send to back</span></button>
      </div>
    </details>
    <button class="context-button" data-context-action="copy-selection" type="button" title="Copy selection">${iconSvg.copy}<span>Copy</span></button>
    <button class="context-button" data-context-action="duplicate-selection" type="button" title="Duplicate selection">${iconSvg.duplicate}<span>Duplicate</span></button>
    <button class="context-button danger" data-context-action="delete-selection" type="button" title="Delete selection">${iconSvg.trash}<span>Delete</span></button>
  `;
}

function updateObjectList() {
  if (documentState.polygons.length === 0) {
    objectListItems.innerHTML = `<div class="object-list-empty">No objects</div>`;
    return;
  }

  objectListItems.innerHTML = documentState.polygons
    .map((polygon, index) => {
      const layerNumber = documentState.polygons.length - index;
      const label = `Polygon ${index + 1}`;
      const groupLabel = polygon.groupId ? `Group ${polygon.groupId.slice(0, 6)}` : "No group";
      const selectedClass = selectedPolygonIds.has(polygon.id) ? " selected" : "";
      return `
        <button class="object-list-item${selectedClass}" data-object-id="${polygon.id}" type="button">
          <span class="object-swatch" style="background: ${escapeHtml(polygon.fill)}"></span>
          <span class="object-list-text">
            <strong>${label}</strong>
            <small>${groupLabel} · layer ${layerNumber}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function applyStyleInputsToSelection() {
  const polygons = getSelectedPolygons();
  if (polygons.length === 0) {
    return;
  }

  const strokeWidth = clamp(Number(strokeWidthInput.value), 0, 40);
  const opacity = clamp(Number(opacityInput.value), 0.05, 1);
  for (const polygon of polygons) {
    polygon.fill = fillColorInput.value;
    polygon.stroke = strokeColorInput.value;
    polygon.strokeWidth = strokeWidth;
    polygon.opacity = opacity;
  }
  strokeWidthInput.value = String(strokeWidth);
  opacityInput.value = String(opacity);
  saveEditorSettings();
  markChanged();
  draw();
}

function copySelection() {
  const polygons = getSelectedPolygons();
  if (polygons.length === 0) {
    showToast("Select polygons before copying.");
    return;
  }

  clipboardPolygons = polygons.map(toClipboardPolygon);
  showToast(`${clipboardPolygons.length} ${clipboardPolygons.length === 1 ? "polygon" : "polygons"} copied.`);
}

function pasteSelection() {
  if (clipboardPolygons.length === 0) {
    showToast("Nothing copied yet.");
    return;
  }

  const pastedPolygons = pastePolygons(clipboardPolygons, "pasted");
  clipboardPolygons = pastedPolygons.map(toClipboardPolygon);
}

function duplicateSelection() {
  const polygons = getSelectedPolygons();
  if (polygons.length === 0) {
    showToast("Select polygons before duplicating.");
    return;
  }

  pastePolygons(polygons.map(toClipboardPolygon), "duplicated");
}

function pastePolygons(polygons: ClipboardPolygon[], actionLabel: "pasted" | "duplicated") {
  const offset = Math.max(16, documentState.gridSize);
  const groupIdMap = new Map<string, string>();
  const pastedPolygons = polygons.map((polygon) => ({
    ...polygon,
    id: createId(),
    groupId: remapGroupId(polygon.groupId, groupIdMap),
    snapAnchor: {
      x: polygon.snapAnchor.x + offset,
      y: polygon.snapAnchor.y + offset,
    },
    vertices: polygon.vertices.map((vertex) => ({
      x: vertex.x + offset,
      y: vertex.y + offset,
    })),
  }));

  documentState.polygons.push(...pastedPolygons);
  setSelection(
    pastedPolygons.map((polygon) => polygon.id),
    pastedPolygons[0]?.id ?? null,
  );
  markChanged(`${pastedPolygons.length} ${pastedPolygons.length === 1 ? "polygon" : "polygons"} ${actionLabel}.`);
  draw();
  return pastedPolygons;
}

function remapGroupId(groupId: string | undefined, groupIdMap: Map<string, string>): string | undefined {
  if (!groupId) {
    return undefined;
  }

  const mappedGroupId = groupIdMap.get(groupId);
  if (mappedGroupId) {
    return mappedGroupId;
  }

  const nextGroupId = createId();
  groupIdMap.set(groupId, nextGroupId);
  return nextGroupId;
}

function toClipboardPolygon(polygon: PolygonShape): ClipboardPolygon {
  return {
    groupId: polygon.groupId,
    vertices: polygon.vertices.map((vertex) => ({ ...vertex })),
    snapAnchor: { ...polygon.snapAnchor },
    fill: polygon.fill,
    stroke: polygon.stroke,
    opacity: polygon.opacity,
    strokeWidth: polygon.strokeWidth,
  };
}

function deleteSelectedVertex() {
  if (!selectedPolygonId || selectedVertexIndex === null) {
    return;
  }

  const polygon = documentState.polygons.find((item) => item.id === selectedPolygonId);
  if (!polygon) {
    return;
  }

  if (polygon.vertices.length <= 3) {
    showToast("A polygon needs at least three vertices.");
    return;
  }

  polygon.vertices.splice(selectedVertexIndex, 1);
  selectedVertexIndex = null;
  updateContextActions();
  markChanged("Vertex deleted.");
  draw();
}

function snapSelectedVertex() {
  if (!selectedPolygonId || selectedVertexIndex === null) {
    return;
  }

  const polygon = documentState.polygons.find((item) => item.id === selectedPolygonId);
  if (!polygon) {
    return;
  }

  polygon.vertices[selectedVertexIndex] = snapPoint(polygon.vertices[selectedVertexIndex]);
  markChanged("Vertex snapped.");
  draw();
}

function groupSelection() {
  const polygons = getSelectedPolygons();
  if (polygons.length < 2) {
    showToast("Select at least two polygons to group.");
    return;
  }

  const groupId = createId();
  for (const polygon of polygons) {
    polygon.groupId = groupId;
  }
  updateContextActions();
  markChanged("Selection grouped.");
  draw();
}

function ungroupSelection() {
  const polygons = getSelectedPolygons();
  if (polygons.length === 0) {
    return;
  }

  let changed = false;
  for (const polygon of polygons) {
    if (polygon.groupId) {
      polygon.groupId = undefined;
      changed = true;
    }
  }

  if (!changed) {
    showToast("Selection is not grouped.");
    return;
  }

  updateContextActions();
  markChanged("Selection ungrouped.");
  draw();
}

function moveSelectionLayer(direction: "up" | "down" | "front" | "back") {
  if (selectedPolygonIds.size === 0) {
    return;
  }

  if (direction === "front" || direction === "back") {
    moveSelectionToLayerEdge(direction);
  } else {
    moveSelectionOneLayer(direction);
  }

  markChanged("Layer order updated.");
  draw();
}

function moveSelectionToLayerEdge(edge: "front" | "back") {
  const selected: PolygonShape[] = [];
  const unselected: PolygonShape[] = [];

  for (const polygon of documentState.polygons) {
    if (selectedPolygonIds.has(polygon.id)) {
      selected.push(polygon);
    } else {
      unselected.push(polygon);
    }
  }

  documentState.polygons = edge === "front" ? [...unselected, ...selected] : [...selected, ...unselected];
}

function moveSelectionOneLayer(direction: "up" | "down") {
  const polygons = [...documentState.polygons];

  if (direction === "up") {
    for (let index = polygons.length - 2; index >= 0; index -= 1) {
      if (selectedPolygonIds.has(polygons[index].id) && !selectedPolygonIds.has(polygons[index + 1].id)) {
        [polygons[index], polygons[index + 1]] = [polygons[index + 1], polygons[index]];
      }
    }
  } else {
    for (let index = 1; index < polygons.length; index += 1) {
      if (selectedPolygonIds.has(polygons[index].id) && !selectedPolygonIds.has(polygons[index - 1].id)) {
        [polygons[index], polygons[index - 1]] = [polygons[index - 1], polygons[index]];
      }
    }
  }

  documentState.polygons = polygons;
}

function syncCanvasCursor() {
  canvas.classList.toggle("select-mode", mode === "select");
  canvas.classList.toggle("pan-mode", mode === "pan");
  canvas.classList.toggle("space-pan", spaceIsDown);
  canvas.classList.toggle("dragging", dragState !== null);
}

function addDraftVertex(point: Point) {
  if (draftVertices.length >= 3 && isCloseToDraftStart(point)) {
    finishDraft();
    return;
  }

  if (draftVertices.some((vertex) => pointsEqual(vertex, point))) {
    showToast("That grid point is already in the current polygon.");
    return;
  }

  draftVertices.push(point);
  clearSelection();
  recordHistoryBoundary();
  draw();
}

function isCloseToDraftStart(point: Point): boolean {
  const start = draftVertices[0];
  if (!start) {
    return false;
  }
  const closeRadius = 14 / viewport.scale;
  return distance(point, start) <= closeRadius;
}

function finishDraft() {
  if (draftVertices.length < 3) {
    showToast("A polygon needs at least three vertices.");
    return;
  }

  const polygon: PolygonShape = {
    id: createId(),
    vertices: [...draftVertices],
    snapAnchor: draftVertices[0],
    fill: fillColorInput.value,
    stroke: strokeColorInput.value,
    opacity: clamp(Number(opacityInput.value), 0.05, 1),
    strokeWidth: clamp(Number(strokeWidthInput.value), 0, 40),
  };

  documentState.polygons.push(polygon);
  setSelection([polygon.id], polygon.id);
  draftVertices = [];
  markChanged("Polygon added.");
  draw();
}

function cancelDraft() {
  if (draftVertices.length === 0) {
    return;
  }
  draftVertices = [];
  recordHistoryBoundary();
  draw();
  showToast("Draft canceled.");
}

function selectAt(world: Point, additive: boolean) {
  const vertexHit = findVertexHit(world);
  if (vertexHit) {
    const polygonIds = getSelectionIdsForPolygon(vertexHit.polygon);
    setSelection(additive ? toggleIds([...selectedPolygonIds], polygonIds) : polygonIds, vertexHit.polygon.id);
    selectedVertexIndex = vertexHit.vertexIndex;
    updateContextActions();
    dragState = {
      kind: "vertex",
      polygonId: vertexHit.polygon.id,
      vertexIndex: vertexHit.vertexIndex,
    };
    return;
  }

  const polygon = findPolygonHit(world);
  if (polygon) {
    const polygonIds = getSelectionIdsForPolygon(polygon);
    if (additive) {
      setSelection(toggleIds([...selectedPolygonIds], polygonIds), polygon.id);
    } else if (!selectedPolygonIds.has(polygon.id)) {
      setSelection(polygonIds, polygon.id);
    } else {
      selectedPolygonId = polygon.id;
      selectedVertexIndex = null;
      syncStyleControls();
    }

    selectedVertexIndex = null;
    updateContextActions();
    dragState = {
      kind: "polygon",
      polygonIds: [...selectedPolygonIds],
      lastWorld: world,
      originalVertices: capturePolygonVertices([...selectedPolygonIds]),
      originalAnchors: capturePolygonAnchors([...selectedPolygonIds]),
    };
    return;
  }

  dragState = {
    kind: "marquee",
    startWorld: world,
    currentWorld: world,
    additive,
  };
  if (!additive) {
    clearSelection();
  }
}

function findVertexHit(world: Point): { polygon: PolygonShape; vertexIndex: number } | null {
  const radius = 10 / viewport.scale;

  for (let polygonIndex = documentState.polygons.length - 1; polygonIndex >= 0; polygonIndex -= 1) {
    const polygon = documentState.polygons[polygonIndex];
    for (let vertexIndex = 0; vertexIndex < polygon.vertices.length; vertexIndex += 1) {
      if (distance(world, polygon.vertices[vertexIndex]) <= radius) {
        return { polygon, vertexIndex };
      }
    }
  }

  return null;
}

function findPolygonHit(world: Point): PolygonShape | null {
  for (let index = documentState.polygons.length - 1; index >= 0; index -= 1) {
    const polygon = documentState.polygons[index];
    if (pointInPolygon(world, polygon.vertices)) {
      return polygon;
    }
  }
  return null;
}

function pointInPolygon(point: Point, vertices: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function selectByMarquee(marquee: Extract<DragState, { kind: "marquee" }>) {
  const bounds = normalizeBounds(marquee.startWorld, marquee.currentWorld);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  if (Math.abs(width * viewport.scale) < 4 || Math.abs(height * viewport.scale) < 4) {
    if (!marquee.additive) {
      clearSelection();
    }
    return;
  }

  const containedIds = documentState.polygons
    .filter((polygon) => polygonIntersectsSelectionBounds(polygon.vertices, bounds))
    .map((polygon) => polygon.id);
  const expandedContainedIds = expandGroupedIds(containedIds);
  const nextIds = marquee.additive ? [...new Set([...selectedPolygonIds, ...expandedContainedIds])] : expandedContainedIds;
  setSelection(nextIds);
}

function isPointInsideSelectionBounds(point: Point, bounds: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}

function polygonIntersectsSelectionBounds(vertices: Point[], bounds: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  if (vertices.some((vertex) => isPointInsideSelectionBounds(vertex, bounds))) {
    return true;
  }

  const boxCorners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];

  if (boxCorners.some((corner) => pointInPolygon(corner, vertices))) {
    return true;
  }

  const boxEdges: Array<[Point, Point]> = [
    [boxCorners[0], boxCorners[1]],
    [boxCorners[1], boxCorners[2]],
    [boxCorners[2], boxCorners[3]],
    [boxCorners[3], boxCorners[0]],
  ];

  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    if (boxEdges.some(([boxStart, boxEnd]) => segmentsIntersect(start, end, boxStart, boxEnd))) {
      return true;
    }
  }

  return false;
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const directionA = orientation(a, b, c);
  const directionB = orientation(a, b, d);
  const directionC = orientation(c, d, a);
  const directionD = orientation(c, d, b);

  if (directionA === 0 && isPointOnSegment(c, a, b)) {
    return true;
  }
  if (directionB === 0 && isPointOnSegment(d, a, b)) {
    return true;
  }
  if (directionC === 0 && isPointOnSegment(a, c, d)) {
    return true;
  }
  if (directionD === 0 && isPointOnSegment(b, c, d)) {
    return true;
  }

  return directionA !== directionB && directionC !== directionD;
}

function orientation(a: Point, b: Point, c: Point): number {
  const cross = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(cross) < 0.000001) {
    return 0;
  }
  return cross > 0 ? 1 : 2;
}

function isPointOnSegment(point: Point, start: Point, end: Point): boolean {
  return (
    point.x <= Math.max(start.x, end.x) &&
    point.x >= Math.min(start.x, end.x) &&
    point.y <= Math.max(start.y, end.y) &&
    point.y >= Math.min(start.y, end.y)
  );
}

function normalizeBounds(a: Point, b: Point): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

function getSelectionIdsForPolygon(polygon: PolygonShape): string[] {
  if (!polygon.groupId) {
    return [polygon.id];
  }
  return documentState.polygons.filter((item) => item.groupId === polygon.groupId).map((item) => item.id);
}

function toggleIds(ids: string[], toggledIds: string[]): string[] {
  const nextIds = new Set(ids);
  const shouldRemove = toggledIds.every((id) => nextIds.has(id));
  for (const id of toggledIds) {
    if (shouldRemove) {
      nextIds.delete(id);
    } else {
      nextIds.add(id);
    }
  }
  return [...nextIds];
}

function expandGroupedIds(ids: string[]): string[] {
  const nextIds = new Set(ids);
  for (const polygon of documentState.polygons) {
    if (nextIds.has(polygon.id) && polygon.groupId) {
      for (const groupedPolygon of documentState.polygons) {
        if (groupedPolygon.groupId === polygon.groupId) {
          nextIds.add(groupedPolygon.id);
        }
      }
    }
  }
  return [...nextIds];
}

function capturePolygonVertices(polygonIds: string[]): Map<string, Point[]> {
  const idSet = new Set(polygonIds);
  const vertices = new Map<string, Point[]>();
  for (const polygon of documentState.polygons) {
    if (idSet.has(polygon.id)) {
      vertices.set(
        polygon.id,
        polygon.vertices.map((vertex) => ({ ...vertex })),
      );
    }
  }
  return vertices;
}

function capturePolygonAnchors(polygonIds: string[]): Map<string, Point> {
  const idSet = new Set(polygonIds);
  const anchors = new Map<string, Point>();
  for (const polygon of documentState.polygons) {
    if (idSet.has(polygon.id)) {
      anchors.set(polygon.id, { ...polygon.snapAnchor });
    }
  }
  return anchors;
}

function moveSelectedVertex(point: Point) {
  if (!selectedPolygonId || selectedVertexIndex === null) {
    return;
  }

  const polygon = documentState.polygons.find((item) => item.id === selectedPolygonId);
  if (!polygon) {
    return;
  }

  polygon.vertices[selectedVertexIndex] = point;
}

function movePolygons(polygonIds: string[], currentWorld: Point, disableSnap: boolean) {
  if (dragState?.kind !== "polygon") {
    return;
  }

  const polygonDrag = dragState;
  const totalDelta = {
    x: currentWorld.x - polygonDrag.lastWorld.x,
    y: currentWorld.y - polygonDrag.lastWorld.y,
  };
  const roundedDelta = {
    x: Math.round(totalDelta.x),
    y: Math.round(totalDelta.y),
  };

  const movingIds = new Set(polygonIds);
  const referencePolygonId = polygonIds.find((polygonId) => polygonDrag.originalVertices.has(polygonId) && polygonDrag.originalAnchors.has(polygonId));
  if (!referencePolygonId) {
    return;
  }

  const referenceVertices = polygonDrag.originalVertices.get(referencePolygonId);
  const referenceAnchor = polygonDrag.originalAnchors.get(referencePolygonId);
  if (!referenceVertices || !referenceAnchor) {
    return;
  }

  const originalReference = referenceVertices[0];
  const targetReference = disableSnap
    ? {
        x: originalReference.x + roundedDelta.x,
        y: originalReference.y + roundedDelta.y,
      }
    : snapPointRelativeToAnchor(
        {
          x: originalReference.x + totalDelta.x,
          y: originalReference.y + totalDelta.y,
        },
        referenceAnchor,
      );
  const appliedDelta = {
    x: targetReference.x - originalReference.x,
    y: targetReference.y - originalReference.y,
  };

  for (const polygon of documentState.polygons) {
    if (!movingIds.has(polygon.id)) {
      continue;
    }

    const originalVertices = polygonDrag.originalVertices.get(polygon.id);
    if (!originalVertices) {
      continue;
    }

    polygon.vertices = originalVertices.map((vertex) => ({
      x: vertex.x + appliedDelta.x,
      y: vertex.y + appliedDelta.y,
    }));
  }
}

function deleteSelection() {
  if (selectedPolygonIds.size === 0) {
    cancelDraft();
    return;
  }

  documentState.polygons = documentState.polygons.filter((polygon) => !selectedPolygonIds.has(polygon.id));
  clearSelection();
  markChanged("Selection deleted.");
  draw();
}

function updateReadouts() {
  const readoutPoint = getCurrentPlacementPoint();
  coordinateReadout.textContent = `${round(readoutPoint.x)}, ${round(readoutPoint.y)}`;
  zoomReadout.textContent = `${Math.round(viewport.scale * 100)}%`;
  const count = documentState.polygons.length;
  const selectedCount = selectedPolygonIds.size;
  countReadout.textContent = selectedCount > 0 ? `${selectedCount} selected` : `${count} ${count === 1 ? "polygon" : "polygons"}`;
}

function zoomAt(screenPoint: Point, factor: number) {
  const before = screenToWorld(screenPoint);
  viewport.scale = clamp(viewport.scale * factor, MIN_ZOOM, MAX_ZOOM);
  viewport.x = screenPoint.x - before.x * viewport.scale;
  viewport.y = screenPoint.y - before.y * viewport.scale;
  saveViewport();
  draw();
}

function centerView() {
  const bounds = getDocumentBounds();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  if (!bounds) {
    viewport = { x: width / 2, y: height / 2, scale: 1 };
    saveViewport();
    draw();
    return;
  }

  const padding = 80;
  const boundsWidth = Math.max(documentState.gridSize, bounds.maxX - bounds.minX);
  const boundsHeight = Math.max(documentState.gridSize, bounds.maxY - bounds.minY);
  viewport.scale = clamp(Math.min((width - padding * 2) / boundsWidth, (height - padding * 2) / boundsHeight), MIN_ZOOM, MAX_CENTER_ZOOM);
  viewport.x = width / 2 - ((bounds.minX + bounds.maxX) / 2) * viewport.scale;
  viewport.y = height / 2 - ((bounds.minY + bounds.maxY) / 2) * viewport.scale;
  saveViewport();
  draw();
}

function resetView() {
  viewport = {
    x: canvas.clientWidth / 2,
    y: canvas.clientHeight / 2,
    scale: 1,
  };
  saveViewport();
  draw();
  showToast("Camera reset.");
}

function getDocumentBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const allVertices = documentState.polygons.flatMap((polygon) => polygon.vertices);
  if (allVertices.length === 0) {
    return null;
  }

  return allVertices.reduce(
    (bounds, vertex) => ({
      minX: Math.min(bounds.minX, vertex.x),
      minY: Math.min(bounds.minY, vertex.y),
      maxX: Math.max(bounds.maxX, vertex.x),
      maxY: Math.max(bounds.maxY, vertex.y),
    }),
    {
      minX: allVertices[0].x,
      minY: allVertices[0].y,
      maxX: allVertices[0].x,
      maxY: allVertices[0].y,
    },
  );
}

async function exportJson() {
  const content = JSON.stringify(documentState, null, 2);
  const fileName = await saveJsonFile(content, getSavedJsonFileName());
  if (fileName === null) {
    return;
  }

  saveJsonFileName(fileName);
  showToast(`Drawing file saved as ${fileName}.`);
}

async function saveJsonFile(content: string, defaultFileName: string): Promise<string | null> {
  const blob = new Blob([content], { type: "application/json" });
  const saveFilePicker = getSaveFilePicker();
  if (saveFilePicker) {
    try {
      const handle = await saveFilePicker({
        id: "polydraw-json",
        startIn: "documents",
        suggestedName: defaultFileName,
        types: [
          {
            description: "PolyDraw JSON",
            accept: {
              "application/json": [".json"],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name;
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }
      console.error(error);
    }
  }

  const fileName = promptForFileName("Save drawing as", defaultFileName, ".json");
  if (!fileName) {
    return null;
  }

  downloadBlob(content, fileName, "application/json");
  return fileName;
}

function getSaveFilePicker(): BrowserSaveFilePicker | null {
  if (!window.isSecureContext || !isTopLevelWindow() || !("showSaveFilePicker" in window)) {
    return null;
  }

  return (window as Window & { showSaveFilePicker: BrowserSaveFilePicker }).showSaveFilePicker;
}

function exportSvg() {
  const bounds = getDocumentBounds();
  if (!bounds) {
    showToast("Draw at least one polygon before exporting SVG.");
    return;
  }

  const margin = documentState.gridSize;
  const minX = bounds.minX - margin;
  const minY = bounds.minY - margin;
  const width = bounds.maxX - bounds.minX + margin * 2;
  const height = bounds.maxY - bounds.minY + margin * 2;
  const polygons = documentState.polygons
    .map((polygon) => {
      const points = polygon.vertices.map((vertex) => `${round(vertex.x)},${round(vertex.y)}`).join(" ");
      const stroke =
        polygon.strokeWidth > 0
          ? `stroke="${escapeXml(polygon.stroke)}" stroke-width="${round(polygon.strokeWidth)}"`
          : `stroke="none"`;
      return `  <polygon points="${points}" fill="${escapeXml(polygon.fill)}" ${stroke} opacity="${round(polygon.opacity)}" />`;
    })
    .join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(minX)} ${round(minY)} ${round(width)} ${round(height)}">\n${polygons}\n</svg>\n`;

  downloadBlob(svg, "polydraw-logo.svg", "image/svg+xml");
  showToast("SVG exported.");
}

function downloadBlob(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function promptForFileName(message: string, defaultFileName: string, extension: string): string | null {
  const fileName = window.prompt(message, defaultFileName);
  if (fileName === null) {
    return null;
  }

  const trimmedFileName = fileName.trim();
  if (!trimmedFileName) {
    return defaultFileName;
  }

  return trimmedFileName.toLowerCase().endsWith(extension) ? trimmedFileName : `${trimmedFileName}${extension}`;
}

function getSavedJsonFileName(): string {
  return window.localStorage.getItem(JSON_FILE_NAME_STORAGE_KEY) || "untitled.json";
}

function saveJsonFileName(fileName: string) {
  window.localStorage.setItem(JSON_FILE_NAME_STORAGE_KEY, fileName);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isTopLevelWindow(): boolean {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

async function importJson(file: File) {
  try {
    const text = await file.text();
    documentState = parseDrawingFile(JSON.parse(text));
    gridSizeInput.value = String(documentState.gridSize);
    clearSelection();
    draftVertices = [];
    markChanged();
    centerView();
    showToast("Drawing loaded.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load drawing";
    showToast(message);
  } finally {
    fileInput.value = "";
  }
}

function showToast(message: string) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 2200);
}

function showShortcuts() {
  if (!shortcutDialog.open) {
    shortcutDialog.showModal();
  }
}

function closeShortcuts() {
  if (shortcutDialog.open) {
    shortcutDialog.close();
  }
}

function createId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pointsEqual(a: Point | undefined, b: Point | undefined): boolean {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => {
    switch (character) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return character;
    }
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => {
    switch (character) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement;
}

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextMode = button.dataset.tool;
    if (nextMode === "draw" || nextMode === "select" || nextMode === "pan") {
      setMode(nextMode);
    }
  });
});

gridSizeInput.addEventListener("change", () => {
  documentState.gridSize = Math.round(clamp(Number(gridSizeInput.value), MIN_GRID, MAX_GRID));
  gridSizeInput.value = String(documentState.gridSize);
  documentState.polygons = documentState.polygons.map((polygon) => ({
    ...polygon,
    vertices: polygon.vertices.map(snapPoint),
    snapAnchor: snapPoint(polygon.snapAnchor),
  }));
  draftVertices = draftVertices.map(snapPoint);
  markChanged("Grid updated.");
  draw();
});

fillColorInput.addEventListener("input", () => {
  saveEditorSettings();
  applyStyleInputsToSelection();
});
strokeColorInput.addEventListener("input", () => {
  saveEditorSettings();
  applyStyleInputsToSelection();
});
strokeWidthInput.addEventListener("change", () => {
  saveEditorSettings();
  applyStyleInputsToSelection();
});
opacityInput.addEventListener("change", () => {
  saveEditorSettings();
  applyStyleInputsToSelection();
});

mustQuery<HTMLButtonElement>("#finishDraft").addEventListener("click", finishDraft);
mustQuery<HTMLButtonElement>("#cancelDraft").addEventListener("click", cancelDraft);
mustQuery<HTMLButtonElement>("#saveJson").addEventListener("click", exportJson);
mustQuery<HTMLButtonElement>("#loadJson").addEventListener("click", () => fileInput.click());
mustQuery<HTMLButtonElement>("#saveSvg").addEventListener("click", exportSvg);
undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);
mustQuery<HTMLButtonElement>("#clearAll").addEventListener("click", () => {
  if (documentState.polygons.length === 0 && draftVertices.length === 0) {
    return;
  }
  const confirmed = window.confirm("Clear all polygons from this browser drawing?");
  if (!confirmed) {
    return;
  }
  documentState.polygons = [];
  draftVertices = [];
  clearSelection();
  markChanged("Canvas cleared.");
  draw();
});
mustQuery<HTMLButtonElement>("#zoomIn").addEventListener("click", () => zoomAt({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }, 1.18));
mustQuery<HTMLButtonElement>("#zoomOut").addEventListener("click", () => zoomAt({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }, 1 / 1.18));
mustQuery<HTMLButtonElement>("#centerView").addEventListener("click", centerView);
mustQuery<HTMLButtonElement>("#resetView").addEventListener("click", resetView);
mustQuery<HTMLButtonElement>("#showShortcuts").addEventListener("click", showShortcuts);
mustQuery<HTMLButtonElement>("#closeShortcuts").addEventListener("click", closeShortcuts);

contextActions.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-context-action]");
  if (!button) {
    return;
  }

  button.closest("details")?.removeAttribute("open");
  const action = button.dataset.contextAction;
  if (action === "copy-selection") {
    copySelection();
  } else if (action === "duplicate-selection") {
    duplicateSelection();
  } else if (action === "group-selection") {
    groupSelection();
  } else if (action === "ungroup-selection") {
    ungroupSelection();
  } else if (action === "bring-front") {
    moveSelectionLayer("front");
  } else if (action === "send-back") {
    moveSelectionLayer("back");
  } else if (action === "move-layer-up") {
    moveSelectionLayer("up");
  } else if (action === "move-layer-down") {
    moveSelectionLayer("down");
  } else if (action === "delete-selection") {
    deleteSelection();
  } else if (action === "delete-vertex") {
    deleteSelectedVertex();
  } else if (action === "snap-vertex") {
    snapSelectedVertex();
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) {
    void importJson(file);
  }
});

shortcutDialog.addEventListener("click", (event) => {
  if (event.target === shortcutDialog) {
    closeShortcuts();
  }
});

objectListItems.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-object-id]");
  if (!button) {
    return;
  }

  const polygon = documentState.polygons.find((item) => item.id === button.dataset.objectId);
  if (!polygon) {
    return;
  }

  setSelection(getSelectionIdsForPolygon(polygon), polygon.id);
  objectList.removeAttribute("open");
  setMode("select");
  draw();
});

canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("auxclick", (event) => event.preventDefault());
canvas.addEventListener("mousedown", (event) => {
  if (event.button === 1) {
    event.preventDefault();
  }
});

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  const screen = getPointerPoint(event);
  lastPointerWorld = screenToWorld(screen);
  lastPointerSnap = snapPoint(lastPointerWorld);
  snapIsDisabled = event.shiftKey;

  if (event.button === 1 || event.button === 2 || spaceIsDown || mode === "pan") {
    event.preventDefault();
    dragState = {
      kind: "pan",
      startX: event.clientX,
      startY: event.clientY,
      viewX: viewport.x,
      viewY: viewport.y,
    };
    syncCanvasCursor();
    return;
  }

  if (mode === "draw") {
    if (event.detail > 1) {
      finishDraft();
      return;
    }
    addDraftVertex(getPlacementPoint(lastPointerWorld, event.shiftKey));
    return;
  }

  if (mode === "select") {
    selectAt(lastPointerWorld, event.shiftKey);
    syncCanvasCursor();
    draw();
  }
});

canvas.addEventListener("pointermove", (event) => {
  const screen = getPointerPoint(event);
  lastPointerWorld = screenToWorld(screen);
  lastPointerSnap = snapPoint(lastPointerWorld);
  snapIsDisabled = event.shiftKey;

  if (dragState?.kind === "pan") {
    viewport.x = dragState.viewX + event.clientX - dragState.startX;
    viewport.y = dragState.viewY + event.clientY - dragState.startY;
  } else if (dragState?.kind === "vertex") {
    selectedPolygonId = dragState.polygonId;
    selectedVertexIndex = dragState.vertexIndex;
    moveSelectedVertex(getPlacementPoint(lastPointerWorld, event.shiftKey));
  } else if (dragState?.kind === "polygon") {
    movePolygons(dragState.polygonIds, lastPointerWorld, event.shiftKey);
  } else if (dragState?.kind === "marquee") {
    dragState.currentWorld = lastPointerWorld;
  }

  draw();
});

canvas.addEventListener("pointerup", () => {
  if (dragState?.kind === "vertex" || dragState?.kind === "polygon") {
    markChanged();
  } else if (dragState?.kind === "marquee") {
    selectByMarquee(dragState);
  } else if (dragState?.kind === "pan") {
    saveViewport();
  }
  dragState = null;
  syncCanvasCursor();
  draw();
});

canvas.addEventListener("pointercancel", () => {
  if (dragState?.kind === "pan") {
    saveViewport();
  }
  dragState = null;
  syncCanvasCursor();
  draw();
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.001);
    zoomAt(getPointerPoint(event), factor);
  },
  { passive: false },
);

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const isCommand = event.ctrlKey || event.metaKey;

  if (shortcutDialog.open) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeShortcuts();
    }
    return;
  }

  if ((event.key === "?" && !isCommand) || (isCommand && event.key === "/")) {
    event.preventDefault();
    showShortcuts();
    return;
  }

  if (isCommand && key === "s") {
    event.preventDefault();
    void exportJson();
    return;
  }

  if (isCommand && key === "o") {
    event.preventDefault();
    fileInput.click();
    return;
  }

  if (isCommand && key === "e") {
    event.preventDefault();
    exportSvg();
    return;
  }

  if (isEditableTarget(event.target)) {
    return;
  }

  if (isCommand && key === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }

  if (isCommand && key === "y") {
    event.preventDefault();
    redo();
    return;
  }

  if (isCommand && key === "c") {
    event.preventDefault();
    copySelection();
    return;
  }

  if (isCommand && key === "v") {
    event.preventDefault();
    pasteSelection();
    return;
  }

  if (isCommand && key === "g") {
    event.preventDefault();
    if (event.shiftKey) {
      ungroupSelection();
    } else {
      groupSelection();
    }
    return;
  }

  if (isCommand && event.key === "]") {
    event.preventDefault();
    moveSelectionLayer(event.shiftKey ? "front" : "up");
    return;
  }

  if (isCommand && event.key === "[") {
    event.preventDefault();
    moveSelectionLayer(event.shiftKey ? "back" : "down");
    return;
  }

  if (key === "d") {
    event.preventDefault();
    setMode("draw");
    return;
  }

  if (key === "v") {
    event.preventDefault();
    setMode("select");
    return;
  }

  if (key === "h") {
    event.preventDefault();
    setMode("pan");
    return;
  }

  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomAt({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }, 1.18);
    return;
  }

  if (event.key === "-" || event.key === "_") {
    event.preventDefault();
    zoomAt({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }, 1 / 1.18);
    return;
  }

  if (event.key === "0") {
    event.preventDefault();
    centerView();
    return;
  }

  if (event.key === "1") {
    event.preventDefault();
    resetView();
    return;
  }

  if (event.code === "Space" && !event.repeat) {
    event.preventDefault();
    spaceIsDown = true;
    syncCanvasCursor();
  }

  if (event.key === "Shift") {
    snapIsDisabled = true;
    draw();
  }

  if (event.key === "Enter" && mode === "draw") {
    finishDraft();
  }

  if (event.key === "Escape") {
    cancelDraft();
    clearSelection();
    draw();
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (!isTyping) {
      event.preventDefault();
      deleteSelection();
    }
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    spaceIsDown = false;
    syncCanvasCursor();
  }

  if (event.key === "Shift") {
    snapIsDisabled = false;
    draw();
  }
});

window.addEventListener("resize", resizeCanvas);

resizeCanvas();
if (!loadViewport()) {
  centerView();
} else {
  draw();
}
setMode(mode);
updateHistoryButtons();
