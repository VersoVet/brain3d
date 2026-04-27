# Brain3D Architecture

## Overview

Brain3D est le **visualiseur 3D temps réel** du système Onyx. Il affiche l'état complet du Cerebellum:
- État de tous les skills
- Machines connectées
- Relations machines ↔ skills
- Métriques en temps réel
- Événements système

**Version:** 3.1.0  
**Brain Area:** cerebellum  
**Port:** 8888  
**Infrastructure:** Redis + OnyxCore + onyx-infra

---

## Architecture Générale

```
┌─────────────────────────────────────────────────────────┐
│                   Browser / Client                       │
│              (WebSocket connection)                      │
└────────────────────────┬────────────────────────────────┘
                         │
                         │ WS /ws
                         │
┌────────────────────────▼────────────────────────────────┐
│                     Brain3D (Port 8888)                 │
│              (FastAPI + Jinja2 + Three.js)              │
├─────────────────────────────────────────────────────────┤
│ • WebSocketManager  (manage clients)                    │
│ • StateManager      (aggregates data)                   │
│ • RedisClient       (subscribe to events)               │
│ • DataClient        (fetch from external services)      │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
      Redis          OnyxCore        onyx-infra
    (6379)           (8050)           (8053)
    Events          Registry         Infrastructure
```

---

## Data Flow

### 1. Initialization

```
Brain3D Start
    ├─ Load Config (Redis URL, Core URL, etc.)
    ├─ Connect to Redis (6379)
    ├─ Subscribe to channels:
    │   ├─ onyx:events
    │   ├─ onyx:skill:status
    │   └─ onyx:machines
    ├─ Load initial state from OnyxCore
    └─ Start FastAPI server on 0.0.0.0:8888
```

### 2. Real-time Updates

```
Redis Event
    │
    ├─ RedisClient receives message
    │
    ├─ StateManager processes:
    │   ├─ skill.registered
    │   ├─ skill.status_changed
    │   ├─ machine.connected
    │   └─ machine.disconnected
    │
    ├─ WebSocketManager broadcasts to all clients
    │
    └─ Browsers receive update + re-render 3D scene
```

### 3. Client Request

```
Browser GET /api/state
    │
    ├─ DataClient.get_full_state()
    │   ├─ Fetch from Redis (latest state)
    │   ├─ Fetch from OnyxCore (registry)
    │   └─ Fetch from onyx-infra (devices)
    │
    ├─ StateManager.aggregate()
    │   ├─ Merge all sources
    │   ├─ Build node/link graph
    │   └─ Compute positions (force-directed)
    │
    └─ Return JSON with nodes + links
```

---

## Module Structure

```
src/
├── main.py                 # FastAPI app, routes, server startup
├── config.py               # Configuration (Redis URL, etc.)
├── models.py               # Pydantic models (Node, Link, etc.)
│
├── redis_client.py         # Redis subscriber + pub/sub
├── state_manager.py        # Data aggregation + graph building
├── data_client.py          # HTTP clients (Core, infra)
├── websocket_manager.py    # WebSocket connections
│
├── modules/
│   └── visualization/      # 3D visualization service
│       ├── service.py
│       └── tests/
│           └── test_visualization.py
│
├── static/
│   └── js/
│       ├── main.js         # Three.js initialization
│       ├── machines.js     # Machine node rendering
│       ├── connections.js  # Link rendering
│       ├── animations.js   # Force-directed layout
│       └── websocket.js    # WS event handling
│
└── templates/
    └── index.html          # Jinja2 template
```

---

## Components

### 1. RedisClient (`redis_client.py`)

**Responsibility:** Écouter les événements Redis en temps réel

```python
class RedisClient:
    async def start()           # Connect + subscribe to channels
    async def listen()          # Receive messages
    async def on_event()        # Process skill status changes
```

**Channels Subscribed:**
- `onyx:events` → système d'événements OnyxCore
- `onyx:skill:status` → statuts des skills (SDK 2.1+)
- `onyx:machines` → enregistrement des machines

---

### 2. StateManager (`state_manager.py`)

**Responsibility:** Agréger et synthétiser l'état du système

```python
class StateManager:
    async def get_full_state()      # Current system state
    async def load_and_aggregate()  # Fetch from all sources
    def build_graph()               # Create nodes + links
    def compute_positions()         # Force-directed layout
```

**Data Sources:**
1. **Redis** — Événements en temps réel
2. **OnyxCore** — Registry (skills + machines)
3. **onyx-infra** — Infrastructure physique (devices, WoL)

---

### 3. DataClient (`data_client.py`)

**Responsibility:** Récupérer les données des services externes

```python
class DataClient:
    async def get_skills()          # From OnyxCore
    async def get_machines()        # From OnyxCore
    async def get_devices()         # From onyx-infra
    async def get_infrastructure()  # From onyx-infra
```

**Services Callés:**
- `http://10.0.0.44:8050` (OnyxCore)
- `http://10.0.0.44:8053` (onyx-infra)

---

### 4. WebSocketManager (`websocket_manager.py`)

**Responsibility:** Gérer les connexions WebSocket des clients

```python
class WebSocketManager:
    async def connect()             # New client
    async def disconnect()          # Client leaves
    async def broadcast()           # Send to all clients
    async def broadcast_state_update()  # Send full state
```

**Client Events:**
- `skill_status_changed` — Skill online/offline
- `machine_connected` — Machine enrollment
- `state_updated` — Full refresh

---

## Graph Structure

### Nodes

```json
{
  "id": "onyx-core",
  "type": "skill",            // "skill", "machine", "area"
  "label": "OnyxCore",
  "status": "online",         // "online", "offline", "unknown"
  "brain_area": "cerebellum",
  "port": 8050,
  "x": 100.5,                 // 3D position (computed)
  "y": 200.3,
  "z": 50.2,
  "data": { ... }             // Extra metadata
}
```

### Links

```json
{
  "source": "oxya",           // Machine ID
  "target": "onyx-core",      // Skill name
  "type": "deployed",         // "deployed", "depends_on", "communicates"
  "status": "active"
}
```

---

## 3D Visualization (Frontend)

### Technology Stack
- **Three.js** — 3D rendering
- **Force-Graph** — Force-directed layout (alternativement custom layout)
- **WebSocket** — Real-time updates

### Rendering

1. **Initialization**
   - Create Three.js scene
   - Load initial state from `/api/state`
   - Build 3D graph from nodes + links

2. **Interaction**
   - Mouse controls: rotate, zoom
   - Hover node → show details
   - Click node → focus + highlight

3. **Real-time Updates**
   - WS message arrives
   - StateManager broadcasts to all clients
   - Frontend re-renders affected nodes/links
   - Smooth transitions + animations

---

## Configuration

### Environment Variables

```bash
# Redis
REDIS_URL=redis://10.0.0.44:6379

# OnyxCore
ONYX_CORE_URL=http://10.0.0.44:8050

# onyx-infra
NETWORK_INVENTORY_URL=http://10.0.0.44:8053

# Server
BRAIN3D_HOST=0.0.0.0
BRAIN3D_PORT=8888
BRAIN3D_DEV=false
```

### File: `src/config.py`

```python
REDIS_URL = os.getenv("REDIS_URL", "redis://10.0.0.44:6379")
CORE_URL = os.getenv("ONYX_CORE_URL", "http://10.0.0.44:8050")
INFRA_URL = os.getenv("NETWORK_INVENTORY_URL", "http://10.0.0.44:8053")
```

---

## Deployment

### Development
```bash
cd /home/onyx/projects/skills/brain3d
python -m src.main
```

### Production
```bash
# On 10.0.0.44
cd /opt/onyx/skills/brain3d
python -m src.main &
# Listens on 0.0.0.0:8888
```

### Health Check
```bash
curl http://10.0.0.44:8888/health
```

---

## Dependencies

### Python Packages
- **fastapi** — Web framework
- **uvicorn** — ASGI server
- **redis** — Redis client
- **httpx** — Async HTTP
- **pydantic** — Data validation
- **jinja2** — Templating
- **websockets** — WebSocket support

### External Services
- **Redis** (10.0.0.44:6379) — Event bus
- **OnyxCore** (10.0.0.44:8050) — Registry + orchestration
- **onyx-infra** (10.0.0.44:8053) — Infrastructure data

---

## Performance Considerations

1. **WebSocket Optimization**
   - Delta updates (only changed nodes/links)
   - Message batching (max 100 events per second)
   - Client-side throttling

2. **Data Aggregation**
   - Cache full state (TTL: 5 seconds)
   - Lazy load device details
   - Parallel HTTP requests to Core + infra

3. **3D Rendering**
   - LOD (Level of Detail) for large networks
   - Frustum culling (only render visible nodes)
   - WebGL 2.0 for performance

---

## Testing

### Unit Tests
```bash
pytest src/modules/visualization/tests/
```

### Integration Tests
```bash
pytest tests/test_integration.py
```

### Manual Testing
```bash
# Health check
curl http://10.0.0.44:8888/health

# Get state
curl http://10.0.0.44:8888/api/state

# WebSocket (wscat)
wscat -c ws://10.0.0.44:8888/ws
```

---

## Future Enhancements

- [ ] Clustering visualization (group nodes by area)
- [ ] Timeline replay (scrub through events)
- [ ] Metrics dashboard (CPU, memory, disk)
- [ ] Alert notifications (skill failures)
- [ ] Custom layouts (tree, circular, etc.)
