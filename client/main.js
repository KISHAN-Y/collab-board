import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import Konva from 'konva';

// --- State ---
const state = {
    tool: 'select', // 'select', 'pen', 'rect', 'circle'
    color: '#ffffff',
    strokeWidth: 4,
    isDrawing: false,
    currentShapeId: null,
};

// --- CRDT Setup ---
const ydoc = new Y.Doc();
// Connect to the Python FastAPI WebSocket Server
const provider = new WebsocketProvider('ws://localhost:3000', 'ws/board-room', ydoc);
const yShapes = ydoc.getMap('shapes'); // The shared map of all objects on canvas
const awareness = provider.awareness;

// --- User Profile ---
// Generate a unique color and name for this user's cursor
const userColor = '#' + Math.floor(Math.random() * 16777215).toString(16);
const userName = 'User ' + Math.floor(Math.random() * 100);
awareness.setLocalStateField('user', { name: userName, color: userColor });


// --- Konva Setup ---
const container = document.getElementById('canvas-container');
const stage = new Konva.Stage({
    container: 'canvas-container',
    width: window.innerWidth,
    height: window.innerHeight,
});
const layer = new Konva.Layer();
stage.add(layer);

// Handle Window Resize
window.addEventListener('resize', () => {
    stage.width(window.innerWidth);
    stage.height(window.innerHeight);
});

// Cache Konva nodes locally for fast update
const konvaNodes = new Map();

// --- CRDT -> Canvas Rendering ---
// Whenever yShapes changes (remote or local), update the canvas
yShapes.observe((event) => {
    event.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
            const data = yShapes.get(key);
            let node = konvaNodes.get(key);

            if (!node) {
                // Create new node based on type
                if (data.type === 'line') {
                    node = new Konva.Line({ ...data, id: key });
                } else if (data.type === 'rect') {
                    node = new Konva.Rect({ ...data, id: key });
                } else if (data.type === 'circle') {
                    node = new Konva.Circle({ ...data, id: key });
                }
                if (node) {
                    layer.add(node);
                    konvaNodes.set(key, node);
                }
            } else {
                // Update existing node
                node.setAttrs(data);
            }
        } else if (change.action === 'delete') {
            const node = konvaNodes.get(key);
            if (node) {
                node.destroy();
                konvaNodes.delete(key);
            }
        }
    });
});

// --- Mouse / Touch Events (Local Actions) ---

stage.on('mousedown touchstart', (e) => {
    if (state.tool === 'select') return; // Selection handled by Konva internally (draggability to be added)

    state.isDrawing = true;
    const pos = stage.getPointerPosition();
    const id = `shape_${ydoc.clientID}_${Date.now()}`;
    state.currentShapeId = id;

    const baseAttrs = {
        stroke: state.color,
        strokeWidth: parseInt(state.strokeWidth),
        id: id
    };

    if (state.tool === 'pen') {
        yShapes.set(id, {
            type: 'line',
            points: [pos.x, pos.y, pos.x, pos.y],
            ...baseAttrs,
            lineCap: 'round',
            lineJoin: 'round',
            tension: 0.5
        });
    } else if (state.tool === 'rect') {
        yShapes.set(id, {
            type: 'rect',
            x: pos.x,
            y: pos.y,
            width: 0,
            height: 0,
            ...baseAttrs,
        });
    } else if (state.tool === 'circle') {
        yShapes.set(id, {
            type: 'circle',
            x: pos.x,
            y: pos.y,
            radius: 0,
            ...baseAttrs,
        });
    }
});

stage.on('mousemove touchmove', (e) => {
    // Sync cursor position for other users
    const pos = stage.getPointerPosition();
    if (pos) {
        awareness.setLocalStateField('cursor', pos);
    }

    if (!state.isDrawing || !state.currentShapeId) return;

    const shapeData = yShapes.get(state.currentShapeId);
    if (!shapeData) return;

    // We mutate a copy and set it back to trigger Yjs sync
    const newData = { ...shapeData };

    if (state.tool === 'pen') {
        newData.points = [...newData.points, pos.x, pos.y];
    } else if (state.tool === 'rect') {
        newData.width = pos.x - newData.x;
        newData.height = pos.y - newData.y;
    } else if (state.tool === 'circle') {
        newData.radius = Math.sqrt(
            Math.pow(pos.x - newData.x, 2) + Math.pow(pos.y - newData.y, 2)
        );
    }

    yShapes.set(state.currentShapeId, newData);
});

stage.on('mouseup touchend', (e) => {
    state.isDrawing = false;
    state.currentShapeId = null;
});

// --- UI Interaction ---
const statusDot = document.querySelector('.status-indicator');
provider.on('status', event => {
    if (event.status === 'connected') {
        statusDot.classList.add('connected');
    } else {
        statusDot.classList.remove('connected');
    }
});

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelector('.tool-btn.active').classList.remove('active');
        btn.classList.add('active');
        state.tool = btn.dataset.tool;
    });
});

document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', (e) => {
        document.querySelector('.color-swatch.active').classList.remove('active');
        swatch.classList.add('active');
        state.color = swatch.dataset.color;
    });
});

document.getElementById('stroke-width').addEventListener('input', (e) => {
    state.strokeWidth = e.target.value;
});

// --- Awareness (Live Cursors & Active Users) ---
const activeUsersContainer = document.getElementById('active-users-container');
const cursorLayer = document.createElement('div');
cursorLayer.id = 'cursors';
document.body.appendChild(cursorLayer);

const cursorNodes = new Map();

awareness.on('change', () => {
    const states = awareness.getStates();

    // Render Avatars in Top Bar
    activeUsersContainer.innerHTML = '';

    states.forEach((state, clientID) => {
        if (state.user) {
            // Top bar avatar
            const avatar = document.createElement('div');
            avatar.className = 'user-avatar';
            avatar.style.backgroundColor = state.user.color;
            avatar.innerText = state.user.name.charAt(0);
            avatar.title = state.user.name;
            activeUsersContainer.appendChild(avatar);
        }

        // Live Cursor logic
        if (clientID !== ydoc.clientID && state.cursor && state.user) {
            let cursor = cursorNodes.get(clientID);
            if (!cursor) {
                cursor = document.createElement('div');
                cursor.className = 'live-cursor';
                cursor.style.setProperty('--cursor-color', state.user.color);
                cursor.innerHTML = `
          <svg viewBox="0 0 16 16"><path d="M0 0l5 16 3-6 6-3L0 0z"/></svg>
          <div class="live-cursor-label">${state.user.name}</div>
        `;
                cursorLayer.appendChild(cursor);
                cursorNodes.set(clientID, cursor);
            }
            cursor.style.transform = `translate(${state.cursor.x}px, ${state.cursor.y}px)`;
        } else if (!state.cursor && cursorNodes.has(clientID)) {
            // Remove cursor if client disconnected / went idle
            const cursor = cursorNodes.get(clientID);
            if (cursor) cursor.remove();
            cursorNodes.delete(clientID);
        }
    });

    // Cleanup disconnected cursors
    const activeIds = Array.from(states.keys());
    for (const [id, node] of cursorNodes.entries()) {
        if (!activeIds.includes(id)) {
            node.remove();
            cursorNodes.delete(id);
        }
    }
});
