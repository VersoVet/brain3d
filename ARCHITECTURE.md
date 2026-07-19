# Brain3D Architecture (v3.2 - Full Redis)

**Last Updated:** 2026-07-19

## Overview

Brain3D est le **visualiseur 3D temps réel** du système Onyx pour le Cerebellum. Il agrège les données du Cerebellum via:
- **Redis** pour les événements et les statuts des skills (real-time pub/sub)
- **OnyxCore** pour la structure et les relations machines/skills (registry)
- **onyx-infra** pour les données d'infrastructure physique (network inventory)

**Version:** 3.2.0 (Full Redis + Overlay)  
**Brain Area:** cerebellum  
**Port:** 8888 (prod), 9888 (dev)  
**Framework:** FastAPI + Three.js

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Browser / Client                   │
│              (WebSocket connection)                 │
└────────────────────┬────────────────────────────────┘
                     │
                     │ WS /ws
                     │
┌────────────────────▼────────────────────────────────┐
│            Brain3D (Port 8888 / 9888)               │
│          (FastAPI + Jinja2 + Three.js)              │
├─────────────────────────────────────────────────────┤
│ • main.py                  (app factory, routes)    │
│ • WebSocketManager         (client connections)     │
│ • StateManager             (cache + indexes)        │
│ • CoreWsClient             (Core WebSocket events)  │
│ • RedisSubscriber          (Redis pub/sub)          │
│ • DataClient               (HTTP to Core + infra)   │
│ • modules/api/routes       (FastAPI endpoints)      │
│ • modules/data/{merger,    (data transformation)    │
│   area_builder}            (pure logic)             │
└────────────────────┬────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
      Redis       OnyxCore   onyx-infra
      (6379)      (8050)     (8053)
      Events      Registry   Infrastructure
```

---

## Module Structure

```
src/
├── main.py                 (~161 lines) - FastAPI app, lifespan, server
├── config.py               - Configuration (URLs, enums, colors)
├── models.py               - Pydantic models (Machine, Skill, Area, etc.)
├── data_client.py          (~232 lines) - HTTP clients for Core/infra
├── state_manager.py        (~299 lines) - Cache, indexing, refresh logic
├── core_ws_client.py       (~155 lines) - OnyxCore WebSocket subscriber
├── redis_client.py         - Redis subscriber (pub/sub handler)
├── websocket_manager.py    - FastAPI WebSocket manager
│
├── modules/
│   ├── data/               - Data layer (pure transformation)
│   │   ├── merger.py       (~233 lines) - Machine fusion + coherence
│   │   ├── area_builder.py (~85 lines) - Brain area extraction
│   │   └── tests/
│   │
│   ├── api/                - API routes layer
│   │   ├── routes.py       (~268 lines) - All FastAPI endpoints
│   │   └── tests/
│   │
│   └── visualization/      - (stub) 3D visualization helpers
│       ├── service.py
│       └── tests/
│
├── static/                 - Frontend assets (Three.js, CSS, etc.)
│   └── js/                 - JavaScript (main, machines, connections)
│
└── templates/
    └── index.html          - Jinja2 main page

```

---

## Data Flow

### 1. Initialization (Startup)

```
App Start
  ├─ Load Config (Redis, Core, infra URLs)
  ├─ Initialize DataClient (HTTP clients)
  ├─ Initialize StateManager (cache + indexes)
  ├─ Initialize WebSocketManager
  ├─ Connect to Redis (subscribe to channels)
  ├─ Load initial state (refresh_all)
  ├─ Start CoreWsClient (Web Socket to Core)
  └─ Serve frontend on port 8888
```

### 2. Real-time Updates

**Via Redis:**
```
Redis Event (onyx:events, onyx:skill:status)
  ├─ RedisSubscriber receives message
  ├─ StateManager processes:
  │   ├─ update machine metrics
  │   ├─ update skill status
  │   └─ invalidate cache if needed
  ├─ WebSocketManager broadcasts to all clients
  └─ Browsers re-render 3D scene
```

**Via Core WebSocket:**
```
Core Event (skill:registered, deploy:completed, etc.)
  ├─ CoreWsClient receives
  ├─ Triggers full refresh or inline update
  ├─ StateManager updates cache
  └─ WebSocketManager broadcasts
```

### 3. HTTP Request Flow

```
Browser GET /api/state
  ├─ StateManager.refresh_if_stale()
  │   ├─ If cache expired: refresh_all()
  │   │   ├─ DataClient.get_full_state() (parallel):
  │   │   │   ├─ _get_nodes_from_core()
  │   │   │   ├─ _get_skills_from_core()
  │   │   │   ├─ _get_devices_from_network_inventory()
  │   │   │   ├─ _get_deploy_matrix_from_core()
  │   │   │   └─ Query each Heart in parallel
  │   │   │
  │   │   ├─ merger.merge_machines_with_coherence():
  │   │   │   ├─ Detect incoherences
  │   │   │   ├─ Determine machine types
  │   │   │   └─ Aggregate local + expected skills
  │   │   │
  │   │   └─ area_builder.extract_areas():
  │   │       ├─ Group skills by brain_area
  │   │       ├─ Compute area status
  │   │       └─ Build Area objects
  │   │
  │   └─ Update _machines, _skills, _areas indexes
  │
  ├─ Return cached NetworkState
  └─ Browser renders 3D visualization
```

---

## Key Components

### main.py (~161 lines)
- FastAPI app initialization
- Lifespan context (startup/shutdown)
- Static file mounting
- Template rendering for index.html
- Entry point (uvicorn runner)
- Stores components in app.state for routes

### StateManager (~299 lines)
- **Cache Management**: TTL-based refresh
- **Indexing**: Fast O(1) lookups by ID/name
- **Redis Event Handler**: Processes 5+ event types
- **Getters**: get_machine(), get_skill(), get_skills_by_area()
- **Visual Config**: Returns shape/color/animation for 3D
- **Delegates to**:
  - DataClient for data fetching
  - CoreWsClient for Core events
  - WebSocketManager for broadcasting

### DataClient (~232 lines)
- **HTTP Clients**: Async calls to Core + infra
- **Orchestrator**: Calls 4 HTTP endpoints in parallel
- **Heart Queries**: Async queries to each machine
- **Delegates to**:
  - merger.py for fusion logic
  - area_builder.py for area extraction

### modules/data/merger.py (~233 lines)
**Pure transformation logic (no HTTP):**
- `build_expected_skills_by_node()` - Parse deploy matrix
- `parse_heart_skills()` - Convert Heart response → LocalSkill
- `detect_incoherences()` - Compare local vs expected skills
- `merge_machines_with_coherence()` - Combine Core + Heart + network data
- `determine_machine_type()` - Classify machine by hostname

### modules/data/area_builder.py (~85 lines)
**Brain area aggregation:**
- `extract_areas()` - Group skills by brain_area
- `compute_area_status()` - Priority-based status (ERROR > WORKING > UP > DOWN)
- `format_area_name()` - kebab-case → Title Case

### modules/api/routes.py (~268 lines)
**FastAPI router with all endpoints:**
- GET `/health` - Health check
- GET `/status` - Detailed status
- GET/POST `/api/*` - All data endpoints
- WS `/ws` - WebSocket connection
- All routes are stateless (depend on app.state)

### CoreWsClient (~155 lines)
**OnyxCore WebSocket subscription:**
- Auto-reconnect loop (5s retry)
- Event dispatcher (refresh vs inline updates)
- Direct access to state_manager cache for updates

---

## Type Safety & Code Quality

| Metric | Target | Status |
|--------|--------|--------|
| **File Size** | < 300 lines/file | ✅ All modules compliant |
| **Type Hints** | 100% public functions | 🟡 95% (inherited code) |
| **Docstrings** | Google convention | ✅ 80%+ coverage |
| **Imports** | Absolute (from src.xxx) | ✅ All compliant |
| **Linting** | Ruff zero warnings | 🟡 Minor docstring issues |
| **Tests** | Unit + integration | 🟡 Basic structure in place |

---

## Performance

- **Cache TTL**: 5 seconds (configurable)
- **Parallel HTTP**: 4 Core/infra calls + N Heart queries
- **WebSocket Batching**: Broadcast to all clients in O(1)
- **Real-time Events**: < 100ms latency (Redis → browser)
- **3D Rendering**: Three.js + force-directed layout

---

## Dependencies

- **fastapi** - Web framework
- **uvicorn** - ASGI server
- **pydantic** - Data validation
- **httpx** - Async HTTP client
- **redis** - Redis subscriber
- **websockets** - WebSocket support
- **jinja2** - Templates
- **three.js** (frontend) - 3D rendering

---

## Testing

```bash
# Unit tests
pytest src/modules/data/tests/
pytest src/modules/api/tests/

# Integration tests
pytest tests/test_integration.py

# Type checking
mypy src/ --strict

# Linting
ruff check src/

# Manual health check
curl http://localhost:8888/health
```

---

## Recent Changes (Refactoring v3.1)

### Code Modularization
- Extracted 170+ lines of pure logic into merger.py
- Separated API routes into dedicated module
- Extracted Core WebSocket into separate client
- Reduced main.py from 324 → 161 lines

### Compliance
- All files now < 300 lines (Forge Phase 15)
- Added type hints + docstrings
- Organized imports (absolute from src.xxx)
- Created proper module structure

### Architecture Improvement
- Clear separation of concerns (data, API, WebSocket)
- Pure functions for transformation (merger, area_builder)
- Dependency injection via constructor
- Type-safe with Pydantic models

---

## Future Enhancements

- [ ] Caching strategy (Redis, in-memory)
- [ ] WebSocket message batching/throttling
- [ ] 3D LOD (Level of Detail) for 1000+ nodes
- [ ] Lazy load device details
- [ ] Clustering visualization
- [ ] Timeline replay (event history)
- [ ] Metrics dashboard overlay
