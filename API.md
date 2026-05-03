# Brain3D API Documentation

**Last Updated:** 2026-04-29

## Overview

Brain3D expose une API REST + WebSocket pour accéder à l'état complet du Cerebellum:
- **Health & Status**: Monitoring et diagnostique
- **Visualization Data**: Machines, skills, areas pour le frontend 3D
- **Real-time Updates**: WebSocket pour live streaming des changements

---

## Base URLs

- **Production**: `http://10.0.0.44:8888`
- **Development**: `http://localhost:9888`

---

## Health & Status

### GET /health
Endpoint de health check pour monitoring.

**Response:** 200 OK
```json
{
  "status": "healthy",
  "service": "brain3d",
  "version": "3.1.0",
  "redis_connected": true,
  "websocket_clients": 5
}
```

### GET /status
Statut détaillé avec info système.

**Response:** 200 OK
```json
{
  "service": "brain3d",
  "version": "3.1.0",
  "redis": {
    "connected": true,
    "channels": ["onyx:events", "onyx:skill:status"]
  },
  "core_url": "http://10.0.0.44:8050",
  "websocket": {
    "clients_connected": 5,
    "messages_sent": 1234
  }
}
```

---

## Visualization Data

### GET /api/state
État complet du réseau (machines, skills, areas).

**Response:** 200 OK
```json
{
  "machines": [
    {
      "node_id": "oxya",
      "hostname": "oxya.local",
      "ip": "10.0.0.44",
      "status": "UP",
      "skills_count": 15,
      "metrics": {
        "cpu_percent": 25.5,
        "ram_percent": 60.2,
        "disk_percent": 45.0
      }
    }
  ],
  "skills": [
    {
      "name": "onyx-core",
      "status": "UP",
      "port": 8050,
      "brain_area": "cerebellum"
    }
  ],
  "areas": [
    {
      "id": "cerebellum",
      "name": "Cerebellum",
      "status": "UP",
      "total_skills": 10,
      "active_skills": 9
    }
  ],
  "total_machines": 3,
  "total_skills": 25
}
```

---

## Machines

### GET /api/machines
Liste de toutes les machines.

**Response:** 200 OK
```json
{
  "machines": [
    {
      "node_id": "oxya",
      "hostname": "oxya.local",
      "ip": "10.0.0.44",
      "platform": "linux",
      "status": "UP",
      "machine_type": "CORE",
      "skills_count": 15
    }
  ],
  "count": 1
}
```

### GET /api/machines/{node_id}
Détail d'une machine spécifique.

**Parameters:**
- `node_id` (path): Machine node ID

**Response:** 200 OK
```json
{
  "node_id": "oxya",
  "hostname": "oxya.local",
  "ip": "10.0.0.44",
  "machine_type": "CORE",
  "status": "UP",
  "skills": [
    {
      "name": "onyx-core",
      "status": "UP",
      "version": "3.0.0"
    }
  ],
  "metrics": {
    "cpu_percent": 25.5,
    "ram_percent": 60.2
  }
}
```

**Response:** 404 Not Found
```json
{
  "error": "Machine not found"
}
```

---

## Skills

### GET /api/skills
Liste des skills du système.

**Query Parameters:**
- `area` (optional): Filter by brain area (e.g., ?area=cerebellum)

**Response:** 200 OK
```json
{
  "skills": [
    {
      "name": "onyx-core",
      "port": 8050,
      "brain_area": "cerebellum",
      "status": "UP",
      "version": "3.0.0",
      "deployed_on": ["oxya"]
    }
  ],
  "count": 25
}
```

### GET /api/skills/{name}
Détail d'un skill spécifique.

**Parameters:**
- `name` (path): Skill name

**Response:** 200 OK
```json
{
  "name": "onyx-core",
  "port": 8050,
  "brain_area": "cerebellum",
  "status": "UP",
  "version": "3.0.0",
  "deployed_on": ["oxya"]
}
```

---

## Brain Areas

### GET /api/areas
Liste des aires cérébrales.

**Response:** 200 OK
```json
{
  "areas": [
    {
      "id": "cerebellum",
      "name": "Cerebellum",
      "status": "UP",
      "total_skills": 10,
      "active_skills": 9
    }
  ]
}
```

### GET /api/areas/{area_id}
Détail d'une aire cérébrale.

**Parameters:**
- `area_id` (path): Brain area ID

**Response:** 200 OK
```json
{
  "id": "cerebellum",
  "name": "Cerebellum",
  "status": "UP",
  "total_skills": 10,
  "active_skills": 9,
  "skills_details": [
    {
      "name": "onyx-core",
      "status": "UP",
      "port": 8050
    }
  ]
}
```

---

## Visual Configuration

### GET /api/visual/{entity_type}/{entity_id}
Configuration visuelle pour entité 3D.

**Parameters:**
- `entity_type`: "machine", "skill", or "area"
- `entity_id`: Entity ID

**Response:** 200 OK
```json
{
  "shape": "sphere",
  "color": "#2ecc71",
  "animation": "pulse"
}
```

---

## State Refresh

### POST /api/refresh
Force le refresh de l'état (utile pour debug).

**Response:** 200 OK
```json
{
  "success": true,
  "state": { ... }  // Full NetworkState
}
```

---

## WebSocket

### WS /ws
Connexion WebSocket pour mises à jour en temps réel.

**Protocol:**
```
ws://10.0.0.44:8888/ws
```

**Events reçus:**

**init** (on connect):
```json
{
  "type": "init",
  "data": { ... }  // Full NetworkState
}
```

**refresh** (skill registered, deploy completed, etc.):
```json
{
  "type": "refresh",
  "reason": "skill:registered",
  "data": { ... }  // Updated NetworkState
}
```

**status_update** (skill status changed):
```json
{
  "type": "status_update",
  "entity_type": "skill",
  "entity_id": "onyx-core",
  "new_status": "UP"
}
```

**metrics_update** (heartbeat with CPU/RAM/disk):
```json
{
  "type": "metrics_update",
  "node_id": "oxya",
  "metrics": {
    "cpu_percent": 25.5,
    "ram_percent": 60.2,
    "disk_percent": 45.0
  }
}
```

---

## Data Sources

### Real-time Channels (Redis)
- `onyx:events` - Système d'événements
- `onyx:skill:status` - Changements de statut
- `onyx:machines` - Événements machines

### REST Endpoints (HTTP)
- **OnyxCore** (10.0.0.44:8050)
  - GET /deploy/nodes
  - GET /skills
  - GET /deploy/matrix
  - WS /ws

- **onyx-infra** (10.0.0.44:8053)
  - GET /devices

### Direct Queries
- **Hearts** (port 8060 per machine)
  - GET http://{machine_ip}:8060/skills

---

## Error Handling

### 500 Internal Server Error
```json
{
  "error": "Redis connection failed",
  "message": "Cannot reach Redis at redis://10.0.0.44:6379"
}
```

### 503 Service Unavailable
```json
{
  "error": "External service unavailable",
  "message": "OnyxCore at http://10.0.0.44:8050 not responding"
}
```

---

## Testing Examples

### Health Check
```bash
curl http://10.0.0.44:8888/health
```

### Get Full State
```bash
curl http://10.0.0.44:8888/api/state | jq '.machines | length'
```

### Get Skills in Cerebellum
```bash
curl "http://10.0.0.44:8888/api/skills?area=cerebellum" | jq '.skills[].name'
```

### Force Refresh
```bash
curl -X POST http://10.0.0.44:8888/api/refresh
```

### WebSocket (wscat)
```bash
wscat -c ws://10.0.0.44:8888/ws
> {"type": "ping"}
```

---

## Rate Limiting

Currently no rate limiting. In production:
- Consider 1000 req/min per IP
- WebSocket: max 100 events/sec per client

---

## Changelog

### v3.1.0 (2026-04-29)
- ✅ Refactored code into modules
- ✅ Reduced file sizes (all < 300 lines)
- ✅ Added comprehensive docstrings
- ✅ Improved type safety

### v3.0.0 (2026-01-04)
- Initial Brain3D implementation
- Three.js visualization with force-directed graph
