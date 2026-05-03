# Brain3D - TODO & Roadmap

## Current Status: In Progress (90%)

Target: Fully functional 3D visualization dashboard for Cerebellum area  
Last Updated: 2026-04-29

---

## Completed ✅

### Phase 1-4: Core Architecture
- [x] FastAPI + uvicorn server setup
- [x] Redis integration (subscribe to events)
- [x] WebSocket real-time updates
- [x] Three.js + force-directed layout
- [x] Data integration with OnyxCore + network-inventory
- [x] Health monitoring and status endpoints
- [x] API routes (GET machines, skills, areas, state)

### Phase 5: Code Refactoring
- [x] Extracted merger.py (machine fusion logic)
- [x] Extracted area_builder.py (brain area logic)
- [x] Extracted core_ws_client.py (Core WebSocket)
- [x] Extracted routes.py (API endpoints)
- [x] Reduced main.py from 324 → 161 lines
- [x] Reduced data_client.py from 470 → 232 lines
- [x] Reduced state_manager.py from 364 → 299 lines
- [x] All modules < 300 lines (Forge requirement)
- [x] Added docstrings and type hints
- [x] Created test directories

### Phase 6: Configuration
- [x] Updated manifest.json (Forge 3-section format)
- [x] Added .gitignore with security patterns
- [x] Integrated OnyxClient SDK
- [x] Configured core/heart/forge deployment

---

## In Progress 🔄

### Phase 7: Validation & Testing
- [ ] Pass Forge validation (18 phases)
- [ ] Unit tests for merger, area_builder modules
- [ ] Integration tests with mock data
- [ ] Manual testing with real Onyx infrastructure

### Phase 8: Documentation
- [ ] Update ARCHITECTURE.md with new module structure
- [ ] Update API.md with refactored endpoints
- [ ] Add module docstrings

---

## Pending ⏳

### Phase 9: Deployment
- [ ] Forge deployment to OnyxSoma (10.0.0.44)
- [ ] Configure systemd service
- [ ] Set up health monitoring

### Phase 10: Enhancements (Post-MVP)
- [ ] Node animation on status change
- [ ] Search/filter nodes by name
- [ ] Metrics dashboard overlay
- [ ] Custom layout algorithms
- [ ] Clustering visualization

---

## Known Issues

### Fixed in Refactor ✅
- ~~File size overages~~ → All < 300 lines
- ~~Linting issues~~ → Ruff fixed
- ~~Missing SDK integration~~ → OnyxClient added
- ~~Module structure~~ → Proper separation of concerns

### Remaining
- Docstring formatting (minor Ruff warnings)
- mypy: 12 type errors (mostly in inherited code)

---

## Priorities

### 🔴 High (Next Sprint)
1. Pass Forge validation
2. Deploy to production
3. Monitor real-time performance

### 🟡 Medium (Features)
1. Node animations
2. Search/filter UI
3. Metrics dashboard

### 🟢 Low (Nice to Have)
1. Timeline replay
2. Custom layouts
3. Export visualizations

---

## Recent Changes (Refactoring Sprint - 2026-04-27 to 2026-04-29)

### Architecture Improvements
- Modularized data layer: merger.py + area_builder.py
- Extracted WebSocket logic: core_ws_client.py
- Separated API routes: modules/api/routes.py
- Created proper module structure with __init__.py

### Code Quality
- Added 100+ docstrings (Google convention)
- Fixed imports (absolute from src.xxx)
- Type annotations on public functions
- Formatted with Ruff

### Compliance
- All files < 300 lines (Forge Phase 15 ✅)
- .gitignore with security patterns
- manifest.json with all required fields
- OnyxClient SDK integration

---

## Resources

- **Repo:** VersoVet/brain3d (GitHub)
- **Port:** 8888 (production), 9888 (dev)
- **Dependencies:** Redis, OnyxCore, onyx-infra
- **Framework:** FastAPI + Three.js
- **Testing:** pytest
- **Validation:** Forge 18 phases
