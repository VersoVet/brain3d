# Brain3D - TODO & Roadmap

## Current Status: In Progress (65%)

Target: Fully functional 3D visualization dashboard for Cerebellum area  
Last Updated: 2026-04-27

---

## Phase 1: Core Architecture (DONE ✅)

- [x] FastAPI + uvicorn server setup
- [x] Redis integration (subscribe to events)
- [x] WebSocket real-time updates
- [x] Three.js + force-directed layout
- [x] Static assets (HTML, CSS, JS)

---

## Phase 2: Data Integration (DONE ✅)

- [x] RedisClient — Listen to onyx:events, onyx:skill:status
- [x] DataClient — HTTP clients for OnyxCore + onyx-infra
- [x] StateManager — Aggregate data from all sources
- [x] WebSocketManager — Manage concurrent client connections

---

## Phase 3: API Endpoints (DONE ✅)

- [x] GET /health — Health check
- [x] GET /status — Service status
- [x] GET /api/state — Full system state
- [x] GET /api/machines — List machines
- [x] GET /api/skills — List skills
- [x] GET /api/areas — List brain areas
- [x] POST /api/refresh — Force data refresh
- [x] WS /ws — WebSocket connection

---

## Phase 4: 3D Visualization (85% - In Progress)

### Completed
- [x] Three.js scene setup
- [x] Node rendering (skills, machines, areas)
- [x] Link rendering (deployed, communicates)
- [x] Force-directed layout algorithm
- [x] Mouse controls (rotate, zoom, pan)
- [x] Node hover tooltips
- [x] Status colors (online=green, offline=red, unknown=gray)
- [x] WebSocket real-time node/link updates

### TODO
- [ ] Node animation on status change (smooth transitions)
- [ ] Click to focus node (center + highlight)
- [ ] Draggable nodes (temporary, reset on update)
- [ ] Search/filter nodes by name
- [ ] Metrics dashboard (CPU, memory, disk % for machines)

---

## Phase 5: Data Sources (IN PROGRESS)

### Redis Integration ✅
- [x] Subscribe to onyx:events
- [x] Subscribe to onyx:skill:status
- [x] Subscribe to onyx:machines
- [x] Parse incoming messages
- [x] Update StateManager

### OnyxCore Integration ✅
- [x] GET /skills (list all)
- [x] GET /machines (list all)
- [x] GET /cerebellum/state (aggregated state)

### onyx-infra Integration ⚠️ (Partial)
- [x] GET /infrastructure/full (devices, GLPI)
- [x] GET /devices (list)
- [ ] Real-time device metrics (CPU, memory, disk)
- [ ] GLPI sync for asset tracking

---

## Phase 6: Performance & Optimization (PENDING)

- [ ] Implement caching strategy (Redis, in-memory)
- [ ] Optimize graph layout for 1000+ nodes
- [ ] WebSocket message batching/throttling
- [ ] 3D rendering LOD (Level of Detail)
- [ ] Lazy load device details (don't fetch all at startup)

---

## Phase 7: Testing (PENDING)

- [ ] Unit tests for StateManager
- [ ] Unit tests for RedisClient
- [ ] Unit tests for DataClient
- [ ] Integration tests with mock Redis + OnyxCore
- [ ] WebSocket stress test (100+ concurrent clients)

---

## Phase 8: Documentation (IN PROGRESS ✅)

- [x] API.md — Complete endpoint documentation
- [x] ARCHITECTURE.md — System design + components
- [x] TODO.md — This file (updated)
- [ ] README.md — Quick start guide (optional)

---

## Phase 9: Deployment (PENDING)

- [ ] Fix Forge validation errors:
  - [ ] Reduce src/main.py < 300 lines (currently 324)
  - [ ] Reduce src/data_client.py < 300 lines (currently 470)
  - [ ] Reduce src/state_manager.py < 300 lines (currently 364)
  - [ ] Fix Ruff linting (310 warnings)
  - [ ] Fix mypy type checking (14 errors)
  - [ ] Add missing .gitignore patterns
  - [ ] Create dev branch
  - [ ] Add OnyxClient SDK integration

- [ ] Deploy to 10.0.0.44 (OnyxSoma)
- [ ] Configure systemd service
- [ ] Set up health monitoring

---

## Known Issues

### 1. File Size Overages 🔴
- `src/main.py` — 324 lines (limit: 300)
  - Solution: Extract routes to modules
- `src/data_client.py` — 470 lines (limit: 300)
  - Solution: Split into separate client classes
- `src/state_manager.py` — 364 lines (limit: 300)
  - Solution: Split aggregation + layout logic

### 2. Linting Issues ⚠️
- 310+ Ruff warnings (docstrings, imports, type hints)
- Solution: Run `ruff check src/ --fix`

### 3. Type Checking ⚠️
- mypy: 14 errors in models.py, redis_client.py, state_manager.py
- Solution: Add proper type annotations

### 4. Missing SDK Integration ⚠️
- OnyxClient not imported (required for visibility)
- Solution: Add `from onyx_sdk import OnyxClient, SkillStatus`

### 5. Deployment Location 🔴
- Currently running on 10.0.0.13 (dev machine)
- Should run on 10.0.0.44 (production)
- Solution: Validate + deploy to OnyxSoma

---

## Recent Changes (April 2026)

### 2026-04-27
- ✅ Rewrote API.md (new Redis-based architecture)
- ✅ Rewrote ARCHITECTURE.md (removed Hearts references)
- ✅ Updated manifest.json (Forge 3-section format)
- ✅ Added onyx-sdk to requirements.txt
- ✅ Created src/modules/visualization/ structure
- ⏳ Pending: Reduce file sizes, fix linting, deploy

### 2026-01-15
- Updated WebSocket to handle real-time state updates
- Improved force-directed layout performance

### 2026-01-04
- Initial Brain3D 3.0 implementation
- Three.js visualization with force-directed graph

---

## Priorities

### 🔴 High (Blocking Deployment)
1. Reduce file sizes (main, data_client, state_manager < 300 lines each)
2. Fix Forge validation errors (linting, type checking)
3. Add OnyxClient SDK integration
4. Create dev branch for development

### 🟡 Medium (Should Do)
1. Add node animations (smooth transitions)
2. Implement caching strategy
3. Fix mypy type checking

### 🟢 Low (Nice to Have)
1. Search/filter nodes
2. Metrics dashboard overlay
3. Timeline/history replay
4. Custom layout algorithms

---

## Next Steps

1. **File Refactoring** (URGENT)
   - Extract main.py routes → modules/api/
   - Split data_client.py → modules/data/
   - Split state_manager.py → modules/state/

2. **Validation Pass**
   - Run Ruff fix
   - Run mypy check
   - Update .gitignore
   - Create dev branch

3. **Deployment**
   - Validate with Forge
   - Deploy to 10.0.0.44
   - Configure systemd

4. **Testing**
   - Manual testing
   - Load testing (concurrent WS)
   - Monitor in production

---

## Resources

- **Repo:** VersoVet/brain3d
- **Port:** 8888 (production), 9888 (dev)
- **Dependencies:** Redis, OnyxCore, onyx-infra
- **Framework:** FastAPI + Three.js
